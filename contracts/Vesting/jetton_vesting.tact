import "../traits/withdrawable.tact";

struct VestingConfig {
    isCadencePrivate: Bool = false;
    tgeAt: Int as uint64;// time of the projecy will start 
    startAt: Int as uint64; // start time of the vesting in seconds since the UNIX epoch
    durationSeconds: Int as uint64; // duration of the whole vesting period in seconds
    vestingCadence: Int as uint64; // duration of an interval for the vesting in seconds

    /// The timestamp after which beneficiaries can no longer claim tokens,  
    /// and the owner is allowed to withdraw the remaining tokens.  
    /// Must be `0` (meaning the owner can never withdraw unclaimed tokens)  
    /// or a timestamp greater than `startAt + durationSeconds`.
    claimDeadline: Int as uint64;
}

//need storage per year < 650_000 nanoTon. let's round to 0.001 TON for reliability 
struct VestingRecordValue {
    amountOnTGE: Int as coins; // amount of tokens to be released at the TGE
    amountInVesting: Int as coins; // total amount of tokens to be released at the very end
    releasedAmount: Int as coins; // amount of tokens already released
    lastQueryId: Int as uint64; // reentrancy guard
}

//for get methods
struct BeneficiaryStateData {
    beneficiary: Address;
    totalAmount: Int as coins;
    amountOnTGE: Int as coins;
    lockedAmount: Int as coins;
    releasedAmount: Int as coins;
    releasableAmount: Int as coins;
    lastQueryId: Int as uint64;
}

//Add or update a recipient
message SetBeneficiary {
    beneficiary: Address;
    totalAmount: Int as coins;
    amountOnTGE: Int as coins;
}

message RemoveBeneficiary {
    beneficiary: Address;
}

//"Start vesting" - msg for start the vesting process

message Claim {
    queryId: Int as uint64;
    beneficiary: Address;
    responseTo: Address?;
}

message ChangeAllocator {
    newAllocator: Address?;
}

message Deploy {
    tokenWallet: Address;
    allocator: Address?;
}

const MIN_STATIC_STORAGE: Int = ton("0.05"); //for year
const MIN_STORAGE_FOR_RECORD: Int = ton("0.001"); //for year
const MIN_CLIAM_VALUE: Int = ton("0.3");
const RESERVE_BALANCE_ON_CLAIM: Int = ton("0.05"); //if no one has used it for a long time

