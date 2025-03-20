import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, beginCell, toNano } from '@ton/core';
import '@ton/test-utils';
import { KeyPair } from '@ton/crypto';

import { DeployJettonMaster, InitDefaultTestVars, JettonTestInitVars, mint } from './JettonMasterHelpFunction';
import {
    JETTON_UPDATE_CONTENT_FEE,
    JettonMaster,
    MIN_TON_FOR_STORAGE,
    TokenUpdateContent,
} from '../../wrappers/JettonMaster';

describe('JettonMaster Token Update Content test', () => {
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

    //TokenUpdateContent test
    it('should update content', async () => {
        const newContentPath = 'path/jettonNew.json';
        const newContent = beginCell().storeStringTail(newContentPath).endCell();

        let data = await jettonMaster.getGetJettonData();
        const contentString = data.content.asSlice().loadStringTail();
        expect(initVars.contentPath).toEqual(contentString);

        const updateContentMsg: TokenUpdateContent = {
            $$type: 'TokenUpdateContent',
            content: newContent,
        };

        const updateContent = await jettonMaster.send(
            initVars.deployerWallet.getSender(),
            {
                value: JETTON_UPDATE_CONTENT_FEE,
            },
            updateContentMsg,
        );

        expect(updateContent.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: true,
        });

        data = await jettonMaster.getGetJettonData();
        const newContentString = data.content.asSlice().loadStringTail();
        expect(newContentPath).toEqual(newContentString);
    });

    it('should update content emit Access denied', async () => {
        const newContentPath = 'path/jettonNew.json';
        const newContent = beginCell().storeStringTail(newContentPath).endCell();

        let data = await jettonMaster.getGetJettonData();
        const contentString = data.content.asSlice().loadStringTail();
        expect(initVars.contentPath).toEqual(contentString);

        const updateContentMsg: TokenUpdateContent = {
            $$type: 'TokenUpdateContent',
            content: newContent,
        };

        const updateContent = await jettonMaster.send(
            initVars.deployerWallet.getSender(),
            {
                value: JETTON_UPDATE_CONTENT_FEE,
            },
            updateContentMsg,
        );

        expect(updateContent.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: true,
        });

        data = await jettonMaster.getGetJettonData();
        const newContentString = data.content.asSlice().loadStringTail();
        expect(newContentPath).toEqual(newContentString);
    });

    //gas test
    it('should save storage', async () => {
        const newContentPath =
            'long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long ';
        const newContent = beginCell().storeStringTail(newContentPath).endCell();

        const updateContentMsg: TokenUpdateContent = {
            $$type: 'TokenUpdateContent',
            content: newContent,
        };

        const updateContent = await jettonMaster.send(
            initVars.deployerWallet.getSender(),
            {
                value: JETTON_UPDATE_CONTENT_FEE,
            },
            updateContentMsg,
        );

        const balanceAfter = (await initVars.blockchain.provider(jettonMaster.address).getState()).balance;

        expect(balanceAfter).toEqual(MIN_TON_FOR_STORAGE);
    });

    it('should emit with Not enough TON', async () => {
        const newContentPath =
            'long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long long ';
        const newContent = beginCell().storeStringTail(newContentPath).endCell();

        const updateContentMsg: TokenUpdateContent = {
            $$type: 'TokenUpdateContent',
            content: newContent,
        };

        const updateContent = await jettonMaster.send(
            initVars.deployerWallet.getSender(),
            {
                value: toNano('0.003'), //need ~'0.004'
            },
            updateContentMsg,
        );

        expect(updateContent.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: false,
            exitCode: -14, // Not enough TON
        });
    });
});
