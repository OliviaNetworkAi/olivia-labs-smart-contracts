trait ExcessestSender {
    fun sendExcesses(storageAmount: Int, to: Address) {
        nativeReserve(storageAmount, ReserveAtMost);
        send(SendParameters{
            bounce: false, 
            to: to,
            value: 0, 
            mode: SendRemainingBalance | SendIgnoreErrors}
        );
    }
}