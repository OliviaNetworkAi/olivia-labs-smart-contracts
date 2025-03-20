import { SandboxContract } from '@ton/sandbox';
import '@ton/test-utils';

import {
    DeployJettonMaster,
    InitDefaultTestVars,
    JettonTestInitVars,
} from './JettonMasterHelpFunction';
import {
    JettonMaster,
    MIN_TON_FOR_STORAGE,
} from '../../wrappers/JettonMaster';
import { JettonWallet } from '../../wrappers/JettonWallet';

describe('JettonMaster Deploy test', () => {

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

    it('should deploy jetton master with correct data', async () => {
        const data = await jettonMaster.getGetJettonData();

        const contentString = data.content.asSlice().loadStringTail();
        const codeInit = (await JettonWallet.fromInit(jettonMaster.address, jettonMaster.address)).init;
        expect(data.mintable).toEqual(true);
        expect(data.totalSupply).toEqual(0n);
        expect(data.owner).toEqualAddress(initVars.deployerWallet.address);
        expect(initVars.contentPath).toEqual(contentString);
        expect(data.walletCode).toEqualCell(codeInit!.code);
    });

    it('should deploy jetton master with correct max supply', async () => {
        const maxSupply = await jettonMaster.getGetMaxSupply();
        expect(maxSupply).toEqual(initVars.maxSupply);
    });

    it('should deploy jetton master with correct owner', async () => {
        const owner = await jettonMaster.getOwner();
        expect(owner).toEqualAddress(initVars.deployerWallet.address);
    });

    //check balance
    it('should deploy jetton master with correct balance', async () => {
        const balanceJettonAfterReceiveTokens = (await initVars.blockchain.provider(jettonMaster.address).getState()).balance;

        expect(balanceJettonAfterReceiveTokens).toEqual(MIN_TON_FOR_STORAGE);
    });
});
