export * from '../build/JettonVesting/tact_JettonVesting';
import { Address, beginCell, Cell, Dictionary, Slice, storeStateInit, toNano } from '@ton/core';
import { TonClient, TonClient4 } from '@ton/ton';
import {
    Deploy,
    SetBeneficiary,
    RemoveBeneficiary,
    Claim,
    ChangeAllocator,
    Withdraw,
    ChangeOwner,
    TokenNotification,
} from './JettonVesting';
import {
    storeDeploy,
    storeSetBeneficiary,
    storeRemoveBeneficiary,
    storeClaim,
    storeChangeAllocator,
    storeWithdraw,
    storeChangeOwner,
    storeTokenNotification,
} from './JettonVesting';

import { JettonVesting, VestingConfig } from './JettonVesting';
import { release } from 'os';
import { getJettonWalletAddress } from './JettonMaster';
import { VestingRecordValue } from './JettonVesting';

export const VESTING_DEPLOY_FEE: bigint = toNano('0.1');
export const VESTING_SET_BENEFICIARY_FEE: bigint = toNano('0.05');
export const VESTING_REMOVE_BENEFICIARY_FEE: bigint = toNano('0.05');
export const VESTING_CLAIM_FEE: bigint = toNano('0.3');
export const VESTING_CHANGE_ALLOCATOR_FEE: bigint = toNano('0.05');
export const CONFIRM_FEE: bigint = toNano('0.05');
export const WITHDRAW_FEE: bigint = toNano('0.1');
export const VESTING_CHANGE_OWNER_FEE: bigint = toNano('0.05');

const MIN_STATIC_STORAGE: bigint = toNano('0.05');
const MIN_STORAGE_FOR_RECORD: bigint = toNano('0.001');

export function toCell(
    message:
        | Deploy
        | SetBeneficiary
        | RemoveBeneficiary
        | Claim
        | ChangeAllocator
        | 'Confirm'
        | Withdraw
        | ChangeOwner
        | TokenNotification,
) {
    let body: Cell | null = null;
    if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Deploy') {
        body = beginCell().store(storeDeploy(message)).endCell();
    }
    if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'SetBeneficiary') {
        body = beginCell().store(storeSetBeneficiary(message)).endCell();
    }
    if (
        message &&
        typeof message === 'object' &&
        !(message instanceof Slice) &&
        message.$$type === 'RemoveBeneficiary'
    ) {
        body = beginCell().store(storeRemoveBeneficiary(message)).endCell();
    }
    if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Claim') {
        body = beginCell().store(storeClaim(message)).endCell();
    }
    if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'ChangeAllocator') {
        body = beginCell().store(storeChangeAllocator(message)).endCell();
    }
    if (message === 'Confirm') {
        body = beginCell().storeUint(0, 32).storeStringTail(message).endCell();
    }
    if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Withdraw') {
        body = beginCell().store(storeWithdraw(message)).endCell();
    }
    if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'ChangeOwner') {
        body = beginCell().store(storeChangeOwner(message)).endCell();
    }
    if (
        message &&
        typeof message === 'object' &&
        !(message instanceof Slice) &&
        message.$$type === 'TokenNotification'
    ) {
        body = beginCell().store(storeTokenNotification(message)).endCell();
    }
    if (body === null) {
        throw new Error('Invalid message type');
    }

    return body;
}

