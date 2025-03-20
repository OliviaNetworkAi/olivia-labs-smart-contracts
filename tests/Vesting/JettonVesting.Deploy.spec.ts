import { SandboxContract } from '@ton/sandbox';
import '@ton/test-utils';

import { JETTON_MINT_FEE, JettonMaster } from '../../wrappers/JettonMaster';
import { JettonWallet } from '../../wrappers/JettonWallet';
import { JettonVesting, VestingConfig, deploy } from '../../wrappers/JettonVesting';
import {
    DeployJettonMaster,
    DeployJettonVesting,
    InitDefaultTestVars,
    JettonTestInitVars,
    mint,
} from './../JettonsMaster/JettonMasterHelpFunction';
import { toNano } from '@ton/core';

describe('JettonVesting Deploy test', () => {
    const mintedAmount = toNano('1000000000');
    const isCadecePrivate = false;
    const tgeTimeIn = 1000n;
    const startAtIn = 2000n;
    const durationSeconds = 100000n;
    const index = 0n;
    const nextIndex = 1n;
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

    it('should deploy jetton vesting', async () => {
        // the check is done inside beforeEach
        // blockchain is ready to use
    });

    it('should deploy jetton vesting with correct data', async () => {
        const config = await jettonVesting.getConfig();

        expect(config.isCadencePrivate).toEqual(isCadecePrivate);
        expect(config.tgeAt).toEqual(tgeAt);
        expect(config.startAt).toEqual(startAt);
        expect(config.durationSeconds).toEqual(durationSeconds);
        expect(config.vestingCadence).toEqual(vestingCadence);
        expect(config.claimDeadline).toEqual(claimDeadline);

        const tokenWalletAddress = await jettonVesting.getTokenWallet();
        expect(tokenWalletAddress).toEqualAddress(vestingJettonWallet.address);
    });

    it('should deploy jetton vesting emit Vesting duration must be greater than 0', async () => {
        const nextDurationSeconds = 0n;

        const deployJettonVesting = await DeployJettonVesting(
            initVars.blockchain,
            jettonMaster,
            initVars.deployerWallet,
            nextIndex,
            isCadecePrivate,
            tgeAt,
            startAt,
            nextDurationSeconds,
            vestingCadence,
            claimDeadline,
        );

        const nextJettonVesting = deployJettonVesting.jettonVesting;
        const txVestingDeployResult = deployJettonVesting.deployResult;

        expect(txVestingDeployResult.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: nextJettonVesting.address,
            success: false,
            exitCode: 63551, //63551: Vesting duration must be greater than 0
        });
    });

    it('should deploy jetton vesting emit Vesting cadence must be greater than 0', async () => {
        const nextVestingCadence = 0n;

        const deployJettonVesting = await DeployJettonVesting(
            initVars.blockchain,
            jettonMaster,
            initVars.deployerWallet,
            nextIndex,
            isCadecePrivate,
            tgeAt,
            startAt,
            durationSeconds,
            nextVestingCadence,
            claimDeadline,
        );

        const nextJettonVesting = deployJettonVesting.jettonVesting;
        const txVestingDeployResult = deployJettonVesting.deployResult;

        expect(txVestingDeployResult.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: nextJettonVesting.address,
            success: false,
            exitCode: 24465, //24465: Vesting cadence must be greater than 0
        });
    });

    it('should deploy jetton vesting emit Invalid claimDeadline: must be 0 or greater than startAt + durationSeconds', async () => {
        const nextVestingClaimDeadline = 5n;

        const deployJettonVesting = await DeployJettonVesting(
            initVars.blockchain,
            jettonMaster,
            initVars.deployerWallet,
            nextIndex,
            isCadecePrivate,
            tgeAt,
            startAt,
            durationSeconds,
            vestingCadence,
            nextVestingClaimDeadline,
        );

        const nextJettonVesting = deployJettonVesting.jettonVesting;
        const txVestingDeployResult = deployJettonVesting.deployResult;

        expect(txVestingDeployResult.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: nextJettonVesting.address,
            success: false,
            exitCode: 52955, //52955: Invalid claimDeadline: must be 0 or greater than startAt + durationSeconds
        });
    });

    it('should deploy jetton vesting emit TGE time must be less than or equal to startAt', async () => {
        const nextVestingTGEAt = startAt + 5n;

        const deployJettonVesting = await DeployJettonVesting(
            initVars.blockchain,
            jettonMaster,
            initVars.deployerWallet,
            nextIndex,
            isCadecePrivate,
            nextVestingTGEAt,
            startAt,
            durationSeconds,
            vestingCadence,
            claimDeadline,
        );

        const nextJettonVesting = deployJettonVesting.jettonVesting;
        const txVestingDeployResult = deployJettonVesting.deployResult;

        expect(txVestingDeployResult.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: nextJettonVesting.address,
            success: false,
            exitCode: 15886, //15886: TGE time must be less than or equal to startAt
        });
    });

    it('should deploy jetton vesting emit Already deployed', async () => {
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

        const nextJettonVesting = deployJettonVesting.jettonVesting;
        const txVestingDeployResult = deployJettonVesting.deployResult;

        expect(txVestingDeployResult.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: nextJettonVesting.address,
            success: false,
            exitCode: 24123, // 24123: Already deployed
        });
    });
});
