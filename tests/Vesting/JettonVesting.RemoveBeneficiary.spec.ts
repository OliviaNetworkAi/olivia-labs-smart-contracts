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
} from '../JettonsMaster/JettonMasterHelpFunction';
import { toNano } from '@ton/core';
import { removeBeneficiary, setBeneficiary } from './JettonVestingHelpFunction';

describe('JettonVesting Remove Beneficiary test', () => {
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
    });

    it('should remove beneficiary', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        const txResult = await removeBeneficiary(jettonVesting, sender, beneficiary);

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: true,
        });
    });

    it('should remove beneficiary has corrent allRecords', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        let allRecords = await jettonVesting.getAllRecords();
        expect(allRecords.size).toBe(1);

        const txResult = await removeBeneficiary(jettonVesting, sender, beneficiary);

        allRecords = await jettonVesting.getAllRecords();
        expect(allRecords.size).toBe(0);

        expect(allRecords.has(beneficiary)).toBeFalsy();
    });

    it('should total amount increase after set beneficiary', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        let totalAmount = await jettonVesting.getTotalAmount();
        expect(totalAmount == secondBeneficiaryTotalAmount).toBeTruthy();

        const txResult = await removeBeneficiary(jettonVesting, sender, beneficiary);

        totalAmount = await jettonVesting.getTotalAmount();
        expect(totalAmount == 0n).toBeTruthy();
    });

    it('should remove beneficiary emit Not found', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        const txResult = await removeBeneficiary(jettonVesting, sender, initVars.deployerWallet.address);

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 25534, // 25534: Not found
        });
    });

    //emit
    it('should set remove Beneficiary emit Vesting has already started', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.secondWallet.getSender();

        const txResult = await removeBeneficiary(jettonVesting, sender, beneficiary);

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 36179//36179: No access
        });
    });

    it('should set remove Beneficiary  emit Vesting has already started', async () => {
        const beneficiary = initVars.secondWallet.address;
        const sender = initVars.deployerWallet.getSender();

        await jettonVesting.send(initVars.deployerWallet.getSender(), { value: CONFIRM_FEE }, 'Confirm');

        const txResult = await removeBeneficiary(jettonVesting, sender, beneficiary);

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 48672, //48672: Vesting has already started
        });
    });
});
