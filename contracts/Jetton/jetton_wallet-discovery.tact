import "@stdlib/ownable";
import "./jetton_wallet_discovery_messages.tact";
import "./jetton_wallet.tact";

trait JettonWalletDiscovery {
    receive(msg: ProvideWalletAddress){
        require(context().value >= ton("0.0061"), "Insufficient gas");
        let init: StateInit = initOf JettonWallet(msg.ownerAddress, myAddress());
        if (msg.includeAddress) {
            send(SendParameters{
                    to: sender(),
                    value: 0,
                    mode: SendRemainingValue,
                    body: TakeWalletAddress{
                        queryId: msg.queryId,
                        walletAddress: contractAddress(init),
                        ownerAddress: beginCell().storeBool(true).storeAddress(msg.ownerAddress).endCell().asSlice()
                    }.toCell()
                }
            );
        } else {
            send(SendParameters{
                    to: sender(),
                    value: 0,
                    mode: SendRemainingValue,
                    body: TakeWalletAddress{ // 0xd1735400
                        queryId: msg.queryId,
                        walletAddress: contractAddress(init),
                        ownerAddress: beginCell().storeBool(false).endCell().asSlice()
                    }.toCell()
                }
            );
        }
    }
}