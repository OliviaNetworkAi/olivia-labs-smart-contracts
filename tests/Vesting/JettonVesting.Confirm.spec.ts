import { SandboxContract } from '@ton/sandbox';
import '@ton/test-utils';

import { JETTON_MINT_FEE, JettonMaster } from '../../wrappers/JettonMaster';
import { JettonWallet } from '../../wrappers/JettonWallet';
import {
    CONFIRM_FEE,
    ChangeAllocator,
    JettonVesting,
    VESTING_CHANGE_OWNER_FEE,
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

describe('JettonVesting Confirm test', () => {
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
    });

    it('should deploy jetton vesting', async () => {
        // the check is done inside beforeEach
        // blockchain is ready to use
    });

    it('should confirm vesting', async () => {

        let isConfirm = await jettonVesting.getConfirmed();
        expect(isConfirm).toBeFalsy();

        const txResult = await jettonVesting.send(
            initVars.deployerWallet.getSender(),
            { value: CONFIRM_FEE },
            'Confirm',
        );

        expect(txResult.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonVesting.address,
            success: true,
        });

        isConfirm = await jettonVesting.getConfirmed();
        expect(isConfirm).toBeTruthy();
    });

    it('should confirm vesting emit only owner', async () => {
        const txResult = await jettonVesting.send(
            initVars.secondWallet.getSender(),
            { value: CONFIRM_FEE },
            'Confirm',
        );

        expect(txResult.transactions).toHaveTransaction({
            from: initVars.secondWallet.address,
            to: jettonVesting.address,
            success: false,
            exitCode: 132 //132: Access denied
        });
    });
});
