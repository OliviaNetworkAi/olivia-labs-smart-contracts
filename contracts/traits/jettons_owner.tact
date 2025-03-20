message(0xf8a7ea5) TokenTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    responseDestination: Address;
    customPayload: Cell?;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}
message(0x7362d09c) TokenNotification {
    queryId: Int as uint64;
    amount: Int as coins;
    from: Address;
    forwardPayload: Slice as remaining; 
}

trait JettonsOwner {
    virtual fun onTokenNotification(notification: TokenNotification) {
        require(false, "Should be overriden");
    }
    
    receive(notification: TokenNotification) {
        self.onTokenNotification(notification);
    }
    
    fun sendTokens(jettonWallet: Address, msg: TokenTransfer) {
        msg = self.fixForwardPayload(msg);
        send(SendParameters{
            to: jettonWallet, 
            value: 0,
            bounce: true,
            mode: SendRemainingBalance,
            body: msg.toCell()
        });
    }

    fun sendTokensWithValue(jettonWallet: Address, msg: TokenTransfer, value: Int) {
        msg = self.fixForwardPayload(msg);
        send(SendParameters{
            to: jettonWallet, 
            value: value,
            bounce: true,
            mode: SendPayGasSeparately,
            body: msg.toCell()
        });
    }

    fun fixForwardPayload(msg: TokenTransfer): TokenTransfer {
        if (msg.forwardPayload.empty()) {
            // it is expected that payload contains at least 1 bit
            msg.forwardPayload = beginCell().storeBool(false).endCell().asSlice();
        }
        return msg;
    }
}