export async function deploy(
    api: TonClient | TonClient4,
    index: bigint | null,
    jettonMasterAddressString: string,
    allocatorAddressString: string | null,
    isCadencePrivate: boolean,
    tgeAt: bigint,
    startAt: bigint,
    durationSeconds: bigint,
    vestingCadence: bigint,
    claimDeadline: bigint = 0n, // 0 means no deadline
) {
    const value = VESTING_DEPLOY_FEE;

    const allocatorAddress = allocatorAddressString ? Address.parse(allocatorAddressString) : null;

    const vestingConfig: VestingConfig = {
        $$type: 'VestingConfig',
        isCadencePrivate: isCadencePrivate,
        tgeAt: tgeAt,
        startAt: startAt,
        durationSeconds: durationSeconds,
        vestingCadence: vestingCadence,
        claimDeadline: claimDeadline,
    };

    const vestingContract = api.open(await JettonVesting.fromInit(index, vestingConfig));

    const tokenWalletAddress = await getJettonWalletAddress(
        api,
        jettonMasterAddressString,
        vestingContract.address.toString(),
    );

    const msg: Deploy = {
        $$type: 'Deploy',
        tokenWallet: Address.parse(tokenWalletAddress),
        allocator: allocatorAddress,
    };
    const msgCell = toCell(msg);

    const statInit = beginCell();

    storeStateInit(vestingContract.init!)(statInit);

    return {
        vestingContract: vestingContract,
        value: value,
        msg: msg,
        msgCell: msgCell,
        stateInit: statInit.endCell(),
    };
}

export async function setBeneficiary(
    api: TonClient | TonClient4,
    vestingAddressString: string,
    beneficiaryAddressString: string,
    totalAmount: bigint,
    amountOnTGE: bigint,
) {
    const vestingAddress = await Address.parse(vestingAddressString);
    const beneficiaryAddress = await Address.parse(beneficiaryAddressString);

    //open contract
    const vestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const msg: SetBeneficiary = {
        $$type: 'SetBeneficiary',
        beneficiary: beneficiaryAddress,
        totalAmount: totalAmount,
        amountOnTGE: amountOnTGE,
    };

    const msgCell = toCell(msg);

    return {
        vestingContract: vestingContract,
        value: VESTING_SET_BENEFICIARY_FEE,
        msg: msg,
        msgCell: msgCell,
    };
}

export async function removeBeneficiary(
    api: TonClient | TonClient4,
    vestingAddressString: string,
    beneficiaryAddressString: string,
) {
    const vestingAddress = await Address.parse(vestingAddressString);
    const beneficiaryAddress = await Address.parse(beneficiaryAddressString);

    //open contract
    const vestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const msg: RemoveBeneficiary = {
        $$type: 'RemoveBeneficiary',
        beneficiary: beneficiaryAddress,
    };

    const msgCell = toCell(msg);

    return {
        vestingContract: vestingContract,
        value: VESTING_REMOVE_BENEFICIARY_FEE,
        msg: msg,
        msgCell: msgCell,
    };
}

export async function claim(
    api: TonClient | TonClient4,
    vestingAddressString: string,
    queryId: bigint,
    beneficiaryAddressString: string,
    responseToAddressString: string,
) {
    const vestingAddress = await Address.parse(vestingAddressString);
    const beneficiaryAddress = await Address.parse(beneficiaryAddressString);
    const responseToAddress = await Address.parse(responseToAddressString);

    //open contract
    const vestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const msg: Claim = {
        $$type: 'Claim',
        queryId: queryId,
        beneficiary: beneficiaryAddress,
        responseTo: responseToAddress,
    };

    const msgCell = toCell(msg);

    return {
        vestingContract: vestingContract,
        value: VESTING_CLAIM_FEE,
        msg: msg,
        msgCell: msgCell,
    };
}

export async function changeAllocator(
    api: TonClient | TonClient4,
    vestingAddressString: string,
    newAllocatorAddressString: string,
) {
    const newAllocatorAddress = Address.parse(newAllocatorAddressString);
    const vestingAddress = await Address.parse(vestingAddressString);

    //open contract
    const vestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const msg: ChangeAllocator = {
        $$type: 'ChangeAllocator',
        newAllocator: newAllocatorAddress,
    };

    const msgCell = toCell(msg);

    return {
        vestingContract: vestingContract,
        value: VESTING_CHANGE_ALLOCATOR_FEE,
        msg: msg,
        msgCell: msgCell,
    };
}

