import "@stdlib/ownable";
import "./jetton_wallet.tact";
import "./jetton_wallet-discovery.tact";
import "../traits/deploy_message.tact";
import "../traits/excessest_sender.tact";

struct JettonData {
    totalSupply: Int;
    mintable: Bool;
    owner: Address;
    content: Cell;
    walletCode: Cell;
}

contract JettonMaster with OwnableTransferable, JettonWalletDiscovery, ExcessestSender {
    const MIN_TONS_FOR_STORAGE: Int = ton("0.05");

    totalSupply: Int;
    mintable: Bool;
    owner: Address;
    content: Cell;
    maxSupply: Int as coins;
    init(owner: Address, content: Cell, maxSupply: Int){
        self.totalSupply = 0;
        self.owner = owner;
        self.mintable = true;
        self.content = content;
        self.maxSupply = maxSupply;
    }

    receive(deploy: Deploy) {
        require(myBalance() >= (self.MIN_TONS_FOR_STORAGE), "Not enough TON");
        self.sendExcesses(self.MIN_TONS_FOR_STORAGE, sender());
    }

    receive(msg: Mint){
        self.requireOwner();
        require(self.mintable, "Minting is disabled");
        require((self.totalSupply + msg.amount) <= self.maxSupply, "Maximum supply exceeded");
        self.mint(msg.to, msg.amount, msg.responseDestination);
    }

    receive(msg: TokenUpdateContent){
        self.requireOwner();
        self.content = msg.content;
        self.sendExcesses(self.MIN_TONS_FOR_STORAGE, sender());
    }

    receive(msg: BurnNotification){
        self.requireWallet(msg.sender);
        self.totalSupply = self.totalSupply - msg.amount;
        if (msg.responseDestination != null) {
            send(SendParameters{
                    to: msg.responseDestination!!,
                    value: 0,
                    bounce: false,
                    mode: SendRemainingValue + SendIgnoreErrors,
                    body: Excesses{queryId: msg.queryId}.toCell()
                }
            );
        }
    }

    receive("Withdraw"){
        self.requireOwner();
        require(myBalance() > self.MIN_TONS_FOR_STORAGE, "No funds to withdraw");
        self.sendExcesses(self.MIN_TONS_FOR_STORAGE, sender());
    }

    receive("Close Mint"){
        self.requireOwner();
        self.mintable = false;
    }

    fun mint(to: Address, amount: Int, responseDestination: Address) {
        self.totalSupply = self.totalSupply + amount;
        let jettonWalletInit: StateInit = self.getJettonWalletInit(to);
        send(SendParameters{
                to: contractAddress(jettonWalletInit),
                value: 0,
                bounce: false,
                mode: SendRemainingValue,
                body: InternalTransfer{
                    queryId: 0,
                    amount: amount,
                    from: myAddress(),
                    responseAddress: responseDestination,
                    forwardTonAmount: 0,
                    forwardPayload: emptySlice() 
                }.toCell(),
                code: jettonWalletInit.code,
                data: jettonWalletInit.data
            }
        );
        if (self.totalSupply == self.maxSupply) {
            self.mintable = false;
        }
        self.sendExcesses(self.MIN_TONS_FOR_STORAGE, sender());
    }

    fun requireWallet(owner: Address) {
        let ctx: Context = context();
        let jettonWalletInit: StateInit = self.getJettonWalletInit(owner);
        require(contractAddress(jettonWalletInit) == ctx.sender, "Invalid sender");
    }

    fun getJettonWalletInit(address: Address): StateInit {
        return initOf JettonWallet(address, myAddress());
    }

    get fun get_jetton_data(): JettonData {
        let code: Cell = self.getJettonWalletInit(myAddress()).code;
        return
            JettonData{
                totalSupply: self.totalSupply,
                mintable: self.mintable,
                owner: self.owner,
                content: self.content,
                walletCode: code
            };
    }

    get fun get_wallet_address(owner: Address): Address {
        let jettonWalletInit: StateInit = self.getJettonWalletInit(owner);
        return contractAddress(jettonWalletInit);
    }

    get fun get_max_supply(): Int {
        return self.maxSupply;
    } 
}