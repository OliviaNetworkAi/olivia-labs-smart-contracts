import { SandboxContract } from '@ton/sandbox';
import { SendMode, toNano } from '@ton/core';
import '@ton/test-utils';

import { DeployJettonMaster, InitDefaultTestVars, JettonTestInitVars, mint } from './JettonMasterHelpFunction';
import { JettonMaster, JETTON_WITHDRAW_FEE, MIN_TON_FOR_STORAGE } from '../../wrappers/JettonMaster';

describe('JettonMaster Withdraw test', () => {
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

        const balanceJettonBeforeReceiveTokens = (await initVars.blockchain.provider(jettonMaster.address).getState())
            .balance;
        const tx = await initVars.deployerWallet.send({
            to: jettonMaster.address,
            value: toNano('1'),
            bounce: false,
            sendMode: SendMode.IGNORE_ERRORS,
        });
        const balanceJettonAfterReceiveTokens = (await initVars.blockchain.provider(jettonMaster.address).getState())
            .balance;

        expect(balanceJettonAfterReceiveTokens > balanceJettonBeforeReceiveTokens).toBeTruthy();
    });

    it('should withrow from jetton excluding min storage gas ', async () => {
        const withdrawTx = await jettonMaster.send(
            initVars.deployerWallet.getSender(),
            {
                value: JETTON_WITHDRAW_FEE,
            },
            'Withdraw',
        );

        expect(withdrawTx.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: true,
        });

        const balanceJettonAfterWithdraw = (await initVars.blockchain.provider(jettonMaster.address).getState()).balance;
        console.log('balanceJettonAfterWithdraw: ', balanceJettonAfterWithdraw);
        expect(balanceJettonAfterWithdraw == MIN_TON_FOR_STORAGE).toBeTruthy();
    });
});
