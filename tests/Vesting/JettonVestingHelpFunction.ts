import { Address } from '@ton/core';
import { SandboxContract, Treasury } from '@ton/sandbox';
import {
    JettonVesting,
    SetBeneficiary,
    RemoveBeneficiary,
    Claim,
    VESTING_SET_BENEFICIARY_FEE,
    VESTING_REMOVE_BENEFICIARY_FEE,
    VESTING_CLAIM_FEE,
    Withdraw,
    WITHDRAW_FEE,
} from '../../wrappers/JettonVesting';

export async function setBeneficiary(
    jettonVesting: SandboxContract<JettonVesting>,
    sender: Treasury,
    beneficiary: Address,
    totalAmount: bigint,
    amountOnTGE: bigint,
) {
    const setBeneficiaryMsg: SetBeneficiary = {
        $$type: 'SetBeneficiary',
        beneficiary: beneficiary,
        totalAmount: totalAmount,
        amountOnTGE: amountOnTGE,
    };

    const txResult = await jettonVesting.send(sender, { value: VESTING_SET_BENEFICIARY_FEE }, setBeneficiaryMsg);
    return txResult;
}

export async function removeBeneficiary(
    jettonVesting: SandboxContract<JettonVesting>,
    sender: Treasury,
    beneficiary: Address,
) {
    const removeBeneficiaryMsg: RemoveBeneficiary = {
        $$type: 'RemoveBeneficiary',
        beneficiary: beneficiary,
    };

    const txResult = await jettonVesting.send(sender, { value: VESTING_REMOVE_BENEFICIARY_FEE }, removeBeneficiaryMsg);
    return txResult;
}

export async function claim(
    jettonVesting: SandboxContract<JettonVesting>,
    sender: Treasury,
    queryId: bigint,
    beneficiary: Address,
    responseTo: Address,
    value: bigint = VESTING_CLAIM_FEE,
) {
    const claimMsg: Claim = {
        $$type: 'Claim',
        queryId: queryId,
        beneficiary: beneficiary,
        responseTo: responseTo,
    };

    const txResult = await jettonVesting.send(sender, { value: value }, claimMsg);
    return txResult;
}

export async function withdraw(
    jettonVesting: SandboxContract<JettonVesting>,
    sender: Treasury,
    amount: bigint,
    tokenWallet: Address | null,
    value: bigint = WITHDRAW_FEE,
) {
    const withdrawMsg: Withdraw = {
        $$type: 'Withdraw',
        amount: amount,
        tokenWallet: tokenWallet,
    };

    const txResult = await jettonVesting.send(sender, { value: value }, withdrawMsg);
    return txResult;
}

export function getReleasableVestingAmount(
    totalAmount: bigint,
    amountOnTGE: bigint,
    startAt: bigint,
    atMoment: bigint,
    interval: bigint,
    duration: bigint,
) {
    const numberOfIntervals = (atMoment - startAt) / interval;
    const vestedSeconds = numberOfIntervals * interval;
    const amountInVesting = totalAmount - amountOnTGE;

    return (amountInVesting * vestedSeconds) / duration;
}
