import { SandboxContract } from '@ton/sandbox';
import '@ton/test-utils';

import { JETTON_MINT_FEE, JettonMaster } from '../../wrappers/JettonMaster';
import {
    JettonWallet,
    JETTON_TRANSFER_FEE,
    JETTON_BURN_FEE,
    JETTON_WITHDRAW_FEE,
    MIN_TONS_FOR_STORAGE,
} from '../../wrappers/JettonWallet';
import { DeployJettonMaster, InitDefaultTestVars, JettonTestInitVars, mint } from './JettonMasterHelpFunction';
import { SendMode, toNano } from '@ton/core';

describe('JettonWallet Withdraw test', () => {
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

        const mintResult = await mint(
            jettonMaster,
            initVars.deployerWallet,
            JETTON_MINT_FEE,
            initVars.deployerWallet.address,
            mintedAmount,
            initVars.deployerWallet.address,
        );

        const jettonWalletAddress = await jettonMaster.getGetWalletAddress(initVars.deployerWallet.address);
        jettonWallet = initVars.blockchain.openContract(await JettonWallet.fromAddress(jettonWalletAddress));

        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: jettonWalletAddress,
            success: true,
            deploy: true,
        });

        const balanceJettonBeforeReceiveTokens = (await initVars.blockchain.provider(jettonWallet.address).getState())
            .balance;
        const tx = await initVars.deployerWallet.send({
            to: jettonWalletAddress,
            value: toNano('1'),
            bounce: false,
            sendMode: SendMode.IGNORE_ERRORS,
        });
        const balanceJettonAfterReceiveTokens = (await initVars.blockchain.provider(jettonWallet.address).getState())
            .balance;

        expect(balanceJettonAfterReceiveTokens > balanceJettonBeforeReceiveTokens).toBeTruthy();
    });

    it('should withrow from jetton excluding min storage gas ', async () => {
        const withdrawTx = await jettonWallet.send(
            initVars.deployerWallet.getSender(),
            {
                value: JETTON_WITHDRAW_FEE,
            },
            'Withdraw',
        );

        expect(withdrawTx.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonWallet.address,
            success: true,
        });

        const balanceJettonAfterWithdraw = (await initVars.blockchain.provider(jettonWallet.address).getState())
            .balance;
        console.log('balanceJettonAfterWithdraw: ', balanceJettonAfterWithdraw);
        expect(balanceJettonAfterWithdraw == MIN_TONS_FOR_STORAGE).toBeTruthy();
    });
});
