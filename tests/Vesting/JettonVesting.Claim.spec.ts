import { SandboxContract, Treasury } from '@ton/sandbox';
import '@ton/test-utils';

import { JETTON_MINT_FEE, JettonMaster } from '../../wrappers/JettonMaster';
import { JettonWallet } from '../../wrappers/JettonWallet';
import {
    CONFIRM_FEE,
    JettonVesting,
    SetBeneficiary,
    VESTING_SET_BENEFICIARY_FEE,
    VestingConfig,
    deploy,
} from '../../wrappers/JettonVesting';
import {
    DeployJettonMaster,
    DeployJettonVesting,
    InitDefaultTestVars,
    JettonTestInitVars,
    mint,
} from '../JettonsMaster/JettonMasterHelpFunction';
import { toNano } from '@ton/core';
import { claim, getReleasableVestingAmount, removeBeneficiary, setBeneficiary } from './JettonVestingHelpFunction';

describe('JettonVesting Claim test', () => {
    const mintedAmount = toNano('1000000000');
    const isCadecePrivate = false;
    const tgeTimeIn = 1000n;
    const startAtIn = 2000n;
    const durationSeconds = 100000n;
    const index = 0n;
    const nextIndex = 1n;
    const secondBeneficiaryTotalAmount = toNano('10000');
    const secondBeneficiaryAmountOnTGE = toNano('2000');
    let deployerJettonWallet: SandboxContract<JettonWallet>;
    let beneficiaryJettonWallet: SandboxContract<JettonWallet>;
    let jettonMaster: SandboxContract<JettonMaster>;
    let jettonVesting: SandboxContract<JettonVesting>;
    let vestingJettonWallet: SandboxContract<JettonWallet>;
    let initVars: JettonTestInitVars;
    let currentTimeOnBlockchain = 0n;
    let tgeAt = 0n;
    let startAt = 0n;
    let endAt = 0n;
    let vestingCadence = 10n; //every 10 seconds
    let claimDeadline = 0n; // can't be claimed after endAt

    beforeEach(async () => {
        initVars = await InitDefaultTestVars();

        const deployedJettonMaster = await DeployJettonMaster(
            initVars.blockchain,
            initVars.deployerWallet,
            initVars.deployerWallet.address,
            initVars.contentCell,
            initVars.maxSupply,
        );

        jettonMaster = deployedJettonMaster.jettonMaster;
        const txResult = deployedJettonMaster.deployResult;

        expect(txResult.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            deploy: true,
            success: true,
        });

        initVars.blockchain.now = Math.floor(Date.now() / 1000);
        currentTimeOnBlockchain = BigInt(initVars.blockchain.now.toString());
        tgeAt = currentTimeOnBlockchain + tgeTimeIn;
        startAt = currentTimeOnBlockchain + startAtIn;
        endAt = startAt + durationSeconds;

        const deployJettonVesting = await DeployJettonVesting(
            initVars.blockchain,
            jettonMaster,
            initVars.deployerWallet,
            index,
            isCadecePrivate,
            tgeAt,
            startAt,
            durationSeconds,
            vestingCadence,
            claimDeadline,
        );

        jettonVesting = deployJettonVesting.jettonVesting;
        const txVestingDeployResult = deployJettonVesting.deployResult;

        expect(txVestingDeployResult.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonVesting.address,
            deploy: true,
            success: true,
        });

        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();
        const txResultSetBeneficiary = await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        expect(txResultSetBeneficiary.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: true,
        });

        const mintResult = await mint(
            jettonMaster,
            initVars.deployerWallet,
            JETTON_MINT_FEE,
            jettonVesting.address,
            mintedAmount,
            initVars.deployerWallet.address,
        );

        const vestingJettonWalletAddress = await jettonMaster.getGetWalletAddress(jettonVesting.address);
        vestingJettonWallet = initVars.blockchain.openContract(
            await JettonWallet.fromAddress(vestingJettonWalletAddress),
        );

        const beneficiaryJettonWalletAddress = await jettonMaster.getGetWalletAddress(beneficiary);
        beneficiaryJettonWallet = await initVars.blockchain.openContract(
            await JettonWallet.fromAddress(beneficiaryJettonWalletAddress),
        );

        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: vestingJettonWalletAddress,
            success: true,
            deploy: true,
        });

        await jettonVesting.send(initVars.deployerWallet.getSender(), { value: CONFIRM_FEE }, 'Confirm');
    });

    it('should claim trasaction work after TGE', async () => {
        const beneficiaryWallet = initVars.secondWallet.address;
        const beneficiarySender = initVars.secondWallet.getSender();
        const newQueryId = 1n;
        const atMoment = tgeAt;

        initVars.blockchain.now = Number(atMoment);

        const txResult = await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: beneficiarySender.address,
            to: jettonVesting.address,
            success: true,
        });

        expect(txResult.transactions).toHaveTransaction({
            from: jettonVesting.address,
            to: vestingJettonWallet.address,
            success: true,
        });

        expect(txResult.transactions).toHaveTransaction({
            from: vestingJettonWallet.address,
            to: beneficiaryJettonWallet.address,
            success: true,
        });

        expect(txResult.transactions).toHaveTransaction({
            from: beneficiaryJettonWallet.address, //EQDV_X89_Uo-IfDHif3i_NckTNFE1UJw-icj5qIXY5HE03NC
            to: beneficiaryWallet, // EQBSuq0A3cehocc9T-ZMITY6e8cPvpJSHuM88N5kapNKitLK
            success: true,
            op: 3576854235, //Excesses
        });
    });

    it('should claim after TGE and received tokens', async () => {
        const beneficiaryWallet = initVars.secondWallet.address;
        const beneficiarySender = initVars.secondWallet.getSender();
        const newQueryId = 1n;
        const atMoment = tgeAt;

        initVars.blockchain.now = Number(atMoment);
        const vestingJettonBalanceBeforeClaim = (await vestingJettonWallet.getGetWalletData()).balance;

        const txResult = await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        const beneficiaryJettonBalanceAfterClaim = (await beneficiaryJettonWallet.getGetWalletData()).balance;
        expect(beneficiaryJettonBalanceAfterClaim == secondBeneficiaryAmountOnTGE).toBeTruthy();

        const vestingJettonBalanceAfterClaim = (await vestingJettonWallet.getGetWalletData()).balance;

        expect(
            vestingJettonBalanceBeforeClaim - vestingJettonBalanceAfterClaim == secondBeneficiaryAmountOnTGE,
        ).toBeTruthy();
    });

    it('should owner claim after TGE and beneficiary received tokens', async () => {
        const beneficiaryWallet = initVars.secondWallet.address;
        const ownerSender = initVars.deployerWallet.getSender();
        const newQueryId = 1n;
        const atMoment = tgeAt;

        initVars.blockchain.now = Number(atMoment);
        const vestingJettonBalanceBeforeClaim = (await vestingJettonWallet.getGetWalletData()).balance;

        await claim(jettonVesting, ownerSender, newQueryId, beneficiaryWallet, beneficiaryWallet);

        const beneficiaryJettonBalanceAfterClaim = (await beneficiaryJettonWallet.getGetWalletData()).balance;
        expect(beneficiaryJettonBalanceAfterClaim == secondBeneficiaryAmountOnTGE).toBeTruthy();

        const vestingJettonBalanceAfterClaim = (await vestingJettonWallet.getGetWalletData()).balance;

        expect(
            vestingJettonBalanceBeforeClaim - vestingJettonBalanceAfterClaim == secondBeneficiaryAmountOnTGE,
        ).toBeTruthy();
    });

    it('should claim after TGE and record unpdated and totalReleasedAmount', async () => {
        const beneficiaryWallet = initVars.secondWallet.address;
        const beneficiarySender = initVars.secondWallet.getSender();
        const newQueryId = 1n;
        let atMoment = tgeAt;

        initVars.blockchain.now = Number(atMoment);
        const vestingJettonBalanceBeforeClaim = (await vestingJettonWallet.getGetWalletData()).balance;

        const txResult = await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        atMoment = startAt - 1n;
        initVars.blockchain.now = Number(atMoment);

        const beneficiaryRecord = await jettonVesting.getBeneficiaryRecord(beneficiaryWallet, atMoment);

        expect(beneficiaryRecord.totalAmount == secondBeneficiaryTotalAmount).toBeTruthy();
        expect(beneficiaryRecord.lastQueryId == newQueryId).toBeTruthy();
        expect(
            beneficiaryRecord.lockedAmount == secondBeneficiaryTotalAmount - secondBeneficiaryAmountOnTGE,
        ).toBeTruthy();
        expect(beneficiaryRecord.releasedAmount == secondBeneficiaryAmountOnTGE).toBeTruthy();
        expect(beneficiaryRecord.releasableAmount == 0n).toBeTruthy();

        const totalReleasedAmount = await jettonVesting.getTotalReleasedAmount();
        expect(totalReleasedAmount == secondBeneficiaryAmountOnTGE).toBeTruthy();
    });

    it('should claim after TGE and after start and after end', async () => {
        const beneficiaryWallet = initVars.secondWallet.address;
        const beneficiarySender = initVars.secondWallet.getSender();
        const newQueryId = 1n;
        //on tge
        let atMoment = tgeAt;

        initVars.blockchain.now = Number(atMoment);

        await claim(jettonVesting, beneficiarySender, newQueryId, beneficiaryWallet, beneficiaryWallet);

        const beneficiaryBalanceAfterClaimTGE = (await beneficiaryJettonWallet.getGetWalletData()).balance;
        expect(beneficiaryBalanceAfterClaimTGE == secondBeneficiaryAmountOnTGE).toBeTruthy();

        //after start + vestingCadence
        atMoment = startAt + vestingCadence;
        initVars.blockchain.now = Number(atMoment);

        const releasableVestingAmount = await getReleasableVestingAmount(
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
            startAt,
            atMoment,
            vestingCadence,
            durationSeconds,
        );

        await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId + 1n,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        const beneficiaryBalanceAfterClaimOnStart = (await beneficiaryJettonWallet.getGetWalletData()).balance;
        expect(beneficiaryBalanceAfterClaimOnStart == secondBeneficiaryAmountOnTGE + releasableVestingAmount).toBeTruthy();

        //after start + vestingCadence + vestingCadence
        atMoment = startAt + vestingCadence + vestingCadence;
        initVars.blockchain.now = Number(atMoment);

        const releasableVestingAmountOnSecondVestingCadence = await getReleasableVestingAmount(
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
            startAt,
            atMoment,
            vestingCadence,
            durationSeconds,
        );

        await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId + 2n,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        const beneficiaryBalanceAfterClaimOnStartSecondCadence = (await beneficiaryJettonWallet.getGetWalletData()).balance;
        expect(beneficiaryBalanceAfterClaimOnStartSecondCadence == secondBeneficiaryAmountOnTGE + releasableVestingAmountOnSecondVestingCadence).toBeTruthy();

        
        //after end
        atMoment = startAt + durationSeconds;
        initVars.blockchain.now = Number(atMoment);

        await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId + 3n,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        const beneficiaryBalanceAfterClaimAfterEnd = (await beneficiaryJettonWallet.getGetWalletData()).balance;
        expect(beneficiaryBalanceAfterClaimAfterEnd == secondBeneficiaryTotalAmount).toBeTruthy();
    });

    //emit
    it('should claim emit Vesting should be confirmed', async () => {
        const beneficiaryWallet = initVars.secondWallet.address;
        const beneficiarySender = initVars.secondWallet.getSender();
        const newQueryId = 1n;
        const atMoment = tgeAt;

        const deployNewJettonVesting = await DeployJettonVesting(
            initVars.blockchain,
            jettonMaster,
            initVars.deployerWallet,
            index + 1n,
            isCadecePrivate,
            tgeAt,
            startAt,
            durationSeconds,
            vestingCadence,
            claimDeadline,
        );

        initVars.blockchain.now = Number(atMoment);

        const txResult = await claim(
            deployNewJettonVesting.jettonVesting,
            beneficiarySender,
            newQueryId,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: beneficiarySender.address,
            to: deployNewJettonVesting.jettonVesting.address,
            success: false,
            exitCode: 12394, //12394: Vesting should be confirmed
        });
    });

    it('should claim emit Not enough value', async () => {
        const beneficiaryWallet = initVars.secondWallet.address;
        const beneficiarySender = initVars.secondWallet.getSender();
        const newQueryId = 1n;

        const txResult = await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId,
            beneficiaryWallet,
            beneficiaryWallet,
            toNano('0.01'),
        );

        expect(txResult.transactions).toHaveTransaction({
            from: beneficiarySender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 5165, // 5165: Not enough value
        });
    });

    it('should claim emit No access', async () => {
        const beneficiaryWallet = initVars.deployerWallet.address;
        const beneficiarySender = initVars.secondWallet.getSender();
        const newQueryId = 1n;

        const txResult = await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: beneficiarySender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 36179, //36179: No access
        });
    });

    it('should claim emit Not found', async () => {
        const beneficiaryWallet = initVars.deployerWallet.address;
        const beneficiarySender = initVars.deployerWallet.getSender();
        const newQueryId = 1n;

        const txResult = await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: beneficiarySender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 25534, //25534: Not found
        });
    });

    it('should claim emit Bad query', async () => {
        const beneficiaryWallet = initVars.secondWallet.address;
        const beneficiarySender = initVars.secondWallet.getSender();
        const newQueryId = 0n; //same on blockchain

        const txResult = await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: beneficiarySender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 57218, //57218: Bad query
        });
    });

    it('should claim emit Nothing to claim', async () => {
        const beneficiaryWallet = initVars.secondWallet.address;
        const beneficiarySender = initVars.secondWallet.getSender();
        const newQueryId = 1n;

        const txResult = await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: beneficiarySender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 44799, //44799: Nothing to claim
        });
    });

    it('should claim and claim again and emit Nothing to claim', async () => {
        const beneficiaryWallet = initVars.secondWallet.address;
        const beneficiarySender = initVars.secondWallet.getSender();
        const newQueryId = 1n;

        const atMoment = tgeAt;

        initVars.blockchain.now = Number(atMoment);

        const txResultFirstClaim = await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        expect(txResultFirstClaim.transactions).toHaveTransaction({
            from: beneficiarySender.address,
            to: jettonVesting.address,
            success: true,
        });

        const txResult = await claim(
            jettonVesting,
            beneficiarySender,
            newQueryId + 1n,
            beneficiaryWallet,
            beneficiaryWallet,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: beneficiarySender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 44799, //44799: Nothing to claim
        });
    });

    //gas test
});
