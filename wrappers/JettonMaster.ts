export * from '../build/JettonMaster/tact_JettonMaster';
import { Address, beginCell, Cell, Slice, storeStateInit, toNano } from '@ton/core';
import { Mint, TokenUpdateContent, BurnNotification, Deploy, ChangeOwner, ProvideWalletAddress } from './JettonMaster';
import {
    storeMint,
    storeTokenUpdateContent,
    storeBurnNotification,
    storeDeploy,
    storeChangeOwner,
    storeProvideWalletAddress,
} from './JettonMaster';
import { TonClient, TonClient4 } from '@ton/ton';
import { JettonMaster } from './JettonMaster';

export const MIN_TON_FOR_STORAGE = toNano('0.05');
export const MIN_GAS_FOR_EXCESSES = toNano('0.01');

export const JETTON_DEPLOY_FEE: bigint = MIN_TON_FOR_STORAGE + MIN_GAS_FOR_EXCESSES;
export const JETTON_MINT_FEE: bigint = toNano('0.11');
export const JETTON_UPDATE_CONTENT_FEE: bigint = toNano('0.01');
export const JETTON_WITHDRAW_FEE: bigint = toNano('0.05');
export const JETTON_CLOSE_MINT_FEE: bigint = toNano('0.01');
export const JETTON_CHANGE_OWNER_FEE: bigint = toNano('0.01');
export const JETTON_PROVIDE_WALLET_ADDRESS_FEE: bigint = toNano('0.0061');// + toNano('0.0018'); // on contract you need toNano('0.0061') but from web2 you need more fee

export function toCell(
    message:
        | Mint
        | TokenUpdateContent
        | BurnNotification
        | 'Withdraw'
        | 'Close Mint'
        | Deploy
        | ChangeOwner
        | ProvideWalletAddress,
) {
    let body: Cell | null = null;
    if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Mint') {
        body = beginCell().store(storeMint(message)).endCell();
    }
    if (
        message &&
        typeof message === 'object' &&
        !(message instanceof Slice) &&
        message.$$type === 'TokenUpdateContent'
    ) {
        body = beginCell().store(storeTokenUpdateContent(message)).endCell();
    }
    if (
        message &&
        typeof message === 'object' &&
        !(message instanceof Slice) &&
        message.$$type === 'BurnNotification'
    ) {
        body = beginCell().store(storeBurnNotification(message)).endCell();
    }
    if (message === 'Withdraw') {
        body = beginCell().storeUint(0, 32).storeStringTail(message).endCell();
    }
    if (message === 'Close Mint') {
        body = beginCell().storeUint(0, 32).storeStringTail(message).endCell();
    }
    if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Deploy') {
        body = beginCell().store(storeDeploy(message)).endCell();
    }
    if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'ChangeOwner') {
        body = beginCell().store(storeChangeOwner(message)).endCell();
    }
    if (
        message &&
        typeof message === 'object' &&
        !(message instanceof Slice) &&
        message.$$type === 'ProvideWalletAddress'
    ) {
        body = beginCell().store(storeProvideWalletAddress(message)).endCell();
    }
    if (body === null) {
        throw new Error('Invalid message type');
    }

    return body;
}

export async function deploy(
    api: TonClient | TonClient4,
    ownerAddress: string,
    contentString: string,
    maxSupply: bigint,
) {
    const value = JETTON_DEPLOY_FEE;
    const owner = Address.parse(ownerAddress);

    const contentCell = beginCell()
        .storeUint(1, 8)
        .storeRef(beginCell().storeStringTail(contentString).endCell())
        .endCell();

    const jettonMaster = api.open(await JettonMaster.fromInit(owner, contentCell, maxSupply));

    const msg: Deploy = {
        $$type: 'Deploy',
        queryId: 0n,
    };
    const msgCell = toCell(msg);

    const statInit = beginCell();
    storeStateInit(jettonMaster.init!)(statInit);

    return {
        jettonMasterContract: jettonMaster,
        value: value,
        msg: msg,
        msgCell: msgCell,
        stateInit: statInit.endCell(),
    };
}

export async function mint(
    api: TonClient | TonClient4,
    jettonMasterAddressString: string,
    toAddressString: string,
    amount: bigint,
    responseDestinationAddressString: string,
) {
    const jettonMasterAddress = await Address.parse(jettonMasterAddressString);
    const responseDestination = Address.parse(responseDestinationAddressString);
    const to = Address.parse(toAddressString);
    //open contract
    const jettonMasterContract = api.open(JettonMaster.fromAddress(jettonMasterAddress));

    const msg: Mint = {
        $$type: 'Mint',
        to: to,
        amount: amount,
        responseDestination: responseDestination,
    };

    const msgCell = toCell(msg);

    return {
        jettonMasterContract: jettonMasterContract,
        value: JETTON_MINT_FEE,
        msg: msg,
        msgCell: msgCell,
    };
}

