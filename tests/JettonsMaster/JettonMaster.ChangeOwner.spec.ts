import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, beginCell, toNano } from '@ton/core';
import '@ton/test-utils';
import { KeyPair } from '@ton/crypto';

import {
    DeployJettonMaster,
    InitDefaultTestVars,
    JettonTestInitVars,
    mint
} from './JettonMasterHelpFunction';
import {
    ChangeOwner,
    JETTON_CHANGE_OWNER_FEE,
    JettonMaster
} from '../../wrappers/JettonMaster';

describe('JettonMaster Change Owner test', () => {

    let jettonMaster: SandboxContract<JettonMaster>;
    let initVars: JettonTestInitVars;

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
    });

    it('should deploy jetton master', async () => {
        // the check is done inside beforeEach
        // blockchain and JettonMasterWithSignTransfer are ready to use
    });
    
    //change owner test
    it('should change owner', async () => {

        let data = await jettonMaster.getGetJettonData();
        expect(data.owner).toEqualAddress(initVars.deployerWallet.address);

        const changeOwnerMsg: ChangeOwner = {
            $$type: 'ChangeOwner',
            queryId: 0n,
            newOwner: initVars.secondWallet.address,
        };

        const changeOwner = await jettonMaster.send(
            initVars.deployerWallet.getSender(),
            {
                value: JETTON_CHANGE_OWNER_FEE,
            },
            changeOwnerMsg,
        );

        expect(changeOwner.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: true,
        });

        data = await jettonMaster.getGetJettonData();
        expect(data.owner).toEqualAddress(initVars.secondWallet.address);
    });

    it('should change owner emit Access denied', async () => {

        const changeOwnerMsg: ChangeOwner = {
            $$type: 'ChangeOwner',
            queryId: 0n,
            newOwner: initVars.secondWallet.address,
        };

        const changeOwner = await jettonMaster.send(
            initVars.secondWallet.getSender(),
            {
                value: JETTON_CHANGE_OWNER_FEE,
            },
            changeOwnerMsg,
        );

        expect(changeOwner.transactions).toHaveTransaction({
            from: initVars.secondWallet.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 132, //132: Access denied
        });
    });

    //gas test

    it('should close with 0.01', async () => {
        const changeOwnerMsg: ChangeOwner = {
            $$type: 'ChangeOwner',
            queryId: 0n,
            newOwner: initVars.secondWallet.address,
        };

        const changeOwner = await jettonMaster.send(
            initVars.deployerWallet.getSender(),
            {
                value: toNano("0.08"),
            },
            changeOwnerMsg,
        );

        expect(changeOwner.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: true
        });
    });

    it('should close mint emit with Not enough TON from sender to jetton master', async () => {
        const changeOwnerMsg: ChangeOwner = {
            $$type: 'ChangeOwner',
            queryId: 0n,
            newOwner: initVars.secondWallet.address,
        };

        const changeOwner = await jettonMaster.send(
            initVars.deployerWallet.getSender(),
            {
                value: toNano("0.001"),
            },
            changeOwnerMsg,
        );

        expect(changeOwner.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: false,
            exitCode: -14 // Not enough TON
        });
    });
});
