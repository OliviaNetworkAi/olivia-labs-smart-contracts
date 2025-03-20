import { SandboxContract } from '@ton/sandbox';
import { Cell, beginCell, toNano } from '@ton/core';
import '@ton/test-utils';

import {
    Excesses,
    InternalTransfer,
    JETTON_MINT_FEE,
    JettonMaster,
    storeExcesses,
    storeInternalTransfer,
    storeTransferNotification,
    Transfer,
    TransferNotification
} from '../../wrappers/JettonMaster';
import { JettonWallet, JETTON_TRANSFER_FEE } from '../../wrappers/JettonWallet';
import { DeployJettonMaster, InitDefaultTestVars, JettonTestInitVars, mint } from './JettonMasterHelpFunction';

describe('JettonWallet Transfer test', () => {

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


    it('should transfer jettons', async () => {
        const sender = initVars.deployerWallet;
        const queryId = 0n;
        const currentAmount = 100n;
        const destinationAddress = initVars.secondWallet.address;
        const responseDestination = initVars.deployerWallet.address;
        const forwardTonAmount = 0n;
        const forwardPayload = beginCell().storeUint(0, 1).endCell().asSlice();

        const msg: Transfer = {
            $$type: 'Transfer',
            queryId: queryId,
            amount: currentAmount,
            destination: destinationAddress,
            responseDestination: responseDestination,
            customPayload: Cell.EMPTY,
            forwardTonAmount: forwardTonAmount,
            forwardPayload: forwardPayload
        };

        const txResult = await jettonWallet.send(sender.getSender(), { value: JETTON_TRANSFER_FEE }, msg);

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonWallet.address,
            success: true
        });

        const outMsg: InternalTransfer = {
            $$type: 'InternalTransfer',
            queryId: queryId,
            amount: currentAmount,
            from: sender.address,
            responseAddress: responseDestination,
            forwardTonAmount: forwardTonAmount,
            forwardPayload: forwardPayload
        };

        const internalTransfer = beginCell();
        storeInternalTransfer(outMsg)(internalTransfer);

        const destinationWallet = await JettonWallet.fromInit(destinationAddress, jettonMaster.address);

        expect(txResult.transactions).toHaveTransaction({
            from: jettonWallet.address,
            to: destinationWallet.address,
            success: true,
            body: internalTransfer.endCell()
        });

        const destinationJettonWallet = initVars.blockchain.openContract(destinationWallet);

        const jettonWalletData = await jettonWallet.getGetWalletData();
        const destinationData = await destinationJettonWallet.getGetWalletData();

        expect(destinationData.balance).toEqual(currentAmount);
        expect(jettonWalletData.balance).toEqual(mintedAmount - currentAmount);
    });

    it('should transfer jettons and send Excesses', async () => {
        const sender = initVars.deployerWallet;
        const queryId = 0n;
        const amount = 100n;
        const destinationAddress =initVars.secondWallet.address;
        const responseDestination = initVars.deployerWallet.address;
        const forwardTonAmount = 0n;
        const forwardPayload = beginCell().storeUint(0, 1).endCell().asSlice();

        const msg: Transfer = {
            $$type: 'Transfer',
            queryId: queryId,
            amount: amount,
            destination: destinationAddress,
            responseDestination: responseDestination,
            customPayload: Cell.EMPTY,
            forwardTonAmount: forwardTonAmount,
            forwardPayload: forwardPayload
        };

        const txResult = await jettonWallet.send(sender.getSender(), { value: JETTON_TRANSFER_FEE }, msg);

        const outMsg: Excesses = {
            $$type: 'Excesses',
            queryId: queryId
        };

        const excesses = beginCell();
        storeExcesses(outMsg)(excesses);

        const destinationWallet = await JettonWallet.fromInit(destinationAddress, jettonMaster.address);

        expect(txResult.transactions).toHaveTransaction({
            from: destinationWallet.address,
            to: responseDestination,
            success: true,
            body: excesses.endCell()
        });
    });

    it('should transfer jettons and send TransferNotification with forwardTonAmount', async () => {
        const sender = initVars.deployerWallet;
        const queryId = 0n;
        const amount = 100n;
        const destinationAddress = initVars.secondWallet.address;
        const responseDestination = initVars.deployerWallet.address;
        const forwardTonAmount = toNano("0.005");
        const forwardPayload = beginCell().storeUint(0, 1).endCell().asSlice();

        const msg: Transfer = {
            $$type: 'Transfer',
            queryId: queryId,
            amount: amount,
            destination: destinationAddress,
            responseDestination: responseDestination,
            customPayload: Cell.EMPTY,
            forwardTonAmount: forwardTonAmount,
            forwardPayload: forwardPayload
        };

        const txResult = await jettonWallet.send(sender.getSender(), { value: (JETTON_TRANSFER_FEE + forwardTonAmount) }, msg);

        const outMsg: TransferNotification = {
            $$type: 'TransferNotification',
            queryId: queryId,
            amount: amount,
            sender: sender.address,
            forwardPayload: forwardPayload
        };

        const transferNotification = beginCell();
        storeTransferNotification(outMsg)(transferNotification);

        const destinationWallet = await JettonWallet.fromInit(destinationAddress, jettonMaster.address);

        expect(txResult.transactions).toHaveTransaction({
            from: destinationWallet.address,
            to: initVars.secondWallet.address,
            success: true,
            body: transferNotification.endCell()
        });
    });

    it('should transfer jettons emit Invalid sender', async () => {
        const sender = initVars.secondWallet;
        const queryId = 0n;
        const amount = 100n;
        const destinationAddress = initVars.secondWallet.address;
        const responseDestination = initVars.deployerWallet.address;
        const forwardTonAmount = 0n;
        const forwardPayload = beginCell().storeUint(0, 1).endCell().asSlice();

        const msg: Transfer = {
            $$type: 'Transfer',
            queryId: queryId,
            amount: amount,
            destination: destinationAddress,
            responseDestination: responseDestination,
            customPayload: Cell.EMPTY,
            forwardTonAmount: forwardTonAmount,
            forwardPayload: forwardPayload
        };

        const txResult = await jettonWallet.send(sender.getSender(), { value: JETTON_TRANSFER_FEE }, msg);

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonWallet.address,
            success: false,
            exitCode: 4429 //4429: Invalid sender
        });
    });

    it('should transfer jettons emit Invalid value! need more value', async () => {
        const sender = initVars.deployerWallet;
        const queryId = 0n;
        const amount = 100n;
        const destinationAddress = initVars.secondWallet.address;
        const responseDestination = initVars.deployerWallet.address;
        const forwardTonAmount = 0n;
        const forwardPayload = beginCell().storeUint(0, 1).endCell().asSlice();
        const smallValue = toNano('0.01');

        const msg: Transfer = {
            $$type: 'Transfer',
            queryId: queryId,
            amount: amount,
            destination: destinationAddress,
            responseDestination: responseDestination,
            customPayload: Cell.EMPTY,
            forwardTonAmount: forwardTonAmount,
            forwardPayload: forwardPayload
        };

        const txResult = await jettonWallet.send(sender.getSender(), { value: smallValue }, msg);

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonWallet.address,
            success: false,
            exitCode: 25090 //25090: Invalid value! need more value
        });
    });

    it('should transfer jettons emit Invalid balance', async () => {
        const sender = initVars.deployerWallet;
        const queryId = 0n;
        const largeAmount = 10000n;
        const destinationAddress = initVars.secondWallet.address;
        const responseDestination = initVars.deployerWallet.address;
        const forwardTonAmount = 0n;
        const forwardPayload = beginCell().storeUint(0, 1).endCell().asSlice();

        const msg: Transfer = {
            $$type: 'Transfer',
            queryId: queryId,
            amount: largeAmount,
            destination: destinationAddress,
            responseDestination: responseDestination,
            customPayload: Cell.EMPTY,
            forwardTonAmount: forwardTonAmount,
            forwardPayload: forwardPayload
        };

        const txResult = await jettonWallet.send(sender.getSender(), { value: JETTON_TRANSFER_FEE }, msg);

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonWallet.address,
            success: false,
            exitCode: 62972 //62972: Invalid balance
        });
    });

    it('should internal transfer emit Invalid sender', async () => {
        const sender = initVars.deployerWallet;
        const queryId = 0n;
        const currentAmount = 100n;
        const responseDestination = initVars.deployerWallet.address;
        const forwardTonAmount = 0n;
        const forwardPayload = beginCell().storeUint(0, 1).endCell().asSlice();

        const msg: InternalTransfer = {
            $$type: 'InternalTransfer',
            queryId: queryId,
            amount: currentAmount,
            from: sender.address,
            responseAddress: responseDestination,
            forwardTonAmount: forwardTonAmount,
            forwardPayload: forwardPayload
        };

        const txResult = await jettonWallet.send(sender.getSender(), { value: JETTON_TRANSFER_FEE }, msg);

        expect(txResult.transactions).toHaveTransaction({
            from: sender.address,
            to: jettonWallet.address,
            success: false,
            exitCode: 4429 //4429: Invalid sender
        });
    });
});
