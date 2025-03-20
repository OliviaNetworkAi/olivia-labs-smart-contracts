import { SandboxContract } from '@ton/sandbox';
import { Cell, beginCell, toNano } from '@ton/core';
import '@ton/test-utils';

import {
    Burn,
    BurnNotification,
    Excesses,
    JETTON_MINT_FEE,
    JettonMaster,
    storeBurnNotification,
    storeExcesses,
} from '../../wrappers/JettonMaster';
import { JettonWallet, JETTON_BURN_FEE } from '../../wrappers/JettonWallet';
import { DeployJettonMaster, InitDefaultTestVars, JettonTestInitVars, mint } from './JettonMasterHelpFunction';

describe('JettonWallet Burn test', () => {

    let jettonWallet: SandboxContract<JettonWallet>;
    let jettonMaster: SandboxContract<JettonMaster>;
    let initVars: JettonTestInitVars;
    const mintedAmount = 1000n;

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

        const mintResult = await mint(jettonMaster, initVars.deployerWallet, JETTON_MINT_FEE, initVars.deployerWallet.address, mintedAmount, initVars.deployerWallet.address);
        
        const jettonWalletAddress = await jettonMaster.getGetWalletAddress(initVars.deployerWallet.address);
        jettonWallet = initVars.blockchain.openContract(await JettonWallet.fromAddress(jettonWalletAddress));

        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: jettonWalletAddress,
            success: true,
            deploy: true
        });
    });

    it('should deploy jetton wallet', async () => {
        // the check is done inside beforeEach
        // blockchain and JettonWallet are ready to use
    });

    it('should burn jettons', async () => {
        const sender = initVars.deployerWallet;
        const queryId = 0n;
        const burnAmount = 300n;
        const responseDestination = initVars.deployerWallet.address;

        const msg: Burn = {
            $$type: 'Burn',
            queryId: queryId,
            amount: burnAmount,
            responseDestination: jettonMaster.address,
            customPayload: Cell.EMPTY
        };

        let jettonWalletData = await jettonWallet.getGetWalletData();
        expect(jettonWalletData.balance).toEqual(mintedAmount);
        let jettonMasterData = await jettonMaster.getGetJettonData();
        expect(jettonMasterData.totalSupply).toEqual(mintedAmount);

        const txResult = await jettonWallet.send(sender.getSender(), { value: JETTON_BURN_FEE }, msg);

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonWallet.address,
            success: true
        });

        jettonWalletData = await jettonWallet.getGetWalletData();
        expect(jettonWalletData.balance).toEqual(mintedAmount - burnAmount);
        jettonMasterData = await jettonMaster.getGetJettonData();
        expect(jettonMasterData.totalSupply).toEqual(mintedAmount - burnAmount);

        const outMsg: BurnNotification = {
            $$type: 'BurnNotification',
            queryId: queryId,
            amount: burnAmount,
            sender: sender.address,
            responseDestination: sender.address
        };

        const burnNotification = beginCell();
        storeBurnNotification(outMsg)(burnNotification);

        expect(txResult.transactions).toHaveTransaction({
            from: jettonWallet.address,
            to: jettonMaster.address,
            success: true,
            body: burnNotification.endCell()
        });

        const msgExcesses: Excesses = {
            $$type: 'Excesses',
            queryId: queryId
        };

        const excesses = beginCell();
        storeExcesses(msgExcesses)(excesses);

        expect(txResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: responseDestination,
            success: true,
            body: excesses.endCell()
        });
    });

    it('should burn jettons emit Invalid sender', async () => {
        const queryId = 0n;
        const burnAmount = 300n;

        const msg: Burn = {
            $$type: 'Burn',
            queryId: queryId,
            amount: burnAmount,
            responseDestination: jettonMaster.address,
            customPayload: Cell.EMPTY
        };

        const txResult = await jettonWallet.send(initVars.secondWallet.getSender(), { value: JETTON_BURN_FEE }, msg);

        expect(txResult.transactions).toHaveTransaction({
            from: initVars.secondWallet.address,
            to: jettonWallet.address,
            success: false,
            exitCode: 4429//4429: Invalid sender
        });
    });

    it('should burn jettons emit Invalid balance', async () => {
        const sender = initVars.deployerWallet;
        const queryId = 0n;
        const burnAmount = 3000n;

        const msg: Burn = {
            $$type: 'Burn',
            queryId: queryId,
            amount: burnAmount,
            responseDestination: jettonMaster.address,
            customPayload: Cell.EMPTY
        };

        const txResult = await jettonWallet.send(sender.getSender(), { value: JETTON_BURN_FEE }, msg);

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonWallet.address,
            success: false,
            exitCode: 62972//62972: Invalid balance
        });
    });

    it('should burn jettons emit Invalid value - Burn', async () => {
        const sender = initVars.deployerWallet;
        const queryId = 0n;
        const burnAmount = 300n;
        const smallValue = toNano('0.01');

        const msg: Burn = {
            $$type: 'Burn',
            queryId: queryId,
            amount: burnAmount,
            responseDestination: jettonMaster.address,
            customPayload: Cell.EMPTY
        };

        const txResult = await jettonWallet.send(sender.getSender(), { value: smallValue }, msg);

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonWallet.address,
            success: false,
            exitCode: 43422//43422: Invalid value - Burn
        });
    });
});