export async function confirm(api: TonClient | TonClient4, vestingAddressString: string) {
    const value = CONFIRM_FEE;
    const vestingAddress = Address.parse(vestingAddressString);

    const vestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const msg = 'Confirm';
    const msgCell = toCell(msg);

    return {
        vestingContract: vestingContract,
        value: value,
        msg: msg,
        msgCell: msgCell,
    };
}

//can work not stable
export async function withdrawExcesses(
    api: TonClient | TonClient4,
    jettonVestingAddressString: string
) {
    const value = WITHDRAW_FEE;
    const jettonVestingAddress = Address.parse(jettonVestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(jettonVestingAddress));

    const msg: Withdraw = {
        $$type: 'Withdraw',
        amount: 1n,
        tokenWallet: null
    };
    const msgCell = toCell(msg);

    return {
        jettonVestingContract: jettonVestingContract,
        value: value,
        msg: msg,
        msgCell: msgCell,
    };
}

export async function closeContractAndWithdrawOnlyTON(
    api: TonClient | TonClient4,
    jettonVestingAddressString: string
) {
    const value = WITHDRAW_FEE;
    const jettonVestingAddress = Address.parse(jettonVestingAddressString);

    const jettonVestingContract = api.open(JettonVesting.fromAddress(jettonVestingAddress));

    (await api.provider(jettonVestingContract.address).getState()).balance;

    const msg: Withdraw = {
        $$type: 'Withdraw',
        amount: 0n,
        tokenWallet: null
    };
    const msgCell = toCell(msg);

    return {
        jettonVestingContract: jettonVestingContract,
        value: value,
        msg: msg,
        msgCell: msgCell,
    };
}

export async function withdrawTokens(
    api: TonClient | TonClient4,
    jettonVestingAddressString: string,
    jettonMasterAddressString: string,
    amount: bigint
) {
    const value = WITHDRAW_FEE;
    const jettonVestingAddress = Address.parse(jettonVestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(jettonVestingAddress));

    const tokenWalletAddress = await getJettonWalletAddress(
        api,
        jettonMasterAddressString,
        jettonVestingContract.address.toString(),
    );

    (await api.provider(jettonVestingContract.address).getState()).balance;

    const msg: Withdraw = {
        $$type: 'Withdraw',
        amount: amount,
        tokenWallet: Address.parse(tokenWalletAddress)
    };
    const msgCell = toCell(msg);

    return {
        jettonVestingContract: jettonVestingContract,
        value: value,
        msg: msg,
        msgCell: msgCell,
    };
}

export async function changeOwner(
    api: TonClient | TonClient4,
    vestingAddressString: string,
    queryId: bigint,
    newOwnerAddressString: string,
) {
    const newOwnerAddress = Address.parse(newOwnerAddressString);
    const vestingAddress = await Address.parse(vestingAddressString);

    //open contract
    const vestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const msg: ChangeOwner = {
        $$type: 'ChangeOwner',
        queryId: queryId,
        newOwner: newOwnerAddress,
    };

    const msgCell = toCell(msg);

    return {
        vestingContract: vestingContract,
        value: VESTING_CHANGE_OWNER_FEE,
        msg: msg,
        msgCell: msgCell,
    };
}

///
// get functions
///