contract JettonVesting with WithdrawableJettonsOwner {
    index: Int? as uint32; // can be used to create different contracts with the same params
    isConfirmed: Bool = false; //is vesting logic confirmed
    owner: Address;
    allocator: Address?; // has a right to send tokens to include them in vesting
    tokenWallet: Address?;
    
    config: VestingConfig;

    records: map<Address, VestingRecordValue>;
    lengthOfRecords : Int = 0; // number of records
    const MaxRecordsMapSize: Int = 2_500; // max number of records
    totalAmount: Int as coins = 0;
    totalReleasedAmount: Int as coins = 0;

    init(index: Int?, config: VestingConfig) {
        require(config.durationSeconds > 0, "Vesting duration must be greater than 0");
        require(config.vestingCadence > 0, "Vesting cadence must be greater than 0");

        require(
            config.claimDeadline == 0 || config.claimDeadline > (config.startAt + config.durationSeconds), 
            "Invalid claimDeadline: must be 0 or greater than startAt + durationSeconds"
        );
        require(config.tgeAt <= config.startAt, "TGE time must be less than or equal to startAt");
        // deployer becomes owner
        self.owner = sender();
        self.index = index;
        self.config = config;
        self.records = emptyMap();
    }

    receive(request: Deploy) {
        self.requireOwner();
        require(self.tokenWallet == null, "Already deployed");
        self.tokenWallet = request.tokenWallet;
        self.allocator = request.allocator;
    }

    receive(request: SetBeneficiary) {
        require(
            sender() == self.owner ||
            sender() == self.allocator,
            "No access"
        );
        require(!self.isConfirmed, "Vesting has already started");
        require(request.totalAmount > 0, "Amount must be > 0");
        require(request.beneficiary != self.tokenWallet, "Token wallet cannot be a recipient");
        require(request.totalAmount >= request.amountOnTGE, "AmountOnTGE must be <= totalAmount");
        
        self.setToVesting(request.beneficiary, request.totalAmount, request.amountOnTGE);
        self.sendExcesses(sender());
    }

    receive(request: RemoveBeneficiary) {
        require(
            sender() == self.owner ||
            sender() == self.allocator,
            "No access"
        );
        require(!self.isConfirmed, "Vesting has already started");
        self.removeFromVesting(request.beneficiary);
        self.sendExcesses(sender());
    }

    override fun onTokenNotification(notification: TokenNotification) {
        // we don't care about unknown tokens and unknown senders
        if (notification.from != self.tokenWallet) {
            return;
        }
    }

    receive(request: Claim) {
        require(self.isConfirmed, "Vesting should be confirmed");
        require(context().value >= MIN_CLIAM_VALUE , "Not enough value");
        require(
            sender() == request.beneficiary || 
            sender() == self.owner ||
            sender() == self.allocator,
            "No access"
        );
        let recordOpt: VestingRecordValue? = self.records.get(request.beneficiary); 
        require(recordOpt != null, "Not found");
        let record: VestingRecordValue = recordOpt!!;

        require(request.queryId > record.lastQueryId, "Bad query");
        record.lastQueryId = request.queryId;

        let releasableAmount: Int = self.computeReleasableAmount(record, now());
        require(releasableAmount > 0, "Nothing to claim");

        record.releasedAmount += releasableAmount;
        self.records.set(request.beneficiary, record);

        self.totalReleasedAmount += releasableAmount;

        let responseDestination: Address = request.responseTo != null ? 
            request.responseTo!! : sender();

        let balanceBefore = myBalance() - context().value;
        if(balanceBefore <= self.getMinStorage() + RESERVE_BALANCE_ON_CLAIM) {
            nativeReserve(balanceBefore + RESERVE_BALANCE_ON_CLAIM, ReserveAtMost);
        } else {
            nativeReserve(balanceBefore, ReserveAtMost);
        }
        
        // sends tokens & all excesses
        self.sendTokens(self.tokenWallet!!, TokenTransfer{
            queryId: request.queryId,
            amount: releasableAmount,
            destination: request.beneficiary,
            responseDestination: responseDestination,
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: emptySlice()
        });
    }

    receive(request: ChangeAllocator) {
        self.requireOwner();
        self.allocator = request.newAllocator;
        self.sendExcesses(sender());
    }

    receive("Confirm"){
        self.requireOwner();
        self.isConfirmed = true;
        self.sendExcesses(sender());
    }

    /// 
    //  The owner can claim token 
    //  - before confirm 
    //  - claimDeadline = 0 and all beneficiaries claimed tokens
    //  - after claimDeadline > start + duration
    ///
    override fun requireWithdrawSpecialCondition(request: Withdraw) {
        if ((request.tokenWallet == null && request.amount != 0) || request.tokenWallet != null) {
            nativeReserve(self.getMinStorage(), ReserveAtMost);
        }

        if (self.isConfirmed) {
            let isDeadlineReached = self.config.claimDeadline > 0 && now() >= self.config.claimDeadline;
            require(isDeadlineReached || self.totalAmount == self.totalReleasedAmount, "Claim deadline not reached or vesting still active");
        }
    }

    fun setToVesting(beneficiary: Address, totalAmount: Int, amountOnTGE: Int) {        
        let existingRecordOpt: VestingRecordValue? = self.records.get(beneficiary);
        if(existingRecordOpt == null) {
            require(self.lengthOfRecords <= self.MaxRecordsMapSize, "Max number of records reached");
            existingRecordOpt = VestingRecordValue{
                amountOnTGE: 0,
                amountInVesting: 0,
                releasedAmount: 0,
                lastQueryId: 0
            };
            self.lengthOfRecords += 1;
        }

        let record: VestingRecordValue = existingRecordOpt!!;

        self.totalAmount -= (record.amountInVesting + record.amountOnTGE);
        record.amountInVesting = totalAmount - amountOnTGE;
        record.amountOnTGE = amountOnTGE;
        self.totalAmount += totalAmount;

        self.records.set(beneficiary, record);
    }

    fun removeFromVesting(beneficiary: Address) {
        let recordOpt: VestingRecordValue? = self.records.get(beneficiary);
        require(recordOpt != null, "Not found");
        let record: VestingRecordValue = recordOpt!!;

        self.totalAmount -= (record.amountInVesting + record.amountOnTGE);
        self.records.del(beneficiary);
        self.lengthOfRecords -= 1;
    }

    fun computeReleasableAmount(record: VestingRecordValue, atMoment: Int): Int {
        if (atMoment < self.config.tgeAt) {
            return 0;
        } 

        let startAt: Int = self.config.startAt;
        let duration: Int = self.config.durationSeconds;
        let amountOnTGE: Int = record.amountOnTGE;

        let totalReleasableAmount: Int = amountOnTGE;
    
        if (atMoment >= startAt + duration) {
            return totalReleasableAmount + record.amountInVesting - record.releasedAmount;
        }
        
        if(atMoment >= startAt) {
            let interval: Int = self.config.vestingCadence;
            // Number of full vesting intervals that have elapsed
            let numberOfIntervals: Int = (atMoment - startAt) / interval;
            let vestedSeconds: Int = numberOfIntervals * interval;
            // Compute the amount of tokens that can be realesed
            totalReleasableAmount += (record.amountInVesting * vestedSeconds) / duration;
        }

        return totalReleasableAmount - record.releasedAmount;
    }

    fun sendExcesses(to: Address) {
        nativeReserve(self.getMinStorage(), ReserveAtMost);
        send(SendParameters{
            bounce: false,
            to: to,
            value: 0,
            mode: SendRemainingBalance | SendIgnoreErrors
        });
    }

    fun getMinStorage(): Int {
        return (MIN_STATIC_STORAGE + self.lengthOfRecords*MIN_STORAGE_FOR_RECORD);
    }

    get fun minStorageValue() : Int {
        return self.getMinStorage();
    }

    get fun allRecords(): map<Address, VestingRecordValue> {
        return self.records;
    }

    get fun config(): VestingConfig {
        if(self.config.isCadencePrivate) {
            return VestingConfig{
                isCadencePrivate: true,
                tgeAt: self.config.tgeAt,
                startAt: self.config.startAt,
                durationSeconds: self.config.durationSeconds,
                vestingCadence: 0,
                claimDeadline: self.config.claimDeadline
            };
        }
        return self.config;
    }

    get fun confirmed(): Bool {
        return self.isConfirmed;
    }

    get fun index(): Int? {
        return self.index;
    }

    get fun allocator(): Address? {
        return self.allocator;
    }

    get fun tokenWallet(): Address {
        return self.tokenWallet!!;
    }

    get fun totalAmount(): Int {
        return self.totalAmount;
    }

    get fun totalReleasedAmount(): Int {
        return self.totalReleasedAmount;
    }

    get fun releasableAmount(beneficiary: Address, dateInSeconds: Int?): Int {
        let record: VestingRecordValue = self.records.get(beneficiary)!!;
        let atMoment: Int = dateInSeconds != null ? dateInSeconds!! : now();
        return self.computeReleasableAmount(record, atMoment);
    }

    get fun beneficiaryRecord(beneficiary: Address, dateInSeconds: Int?): BeneficiaryStateData {
        let atMoment: Int = dateInSeconds != null ? dateInSeconds!! : now();
        let record: VestingRecordValue? = self.records.get(beneficiary);
        let res: BeneficiaryStateData = BeneficiaryStateData{
            beneficiary: beneficiary,
            totalAmount : 0,
            amountOnTGE: 0,
            lockedAmount: 0,
            releasedAmount: 0,
            releasableAmount : 0,
            lastQueryId : 0
        };
        if (record != null) {
            res.totalAmount = record!!.amountInVesting + record!!.amountOnTGE;
            res.amountOnTGE = record!!.amountOnTGE;
            res.releasedAmount = record!!.releasedAmount;
            res.lockedAmount = record!!.amountInVesting + record!!.amountOnTGE - record!!.releasedAmount;
            res.releasableAmount = self.computeReleasableAmount(record!!, atMoment);
            res.lastQueryId = record!!.lastQueryId;
        }

        return res;
    }
}
