import { SandboxContract } from '@ton/sandbox';
import '@ton/test-utils';

import {
    JETTON_MINT_FEE,
    JettonMaster,
} from '../../wrappers/JettonMaster';
import { JettonWallet } from '../../wrappers/JettonWallet';
import { DeployJettonMaster, InitDefaultTestVars, JettonTestInitVars, mint } from './JettonMasterHelpFunction';

describe('JettonWallet Deploy test', () => {

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

    it('should deploy jetton wallet with correct data', async () => {
        const data = await jettonWallet.getGetWalletData();

        const codeInit = (await JettonWallet.fromInit(initVars.deployerWallet.address, jettonMaster.address)).init;

        expect(data.balance).toEqual(mintedAmount);
        expect(data.owner).toEqualAddress(initVars.deployerWallet.address);
        expect(data.master).toEqualAddress(jettonMaster.address);
        expect(data.walletCode).toEqualCell(codeInit!.code);
    });
});
