import { SandboxContract, Treasury } from '@ton/sandbox';
import '@ton/test-utils';

import { JETTON_MINT_FEE, JettonMaster } from '../../wrappers/JettonMaster';
import { JettonWallet } from '../../wrappers/JettonWallet';
import { ChangeAllocator, CONFIRM_FEE, JettonVesting, calculateMinStorage } from '../../wrappers/JettonVesting';
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
        console.log('deploy vestingBalance: ' + vestingBalance);

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
        console.log('setBeneficiary vestingBalance: ' + vestingBalance);

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

    it('should withdraw TON work but save MinStorageSendExcesses', async () => {
        
        // const countOfRecords = 2500n;
        // const sender = initVars.deployerWallet.getSender();
        
        // //add beneficiary
        // for (let i = 0; i < countOfRecords; i++) {
        //     if (i % 100 === 0) {
        //         console.log('records count added: ' + i);
        //     }
        //     const beneficiaryNew = await initVars.blockchain.treasury('beneficiary' + i);
        //     await setBeneficiary(jettonVesting, sender,beneficiaryNew.address, toNano('2'), toNano('1'));
        // }

        // //Confirm
        // await jettonVesting.send(initVars.deployerWallet.getSender(), { value: CONFIRM_FEE }, 'Confirm');

        // let balanceAfterConfirm = (await initVars.blockchain.getContract(jettonVesting.address)).balance
        // console.log("Balance after confirm: ", balanceAfterConfirm.toString(), "nanoTON");

        // //one year latter 
        // initVars.blockchain.now = Number(currentTimeOnBlockchain + 365n * 24n * 60n * 60n);

        // await jettonVesting.send(initVars.deployerWallet.getSender(), { value: toNano("0.01") }, 'Confirm');

        // let balanceAfterLongTime = (await initVars.blockchain.getContract(jettonVesting.address)).balance
        // console.log("long time Balance:", balanceAfterLongTime.toString(), "nanoTON");

        // console.log("balanceAfterLongTime - balanceAfterAddBenificiaries", (balanceAfterLongTime - balanceAfterConfirm) - toNano("0.01"));

        // expect(balanceAfterLongTime > 0n).toBeTruthy();

        // const claimTx = await claim(jettonVesting, initVars.secondWallet.getSender(), 1n, initVars.secondWallet.address, initVars.secondWallet.address);
        // const beneficiaryJettonWalletAddress = await jettonMaster.getGetWalletAddress(initVars.secondWallet.address);
        // beneficiaryJettonWallet = initVars.blockchain.openContract(
        //     await JettonWallet.fromAddress(beneficiaryJettonWalletAddress),
        // );

        // expect(claimTx.transactions).toHaveTransaction({
        //     from: vestingJettonWallet.address,
        //     to: beneficiaryJettonWallet.address,
        //     success: true,
        // });

        // let balanceAfterClaim = (await initVars.blockchain.getContract(jettonVesting.address)).balance
        // console.log("Balance after claim:", balanceAfterClaim.toString(), "nanoTON");

        // expect(balanceAfterClaim >= balanceAfterLongTime).toBeTruthy();
    });
});
