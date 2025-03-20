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
import { Address, toNano } from '@ton/core';
import { getReleasableVestingAmount, setBeneficiary } from './JettonVestingHelpFunction';

describe('JettonVesting Set Beneficiary test', () => {
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

        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: vestingJettonWalletAddress,
            success: true,
            deploy: true,
        });
    });

    it('should set beneficiary', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();
        const txResult = await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: true,
        });
    });

    it('should set beneficiary has corrent allRecords', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        let allRecords = await jettonVesting.getAllRecords();
        expect(allRecords.size).toBe(0);

        const txResult = await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        allRecords = await jettonVesting.getAllRecords();
        expect(allRecords.size).toBe(1);

        expect(allRecords.has(beneficiary)).toBeTruthy();

        const record = allRecords.get(beneficiary);

        expect(record?.amountInVesting).toBe(secondBeneficiaryTotalAmount - secondBeneficiaryAmountOnTGE);
        expect(record?.amountOnTGE).toBe(secondBeneficiaryAmountOnTGE);
        // expect(record?.isAmountOnTGEReqested).toBeFalsy();
        expect(record?.lastQueryId).toBe(0n);
        expect(record?.releasedAmount).toBe(0n);
    });

    it('should total amount increase after set beneficiary', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        let totalAmount = await jettonVesting.getTotalAmount();
        expect(totalAmount == 0n).toBeTruthy();

        const txResult = await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        totalAmount = await jettonVesting.getTotalAmount();
        expect(totalAmount == secondBeneficiaryTotalAmount).toBeTruthy();
    });

    it('should set same beneficiary and update record', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();
        const newTotalAmount = toNano('3');
        const newAmountOnTGE = toNano('1');

        let allRecords = await jettonVesting.getAllRecords();
        expect(allRecords.size).toBe(0);

        await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );
        //second time with new value
        await setBeneficiary(jettonVesting, sender, beneficiary, newTotalAmount, newAmountOnTGE);

        allRecords = await jettonVesting.getAllRecords();
        expect(allRecords.size).toBe(1);
        expect(allRecords.has(beneficiary)).toBeTruthy();

        const record = allRecords.get(beneficiary);
        expect(record?.amountInVesting).toBe(newTotalAmount - newAmountOnTGE);
        expect(record?.amountOnTGE).toBe(newAmountOnTGE);
        expect(record?.lastQueryId).toBe(0n);
        expect(record?.releasedAmount).toBe(0n);
    });

    it('should set same beneficiary and update total amount', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();
        const newTotalAmount = toNano('3');
        const newAmountOnTGE = toNano('1');

        let totalAmount = await jettonVesting.getTotalAmount();
        expect(totalAmount == 0n).toBeTruthy();

        await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        totalAmount = await jettonVesting.getTotalAmount();
        expect(totalAmount == secondBeneficiaryTotalAmount).toBeTruthy();

        await setBeneficiary(jettonVesting, sender, beneficiary, newTotalAmount, newAmountOnTGE);

        totalAmount = await jettonVesting.getTotalAmount();
        expect(totalAmount == newTotalAmount).toBeTruthy();
    });

    it('should correct total Released Amount before TGE', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        let releasableAmount = await jettonVesting.getReleasableAmount(beneficiary, currentTimeOnBlockchain);
        expect(releasableAmount == 0n).toBeTruthy();

        releasableAmount = await jettonVesting.getReleasableAmount(beneficiary, tgeAt - 1n);
        expect(releasableAmount == 0n).toBeTruthy();
    });

    it('should correct total Released Amount on TGE before first vestingCadence on start', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        let releasableAmount = await jettonVesting.getReleasableAmount(beneficiary, tgeAt);
        expect(releasableAmount == secondBeneficiaryAmountOnTGE).toBeTruthy();

        releasableAmount = await jettonVesting.getReleasableAmount(beneficiary, startAt + vestingCadence - 1n);
        expect(releasableAmount == secondBeneficiaryAmountOnTGE).toBeTruthy();
    });

    it('should correct total Released Amount after start befor end', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        let atMoment = startAt + vestingCadence;
        let releasableAmount = await jettonVesting.getReleasableAmount(beneficiary, atMoment);
        let vestingAmount = getReleasableVestingAmount(
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
            startAt,
            atMoment,
            vestingCadence,
            durationSeconds,
        );
        expect(releasableAmount == secondBeneficiaryAmountOnTGE + vestingAmount).toBeTruthy();

        //middle of vesting
        atMoment = startAt + durationSeconds / 2n;
        releasableAmount = await jettonVesting.getReleasableAmount(beneficiary, atMoment);
        vestingAmount = getReleasableVestingAmount(
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
            startAt,
            atMoment,
            vestingCadence,
            durationSeconds,
        );
        expect(releasableAmount == secondBeneficiaryAmountOnTGE + vestingAmount).toBeTruthy();

        //before end of vesting
        atMoment = startAt + durationSeconds - 1n;
        releasableAmount = await jettonVesting.getReleasableAmount(beneficiary, atMoment);
        vestingAmount = getReleasableVestingAmount(
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
            startAt,
            atMoment,
            vestingCadence,
            durationSeconds,
        );
        expect(releasableAmount == secondBeneficiaryAmountOnTGE + vestingAmount).toBeTruthy();
    });

    it('should correct total Released Amount after end', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        //at the end
        let atMoment = startAt + durationSeconds;
        let releasableAmount = await jettonVesting.getReleasableAmount(beneficiary, atMoment);
        expect(releasableAmount == secondBeneficiaryTotalAmount).toBeTruthy();

        //after the end
        atMoment = startAt + durationSeconds + durationSeconds;
        releasableAmount = await jettonVesting.getReleasableAmount(beneficiary, atMoment);
        expect(releasableAmount == secondBeneficiaryTotalAmount).toBeTruthy();
    });

    it('should correct beneficiary Record on set', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        let beneficiaryRecord = await jettonVesting.getBeneficiaryRecord(beneficiary, currentTimeOnBlockchain);
        expect(beneficiaryRecord.beneficiary).toEqualAddress(beneficiary);
        expect(beneficiaryRecord.totalAmount == secondBeneficiaryTotalAmount).toBeTruthy();
        expect(beneficiaryRecord.amountOnTGE == secondBeneficiaryAmountOnTGE).toBeTruthy();
        expect(beneficiaryRecord.lockedAmount == secondBeneficiaryTotalAmount).toBeTruthy();
        expect(beneficiaryRecord.releasableAmount == 0n).toBeTruthy();
        expect(beneficiaryRecord.releasedAmount == 0n).toBeTruthy();
        expect(beneficiaryRecord.lastQueryId == 0n).toBeTruthy();
    });

    //emit
    it('should set beneficiary emit No access', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.secondWallet.getSender();

        const txResult = await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 36179//36179: No access
        });
    });

    it('should set beneficiary emit Vesting has already started', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        await jettonVesting.send(initVars.deployerWallet.getSender(), { value: CONFIRM_FEE }, 'Confirm');

        const txResult = await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 48672, //48672: Vesting has already started
        });
    });

    it('should set beneficiary emit Amount must be > 0', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        const txResult = await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            0n,
            0n,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 6243, //6243: Amount must be > 0
        });
    });

    it('should set beneficiary emit AmountOnTGE must be <= totalAmount', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        const txResult = await setBeneficiary(
            jettonVesting,
            sender,
            beneficiary,
            secondBeneficiaryAmountOnTGE - 1n,
            secondBeneficiaryAmountOnTGE,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 35407, //35407: AmountOnTGE must be <= totalAmount
        });
    });

    it('should set beneficiary emit Token wallet cannot be a recipient', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        const txResult = await setBeneficiary(
            jettonVesting,
            sender,
            vestingJettonWallet.address,
            secondBeneficiaryTotalAmount,
            secondBeneficiaryAmountOnTGE,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 47888, //47888: Token wallet cannot be a recipient
        });
    });
});