export async function tokenUpdateContent(
    api: TonClient | TonClient4,
    jettonMasterAddressString: string,
    contentString: string,
) {
    if (Buffer.byteLength(contentString, 'utf-8') > 127) {
        throw new Error(`content is too long (max 127 bytes, got ${Buffer.byteLength(contentString, 'utf-8')})`);
    }

    const content = beginCell().storeUint(1, 8).storeStringTail(contentString).endCell();

    const jettonMasterAddress = await Address.parse(jettonMasterAddressString);

    //open contract
    const jettonMasterContract = api.open(JettonMaster.fromAddress(jettonMasterAddress));

    const msg: TokenUpdateContent = {
        $$type: 'TokenUpdateContent',
        content: content,
    };

    const msgCell = toCell(msg);

    return {
        jettonMasterContract: jettonMasterContract,
        value: JETTON_UPDATE_CONTENT_FEE,
        msg: msg,
        msgCell: msgCell,
    };
}

export async function withdraw(api: TonClient | TonClient4, jettonMasterAddressString: string) {
    const value = JETTON_WITHDRAW_FEE;
    const jettonMasterAddress = Address.parse(jettonMasterAddressString);

    const jettonMasterContract = api.open(JettonMaster.fromAddress(jettonMasterAddress));

    const msg = 'Withdraw';
    const msgCell = toCell(msg);

    return {
        jettonMasterContract: jettonMasterContract,
        value: value,
        msg: msg,
        msgCell: msgCell,
    };
}

export async function closeMint(api: TonClient | TonClient4, jettonMasterAddressString: string) {
    const value = JETTON_CLOSE_MINT_FEE;
    const jettonMasterAddress = Address.parse(jettonMasterAddressString);

    const jettonMasterContract = api.open(JettonMaster.fromAddress(jettonMasterAddress));

    const msg = 'Close Mint';
    const msgCell = toCell(msg);

    return {
        jettonMasterContract: jettonMasterContract,
        value: value,
        msg: msg,
        msgCell: msgCell,
    };
}

export async function changeOwner(
    api: TonClient | TonClient4,
    jettonMasterAddressString: string,
    queryId: bigint,
    newOwnerAddressString: string,
) {
    const newOwnerAddress = Address.parse(newOwnerAddressString);
    const jettonMasterAddress = await Address.parse(jettonMasterAddressString);

    //open contract
    const jettonMasterContract = api.open(JettonMaster.fromAddress(jettonMasterAddress));

    const msg: ChangeOwner = {
        $$type: 'ChangeOwner',
        queryId: queryId,
        newOwner: newOwnerAddress,
    };

    const msgCell = toCell(msg);

    return {
        jettonMasterContract: jettonMasterContract,
        value: JETTON_CHANGE_OWNER_FEE,
        msg: msg,
        msgCell: msgCell,
    };
}

///
// get functions
///
export async function getJettonData(api: TonClient | TonClient4, jettonMasterAddressString: string) {
    const jettonMasterAddress = Address.parse(jettonMasterAddressString);
    const jettonMasterContract = api.open(JettonMaster.fromAddress(jettonMasterAddress));

    const data = await jettonMasterContract.getGetJettonData();
    const content = data.content.asSlice().loadStringTail();

    return {
        totalSupply: data.totalSupply,
        mintable: data.mintable,
        owner: data.owner.toString(),
        content: content,
    };
}

export async function getJettonWalletAddress(
    api: TonClient | TonClient4,
    jettonMasterAddressString: string,
    ownerAddress: string,
) {
    const jettonMasterAddress = Address.parse(jettonMasterAddressString);
    const jettonMasterContract = api.open(JettonMaster.fromAddress(jettonMasterAddress));
    const owner = Address.parse(ownerAddress);

    const walletAddress = await jettonMasterContract.getGetWalletAddress(owner);
    return walletAddress.toString();
}

export async function getOwnerAddress(api: TonClient | TonClient4, jettonMasterAddressString: string) {
    const jettonMasterAddress = Address.parse(jettonMasterAddressString);
    const jettonMasterContract = api.open(JettonMaster.fromAddress(jettonMasterAddress));

    const ownerAddress = await jettonMasterContract.getOwner();
    return ownerAddress.toString();
}

export async function getMaxSupply(api: TonClient | TonClient4, jettonMasterAddressString: string) {
    const jettonMasterAddress = Address.parse(jettonMasterAddressString);
    const jettonMasterContract = api.open(JettonMaster.fromAddress(jettonMasterAddress));

    const maxSupply = await jettonMasterContract.getGetMaxSupply();
    return maxSupply;
}
