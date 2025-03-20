export * from '../build/JettonWallet/tact_JettonWallet';
import { Address, beginCell, Cell, Slice, toNano } from '@ton/core';
import { Transfer, InternalTransfer, Burn } from './JettonWallet';
import { storeTransfer, storeInternalTransfer, storeBurn } from './JettonWallet';
import { TonClient, TonClient4 } from '@ton/ton';
import { JettonWallet } from './JettonWallet';

export const JETTON_TRANSFER_FEE: bigint = toNano('0.06');
export const JETTON_BURN_FEE: bigint = toNano('0.05');
export const JETTON_WITHDRAW_FEE: bigint = toNano('0.05');

export const MIN_TONS_FOR_STORAGE: bigint = toNano('0.023');

export function toCell(message: Transfer | InternalTransfer | Burn | 'Withdraw') {
    let body: Cell | null = null;
    if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Transfer') {
        body = beginCell().store(storeTransfer(message)).endCell();
    }
    if (
        message &&
        typeof message === 'object' &&
        !(message instanceof Slice) &&
        message.$$type === 'InternalTransfer'
    ) {
        body = beginCell().store(storeInternalTransfer(message)).endCell();
    }
    if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Burn') {
        body = beginCell().store(storeBurn(message)).endCell();
    }
    if (message === 'Withdraw') {
        body = beginCell().storeUint(0, 32).storeStringTail(message).endCell();
    }
    if (body === null) {
        throw new Error('Invalid message type');
    }

    return body;
}

export async function transfer(
    api: TonClient | TonClient4,
    jettonWalletAddressString: string,
    queryId: bigint,
    amount: bigint,
    destinationAddressString: string,
    responseDestinationAddressString: string,
    forwardAmount: bigint,
    commentString?: string,
) {
    const jettonWalletAddress = Address.parse(jettonWalletAddressString);
    const destination = Address.parse(destinationAddressString);
    const responseDestination = Address.parse(responseDestinationAddressString);

    let forwardPayloadCell = Cell.EMPTY;

    if(commentString) {
        const commentCell = beginCell().storeUint(0, 32).storeStringTail(commentString).endCell();
        forwardPayloadCell = beginCell().storeBit(1).storeRef(commentCell).endCell();
    }

    const forwardPayload: Slice = forwardPayloadCell.beginParse();

    const adjustedForwardAmount = commentString ? BigInt(1) : forwardAmount;

    const jettonWalletContract = api.open(JettonWallet.fromAddress(jettonWalletAddress));

    const customPayload = Cell.EMPTY;

    const msg: Transfer = {
        $$type: 'Transfer',
        queryId: queryId,
        amount: amount,
        destination: destination,
        responseDestination: responseDestination,
        customPayload: customPayload,
        forwardTonAmount: adjustedForwardAmount,
        forwardPayload: forwardPayload,
    };

    const msgCell = toCell(msg);

    return {
        jettonWalletContract: jettonWalletContract,
        value: JETTON_TRANSFER_FEE + adjustedForwardAmount,
        msg: msg,
        msgCell: msgCell,
    };
}

export async function burn(
    api: TonClient | TonClient4,
    jettonWalletAddressString: string,
    queryId: bigint,
    amount: bigint,
    responseDestinationAddressString: string,
) {
    const jettonWalletAddress = await Address.parse(jettonWalletAddressString);
    const responseDestination = Address.parse(responseDestinationAddressString);

    //open contract
    const jettonWalletContract = api.open(JettonWallet.fromAddress(jettonWalletAddress));

    const msg: Burn = {
        $$type: 'Burn',
        queryId: queryId,
        amount: amount,
        responseDestination: responseDestination,
        customPayload: Cell.EMPTY,
    };

    const msgCell = toCell(msg);

    return {
        jettonWalletContract: jettonWalletContract,
        value: JETTON_BURN_FEE,
        msg: msg,
        msgCell: msgCell,
    };
}

///
// get functions
///

export async function getJettonWalletData(api: TonClient | TonClient4, jettonWalletAddressString: string) {
    const jettonWalletAddress = Address.parse(jettonWalletAddressString);
    const jettonWalletContract = api.open(JettonWallet.fromAddress(jettonWalletAddress));

    const data = await jettonWalletContract.getGetWalletData();

    return {
        balance: data.balance,
        masterAddress: data.master.toString(),
        ownerAddress: data.owner.toString(),
    };
}
