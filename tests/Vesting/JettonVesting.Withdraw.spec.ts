import { SandboxContract, Treasury } from '@ton/sandbox';
import '@ton/test-utils';

import { JETTON_MINT_FEE, JettonMaster } from '../../wrappers/JettonMaster';
import { JettonWallet } from '../../wrappers/JettonWallet';
import {
    ChangeAllocator,
    CONFIRM_FEE,
    JettonVesting,
    calculateMinStorage,
    WITHDRAW_FEE,
} from '../../wrappers/JettonVesting';
import {
    DeployJettonMaster,
    DeployJettonVesting,
    InitDefaultTestVars,
    JettonTestInitVars,
    mint,
} from '../JettonsMaster/JettonMasterHelpFunction';
import { toNano } from '@ton/core';
import {
    claim,
    getReleasableVestingAmount,
    removeBeneficiary,
    setBeneficiary,
    withdraw,
} from './JettonVestingHelpFunction';

describe('JettonVesting Claim test', () => {
    const mintedAmount = toNano('1000000000');
    const isCadecePrivate = false;
    const tgeTimeIn = 1000n;
    const startAtIn = 2000n;
    const claimDeadlineAtIn = 2000n;
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
    let claimDeadline = 0n;

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
        claimDeadline = endAt + claimDeadlineAtIn;

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

        let vestingBalance = (await initVars.blockchain.provider(jettonVesting.address).getState()).balance;

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

        vestingBalance = (await initVars.blockchain.provider(jettonVesting.address).getState()).balance;

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
    });

    //withdraw tons by owner
    //withdraw tokens by owner when vesting end and all claim tokens
    //withdraw tokens by owner when vesting end and claimDeadline ... can be claimed by owner
    it('should withdraw TON work but save MIN_STORAGE', async () => {
        const sender = initVars.deployerWallet.getSender();
        const countOfRecords = 1n;
        const extraFeeForTest = toNano('1');

        await sender.send({
            to: jettonVesting.address,
            value: extraFeeForTest,
            bounce: false,
        });

        //just for update provider on test blockchain, send any.. this transaction emit but it is ok for us
        await jettonVesting.send(initVars.secondWallet.getSender(), { value: toNano('0.01') }, 'Confirm');

        let vestingAfterSendBalance = (await initVars.blockchain.provider(jettonVesting.address).getState()).balance;
        expect(vestingAfterSendBalance > calculateMinStorage(countOfRecords)).toBeTruthy();
        const txResult = await withdraw(
            jettonVesting,
            sender,
            1n, // need > 0 if we don't want to close contract
            null, // null it means withdraw ton
            WITHDRAW_FEE,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: true,
        });

        expect(txResult.transactions).toHaveTransaction({
            from: jettonVesting.address,
            to: sender.address,
            success: true,
        });

        let vestingBalance = (await initVars.blockchain.provider(jettonVesting.address).getState()).balance;
        expect((vestingBalance == calculateMinStorage(countOfRecords))).toBeTruthy();
    });

    it('should close contract and withdraw ton', async () => {
        const sender = initVars.deployerWallet.getSender();
        const countOfRecords = 1n;
        const extraFeeForTest = toNano('1');

        await sender.send({
            to: jettonVesting.address,
            value: extraFeeForTest,
            bounce: false,
        });

        //just for update provider on test blockchain, send any.. this transaction emit but it is ok for us
        await jettonVesting.send(initVars.secondWallet.getSender(), { value: toNano('0.01') }, 'Confirm');

        let vestingAfterSendBalance = (await initVars.blockchain.provider(jettonVesting.address).getState()).balance;
        expect(vestingAfterSendBalance > calculateMinStorage(countOfRecords)).toBeTruthy();
        const txResult = await withdraw(
            jettonVesting,
            sender,
            0n, // need = 0 close contract
            null, // null it means withdraw ton
            WITHDRAW_FEE,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: true,
        });

        expect(txResult.transactions).toHaveTransaction({
            from: jettonVesting.address,
            to: sender.address,
            success: true,
        });

        let vestingBalance = (await initVars.blockchain.provider(jettonVesting.address).getState()).balance;
        expect((vestingBalance == 0n)).toBeTruthy();
    });

    it('should withdraw token', async () => {
        const sender = initVars.deployerWallet.getSender();
        const countOfRecords = 1n;

        const tokensBalance = (await vestingJettonWallet.getGetWalletData()).balance;
        expect(tokensBalance == mintedAmount).toBeTruthy();

        const txResult = await withdraw(
            jettonVesting,
            sender,
            tokensBalance, 
            vestingJettonWallet.address,
            WITHDRAW_FEE,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: true,
        });

        expect(txResult.transactions).toHaveTransaction({
            from: jettonVesting.address,
            to: vestingJettonWallet.address,
            success: true,
        });

        const tokensBalanceAfterWithdraw = (await vestingJettonWallet.getGetWalletData()).balance;
        expect(tokensBalanceAfterWithdraw == 0n).toBeTruthy();

        //not mint early to deployer
        const deployerJettonWalletAddress = await jettonMaster.getGetWalletAddress(initVars.deployerWallet.address);
        deployerJettonWallet = initVars.blockchain.openContract(
            await JettonWallet.fromAddress(deployerJettonWalletAddress),
        );
        const ownerTokenBalance = (await deployerJettonWallet.getGetWalletData()).balance;
        expect(ownerTokenBalance == mintedAmount).toBeTruthy();
    });

    it('should withdraw TON after confirm and after claimDeadline', async () => {
        const sender = initVars.deployerWallet.getSender();
        const countOfRecords = 1n;
        const extraFeeForTest = toNano('1');



        //Confirm
        await jettonVesting.send(initVars.deployerWallet.getSender(), { value: CONFIRM_FEE }, 'Confirm');

        await sender.send({
            to: jettonVesting.address,
            value: extraFeeForTest,
            bounce: false,
        });

        //wait deadline 
        initVars.blockchain.now = Number(claimDeadline);

        const txResult = await withdraw(
            jettonVesting,
            sender,
            1n, // need > 0 if we don't want to close contract
            null, // null it means withdraw ton
            WITHDRAW_FEE,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: true,
        });

        expect(txResult.transactions).toHaveTransaction({
            from: jettonVesting.address,
            to: sender.address,
            success: true,
        });

        let vestingBalance = (await initVars.blockchain.provider(jettonVesting.address).getState()).balance;
        expect((vestingBalance == calculateMinStorage(countOfRecords))).toBeTruthy();
    });

    //emit
    it('should not withdraw emit Claim deadline not reached or vesting still active', async () => {
        const sender = initVars.deployerWallet.getSender();
        const extraFeeForTest = toNano('1');

        await sender.send({
            to: jettonVesting.address,
            value: extraFeeForTest,
            bounce: false,
        });
        await jettonVesting.send(initVars.deployerWallet.getSender(), { value: CONFIRM_FEE }, 'Confirm');

        const txResult = await withdraw(
            jettonVesting,
            sender,
            1n, // need > 0 if we don't want to close contract
            null, // null it means withdraw ton
            WITHDRAW_FEE,
        );

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 42987 //42987: Claim deadline not reached or vesting still active
        });
    });
});
