import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, beginCell, toNano } from '@ton/core';
import '@ton/test-utils';
import { KeyPair } from '@ton/crypto';

import {
    DeployJettonMaster,
    InitDefaultTestVars,
    JettonTestInitVars,
    mint,
    provideWalletAddress
} from './JettonMasterHelpFunction';
import {
    JETTON_PROVIDE_WALLET_ADDRESS_FEE,
    JettonMaster,
    MIN_TON_FOR_STORAGE,
} from '../../wrappers/JettonMaster';
import { JettonWallet } from '../../wrappers/JettonWallet';

describe('JettonMaster Discovery test', () => {

    let jettonMaster: SandboxContract<JettonMaster>;
    let initVars: JettonTestInitVars;
    let toAddress: Address;
    let amount: bigint;
    let masterOwnerAddress: Address;

    const additionalFeeForRequest = toNano('0.0018');

    beforeEach(async () => {
        initVars = await InitDefaultTestVars();

        toAddress = initVars.secondWallet.address;
        amount = 1000n;
        masterOwnerAddress = initVars.deployerWallet.address;

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

    //Mint test
    it('should provide Wallet Address', async () => {
        let data = await jettonMaster.getGetJettonData();
        expect(data.totalSupply).toEqual(0n);

        const provideWalletAddressTx = await provideWalletAddress(jettonMaster, initVars.deployerWallet, JETTON_PROVIDE_WALLET_ADDRESS_FEE + additionalFeeForRequest, 0n, initVars.deployerWallet.address, false);

        expect(provideWalletAddressTx.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: true,
        });

        expect(provideWalletAddressTx.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: initVars.deployerWallet.address,
            success: true,
        });
    });


    //gas test
    it('should provide Wallet Address and save storage', async () => {
        const provideWalletAddressTx = await provideWalletAddress(jettonMaster, initVars.deployerWallet, JETTON_PROVIDE_WALLET_ADDRESS_FEE + additionalFeeForRequest, 0n, initVars.deployerWallet.address, false);

        expect(provideWalletAddressTx.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: true,
        });
    
        const balanceAfter = (await initVars.blockchain.provider(jettonMaster.address).getState()).balance;

        expect(balanceAfter == MIN_TON_FOR_STORAGE).toBeTruthy(); 
    });

    it('should mint emit with Not enough TON from sender to jetton master', async () => {
        const provideWalletAddressTx = await provideWalletAddress(jettonMaster, initVars.deployerWallet, JETTON_PROVIDE_WALLET_ADDRESS_FEE - 1n, 0n, initVars.deployerWallet.address, false);

        expect(provideWalletAddressTx.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 23951 // 23951: Insufficient gas
        });
    });
});
