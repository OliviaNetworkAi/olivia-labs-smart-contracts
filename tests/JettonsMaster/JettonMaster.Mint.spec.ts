import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, beginCell, toNano } from '@ton/core';
import '@ton/test-utils';
import { KeyPair } from '@ton/crypto';

import {
    DeployJettonMaster,
    InitDefaultTestVars,
    JettonTestInitVars,
    mint
} from './JettonMasterHelpFunction';
import {
    JETTON_MINT_FEE,
    JETTON_CLOSE_MINT_FEE,
    JettonMaster,
    MIN_TON_FOR_STORAGE,
} from '../../wrappers/JettonMaster';
import { JettonWallet } from '../../wrappers/JettonWallet';

describe('JettonMaster Mint test', () => {

    let jettonMaster: SandboxContract<JettonMaster>;
    let initVars: JettonTestInitVars;
    let toAddress: Address;
    let amount: bigint;
    let masterOwnerAddress: Address;

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
    it('should mint jetton and totalSupply increases', async () => {
        let data = await jettonMaster.getGetJettonData();
        expect(data.totalSupply).toEqual(0n);

        const mintResult = await mint(jettonMaster, initVars.deployerWallet, JETTON_MINT_FEE, toAddress, amount, masterOwnerAddress);

        expect(mintResult.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: true,
        });

        data = await jettonMaster.getGetJettonData();
        expect(data.totalSupply).toEqual(amount);
    });

    it('should mint jetton and deployed jetton wallet and top up balance', async () => {
        const mintResult = await mint(jettonMaster, initVars.deployerWallet, JETTON_MINT_FEE, toAddress, amount, masterOwnerAddress);

        const jettonWalletAddress = await jettonMaster.getGetWalletAddress(toAddress);

        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: jettonWalletAddress,
            success: true,
            deploy: true,
        });

        const jettonWallet = initVars.blockchain.openContract(await JettonWallet.fromAddress(jettonWalletAddress));
        const jettonWalletData = await jettonWallet.getGetWalletData();
        expect(jettonWalletData.balance).toEqual(amount);
    });

    it('should mint jetton emit require Owner', async () => {
        const mintResult = await mint(jettonMaster, initVars.secondWallet, JETTON_MINT_FEE, toAddress, amount, masterOwnerAddress);

        expect(mintResult.transactions).toHaveTransaction({
            from: initVars.secondWallet.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 132, //132: Access denied
        });
    });

    it('should mint jetton emit Maximum supply exceeded', async () => {
        //mint maxSupply - amount
        const mintLessMaxSupply = await mint(jettonMaster, initVars.deployerWallet, JETTON_MINT_FEE, toAddress, initVars.maxSupply - amount, masterOwnerAddress);

        //mint more than maxSupply
        const mintMoreMaxSupply = await mint(jettonMaster, initVars.deployerWallet, JETTON_MINT_FEE, toAddress, amount + amount, masterOwnerAddress);

        expect(mintMoreMaxSupply.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 62618, //62618: Maximum supply exceeded
        });
    });

    it('should mint jetton max supply and try more emit Minting is disabled', async () => {
        //mint maxSupply
        const mintLessMaxSupply = await mint(jettonMaster, initVars.deployerWallet, JETTON_MINT_FEE, toAddress, initVars.maxSupply, masterOwnerAddress);

        //mint more than maxSupply
        const mintMoreMaxSupply = await mint(jettonMaster, initVars.deployerWallet, JETTON_MINT_FEE, toAddress, amount, masterOwnerAddress);

        expect(mintMoreMaxSupply.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 26288, //26288: Minting is disabled
        });

        const data = await jettonMaster.getGetJettonData();
        expect(data.mintable).toBeFalsy();
    });

    it('should mint jetton emit Minting is disabled', async () => {
    
        // const balance = await initVars.deployerWallet.getBalance();
        // console.log('balance: ', balance);

        const closeMint = await jettonMaster.send(
            initVars.deployerWallet.getSender(),
            {
                value: JETTON_CLOSE_MINT_FEE,
            },
            'Close Mint',
        );

        expect(closeMint.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: true,
        });

        const mintResult = await mint(jettonMaster, initVars.deployerWallet, JETTON_MINT_FEE, toAddress, amount, masterOwnerAddress);

        expect(mintResult.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 26288, //26288: Minting is disabled
        });

        const data = await jettonMaster.getGetJettonData();
        expect(data.mintable).toBeFalsy();
    });

    it('close mint emit ', async () => {
        const closeMintTx = await jettonMaster.send(
            initVars.secondWallet.getSender(),
            {
                value: JETTON_CLOSE_MINT_FEE,
            },
            'Close Mint',
        );
        expect(closeMintTx.transactions).toHaveTransaction({
            from: initVars.secondWallet.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 132, //132: Access denied
        });
    });

    //gas test
    it('should mint with and save storage', async () => {
        const mintResult = await mint(jettonMaster, initVars.deployerWallet, JETTON_MINT_FEE, toAddress, amount, masterOwnerAddress);

        expect(mintResult.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: true,
        });
    
        const balanceAfter = (await initVars.blockchain.provider(jettonMaster.address).getState()).balance;

        expect(balanceAfter).toEqual(MIN_TON_FOR_STORAGE); 
    });

    it('should mint emit with Not enough TON from sender to jetton master', async () => {
        const mintResult = await mint(jettonMaster, initVars.deployerWallet, toNano("0.005"), toAddress, amount, masterOwnerAddress);

        expect(mintResult.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: false,
            exitCode: -14 // Not enough TON
        });
    });

    it('should mint emit with Not enough TON from jetton master to jetton wallet', async () => {
        const mintResult = await mint(jettonMaster, initVars.deployerWallet, toNano("0.02"), toAddress, amount, masterOwnerAddress);
        const jettonWalletAddress = await jettonMaster.getGetWalletAddress(toAddress);

        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: jettonWalletAddress,
            success: false,
            exitCode: -14 // Not enough TON
        });
    });

    it('should close mint emit with Not enough TON from sender to jetton master', async () => {
        const closeMint = await jettonMaster.send(
            initVars.deployerWallet.getSender(),
            {
                value: toNano("0.001"),
            },
            'Close Mint',
        );

        expect(closeMint.transactions).toHaveTransaction({
            from: initVars.deployerWallet.address,
            to: jettonMaster.address,
            success: false,
            exitCode: -14 // Not enough TON
        });
    });
    
});