///
/// amountOnTGE + amountInVesting = totalAmount
///type VestingRecordValue = {
//     $$type: "VestingRecordValue";
//     isAmountOnTGEReqested: boolean;
//     amountOnTGE: bigint;
//     amountInVesting: bigint;
//     releasedAmount: bigint;
//     lastQueryId: bigint;
// }
//
export async function getAllRecords(
    api: TonClient | TonClient4,
    vestingAddressString: string,
): Promise<Dictionary<Address, VestingRecordValue>> {
    const vestingAddress = Address.parse(vestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const records = await jettonVestingContract.getAllRecords();

    return records;
}

export async function getConfig(api: TonClient | TonClient4, vestingAddressString: string) {
    const vestingAddress = Address.parse(vestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const config = await jettonVestingContract.getConfig();

    return {
        claimDeadline: config.claimDeadline,
        durationSeconds: config.durationSeconds,
        tgeAt: config.tgeAt,
        startAt: config.startAt,
        isCadencePrivate: config.isCadencePrivate,
        vestingCadence: config.vestingCadence,
    };
}

export async function getConfirmed(api: TonClient | TonClient4, vestingAddressString: string) {
    const vestingAddress = Address.parse(vestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const confirmed = await jettonVestingContract.getConfirmed();

    return confirmed;
}

export async function getIndex(api: TonClient | TonClient4, vestingAddressString: string) {
    const vestingAddress = Address.parse(vestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const index = await jettonVestingContract.getIndex();

    return index;
}

export async function getAllocator(api: TonClient | TonClient4, vestingAddressString: string) {
    const vestingAddress = Address.parse(vestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const allocator = await jettonVestingContract.getAllocator();

    return allocator;
}

export async function getTokenWalletAddress(api: TonClient | TonClient4, vestingAddressString: string) {
    const vestingAddress = Address.parse(vestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const tokenWallet = await jettonVestingContract.getTokenWallet();

    return tokenWallet;
}

export async function getTotalAmount(api: TonClient | TonClient4, vestingAddressString: string) {
    const vestingAddress = Address.parse(vestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const totalAmount = await jettonVestingContract.getTotalAmount();

    return totalAmount;
}

export async function getTotalReleasedAmount(api: TonClient | TonClient4, vestingAddressString: string) {
    const vestingAddress = Address.parse(vestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(vestingAddress));

    const totalReleasedAmount = await jettonVestingContract.getTotalReleasedAmount();

    return totalReleasedAmount;
}

export async function getReleasableAmount(
    api: TonClient | TonClient4,
    vestingAddressString: string,
    beneficiaryAddressString: string,
    dateInSeconds: bigint | null,
) {
    const vestingAddress = Address.parse(vestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(vestingAddress));
    const beneficiaryAddress = Address.parse(beneficiaryAddressString);

    const releasableAmount = await jettonVestingContract.getReleasableAmount(beneficiaryAddress, dateInSeconds);

    return releasableAmount;
}

export async function getBeneficiaryRecord(
    api: TonClient | TonClient4,
    vestingAddressString: string,
    beneficiaryAddressString: string,
    dateInSeconds: bigint | null,
) {
    const vestingAddress = Address.parse(vestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(vestingAddress));
    const beneficiaryAddress = Address.parse(beneficiaryAddressString);

    const beneficiaryRecord = await jettonVestingContract.getBeneficiaryRecord(beneficiaryAddress, dateInSeconds);

    return {
        beneficiary: beneficiaryRecord.beneficiary,
        totalAmount: beneficiaryRecord.totalAmount,
        amountOnTGE: beneficiaryRecord.amountOnTGE,
        lockedAmount: beneficiaryRecord.lockedAmount,
        releasedAmount: beneficiaryRecord.releasedAmount,
        releasableAmount: beneficiaryRecord.releasableAmount,
        lastQueryId: beneficiaryRecord.lastQueryId,
    };
}

export async function getOwnerAddress(api: TonClient | TonClient4, jettonVestingAddressString: string) {
    const jettonVestingAddress = Address.parse(jettonVestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(jettonVestingAddress));

    const ownerAddress = await jettonVestingContract.getOwner();
    return ownerAddress.toString();
}

export async function getMinStorageValue(api: TonClient | TonClient4, jettonVestingAddressString: string) {
    const jettonVestingAddress = Address.parse(jettonVestingAddressString);
    const jettonVestingContract = api.open(JettonVesting.fromAddress(jettonVestingAddress));

    const ownerAddress = await jettonVestingContract.getMinStorageValue();
    return getMinStorageValue.toString();
}

export function calculateMinStorage(countOfRecords: bigint) {
    return MIN_STATIC_STORAGE + countOfRecords * MIN_STORAGE_FOR_RECORD;
}