import "@stdlib/ownable";
import "./jettons_owner.tact";

message Withdraw {
    amount: Int as coins;
    tokenWallet: Address?; // null = TONCOIN
}

trait WithdrawableJettonsOwner with OwnableTransferable, JettonsOwner {
    owner: Address;

    receive(request: Withdraw){
        self.requireOwner();
        self.requireWithdrawSpecialCondition(request);
        
        if (request.tokenWallet == null && request.amount != 0) {
            send(SendParameters{
                bounce: false,
                to: self.owner,
                value: request.amount,
                mode: SendRemainingBalance | SendIgnoreErrors
            });
            return ;
        } else if (request.tokenWallet == null && request.amount == 0) {
            // If the requested amount is 0, withdraw all TON and destroy the contract
            send(SendParameters{
                bounce: false,
                to: self.owner,
                value: request.amount, 
                mode: SendRemainingBalance | SendDestroyIfZero
            });
            return ;
        }
        self.sendTokens(request.tokenWallet!!, TokenTransfer{
            queryId: now(),
            amount: request.amount,
            destination: self.owner,
            responseDestination: sender(),
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: emptySlice()
        });
    }

    virtual fun requireWithdrawSpecialCondition(request: Withdraw) {
    }
}