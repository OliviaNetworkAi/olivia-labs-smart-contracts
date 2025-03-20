import "./jetton_messages.tact";
import "../traits/excessest_sender.tact";

struct JettonWalletData {
    balance: Int;
    owner: Address;
    master: Address;
    walletCode: Cell;
}

contract JettonWallet with ExcessestSender {
    const MIN_TONS_FOR_STORAGE: Int = ton("0.023");
    const MAX_TX_GAS_PRICE: Int = ton("0.013");

    owner: Address;
    master: Address;
    balance: Int as coins;
    init(owner: Address, master: Address){
        self.balance = 0;
        self.owner = owner;
        self.master = master;
    }

    receive(msg: Transfer){
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Invalid sender");
        let fwdFee: Int = ctx.readForwardFee() + ctx.readForwardFee();
        let minValueRequire: Int = ((fwdFee + (2 * self.MAX_TX_GAS_PRICE)) + self.MIN_TONS_FOR_STORAGE) + msg.forwardTonAmount;
        require(ctx.value > minValueRequire, "Invalid value! need more value");
        self.balance = self.balance - msg.amount;
        require(self.balance >= 0, "Invalid balance");
        let init: StateInit = initOf JettonWallet(msg.destination, self.master);
        let walletAddress: Address = contractAddress(init);
        send(SendParameters{
                to: walletAddress,
                value: 0,
                bounce: false,
                mode: SendRemainingValue,
                body: InternalTransfer{
                    queryId: msg.queryId,
                    amount: msg.amount,
                    from: self.owner,
                    responseAddress: msg.responseDestination,
                    forwardTonAmount: msg.forwardTonAmount,
                    forwardPayload: msg.forwardPayload
                }.toCell(),
                code: init.code,
                data: init.data
            }
        );
    }

    receive(msg: InternalTransfer){
        let ctx: Context = context();
        if (ctx.sender != self.master) {
            let senderStateInit: StateInit = initOf JettonWallet(msg.from, self.master);
            require(ctx.sender == contractAddress(senderStateInit), "Invalid sender");
        }
        //update balance
        self.balance = self.balance + msg.amount;
        require(self.balance >= 0, "Invalid balance");
        //get value for gas
        let msgValue: Int = self.msgValue(ctx.value);
        let fwdFee: Int = ctx.readForwardFee();
        if (msg.forwardTonAmount > 0) {
            msgValue = (msgValue - msg.forwardTonAmount) - fwdFee;
            send(SendParameters{
                    to: self.owner,
                    value: msg.forwardTonAmount,
                    mode: SendPayGasSeparately,
                    bounce: false,
                    body: TransferNotification{
                        queryId: msg.queryId,
                        amount: msg.amount,
                        sender: msg.from,
                        forwardPayload: msg.forwardPayload
                    }.toCell()
                }
            );
        }
        nativeReserve(self.MIN_TONS_FOR_STORAGE, ReserveAtMost);
        if (msg.responseAddress != null && msgValue > 0) {
            send(SendParameters{
                    to: msg.responseAddress!!,
                    value: msgValue,
                    mode: SendPayGasSeparately,
                    bounce: false,
                    body: Excesses{queryId: msg.queryId}.toCell()
                }
            );
        }
    }

    receive(msg: Burn){
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Invalid sender");
        self.balance = self.balance - msg.amount;
        require(self.balance >= 0, "Invalid balance");
        let fwdFee: Int = ctx.readForwardFee();
        require(ctx.value > ((fwdFee + (2 * self.MAX_TX_GAS_PRICE)) + self.MIN_TONS_FOR_STORAGE), "Invalid value - Burn");
        send(SendParameters{
                to: self.master,
                value: 0,
                mode: SendRemainingValue,
                bounce: true,
                body: BurnNotification{
                    queryId: msg.queryId,
                    amount: msg.amount,
                    sender: self.owner,
                    responseDestination: self.owner
                }.toCell()
            }
        );
    }

    receive("Withdraw"){
        let context: Context = context();
        require(context.sender == self.owner, "not owner");
        require(myBalance() > self.MIN_TONS_FOR_STORAGE, "No funds to withdraw");
        self.sendExcesses(self.MIN_TONS_FOR_STORAGE, sender());
    }

    get fun msgValue(value: Int): Int {
        let valueFromMsg: Int = value;
        let tonBalanceBeforeMsg: Int = myBalance() - valueFromMsg;
        let storageFee: Int = self.MIN_TONS_FOR_STORAGE - min(tonBalanceBeforeMsg, self.MIN_TONS_FOR_STORAGE);
        valueFromMsg = valueFromMsg - (storageFee + self.MAX_TX_GAS_PRICE);
        return valueFromMsg;
    }

    bounced(src: bounced<InternalTransfer>){
        self.balance = self.balance + src.amount;
    }

    bounced(src: bounced<BurnNotification>){
        self.balance = self.balance + src.amount;
    }

    get fun get_wallet_data(): JettonWalletData {
        return
            JettonWalletData{
                balance: self.balance,
                owner: self.owner,
                master: self.master,
                walletCode: initOf JettonWallet(self.owner, self.master).code
            };
    }
}