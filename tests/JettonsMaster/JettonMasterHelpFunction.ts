import { Address, beginCell, Cell, SenderArguments, SendMode, storeStateInit, toNano } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { KeyPair, mnemonicToPrivateKey, sign } from '@ton/crypto';
import { JettonMaster, Mint, JETTON_DEPLOY_FEE, storeMint, ProvideWalletAddress } from '../../wrappers/JettonMaster';
import { VESTING_DEPLOY_FEE, Deploy, JettonVesting, VestingConfig, deploy, toCell } from '../../wrappers/JettonVesting';

const testFirstMnemonic: string =
    'door dumb ready phone siege attend buffalo obey very universe picnic armor young often habit much bring business flame assume version laptop try giggle';
const testSecondMnemonic: string =
    'door dumb ready ice siege attend buffalo obey very universe picnic armor young often habit much bring business flame assume version laptop try giggle';

export interface JettonTestInitVars {
    blockchain: Blockchain;
    deployerWallet: SandboxContract<TreasuryContract>;
    secondWallet: SandboxContract<TreasuryContract>;
    firstKeyPair: KeyPair;
    secondKeyPair: KeyPair;
    decimals: bigint;
    maxSupply: bigint;
    contentPath: string;
    contentCell: Cell;
}

export async function InitDefaultTestVars(): Promise<JettonTestInitVars> {
    const blockchain: Blockchain = await Blockchain.create();
    const deployerWallet: SandboxContract<TreasuryContract> = await blockchain.treasury('deployer');
    const secondWallet: SandboxContract<TreasuryContract> = await blockchain.treasury('secondWallet');
    const firstKeyPair: KeyPair = await mnemonicToPrivateKey(testFirstMnemonic.split(' '));
    const secondKeyPair: KeyPair = await mnemonicToPrivateKey(testSecondMnemonic.split(' '));
    const decimals: bigint = BigInt(9);
    const maxSupply: bigint = BigInt(1000000000) * BigInt(10) ** decimals; // 1_000_000_000 jettons with 9 decimals
    const contentPath = 'https://test.game.ivklim.com/spacecat/jetton/jetton5.json';
    const contentCell: Cell = beginCell().storeStringTail(contentPath).endCell();

    return {
        blockchain,
        deployerWallet,
        secondWallet,
        firstKeyPair,
        secondKeyPair,
        decimals,
        maxSupply,
        contentPath,
        contentCell,
    };
}

export async function DeployJettonMaster(
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
    owner: Address,
    content: Cell,
    maxSupply: bigint,
) {
    const jettonMaster = blockchain.openContract(await JettonMaster.fromInit(owner, content, maxSupply));

    const deployResult = await jettonMaster.send(
        deployer.getSender(),
        {
            value: JETTON_DEPLOY_FEE,
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        },
    );

    return { jettonMaster, deployResult };
}

export async function mint(
    jettonMaster: SandboxContract<JettonMaster>,
    sender: SandboxContract<TreasuryContract>,
    value: bigint,
    toAddress: Address,
    amount: bigint,
    responseDestination: Address,
) {
    const mintMsg: Mint = {
        $$type: 'Mint',
        to: toAddress,
        amount: amount,
        responseDestination: responseDestination,
    };

    return await jettonMaster.send(sender.getSender(), { value: value }, mintMsg);
}

export async function provideWalletAddress(
    jettonMaster: SandboxContract<JettonMaster>,
    sender: SandboxContract<TreasuryContract>,
    value: bigint,
    queryId: bigint,
    ownerAddress: Address,
    includeAddress: boolean,
) {
    const provideWalletAddressMsg: ProvideWalletAddress = {
        $$type: 'ProvideWalletAddress',
        queryId: queryId,
        ownerAddress: ownerAddress,
        includeAddress: includeAddress,
    };

    return await jettonMaster.send(sender.getSender(), { value: value }, provideWalletAddressMsg);
}

export async function DeployJettonVesting(
    blockchain: Blockchain,
    jettonMaster: SandboxContract<JettonMaster>,
    deployer: SandboxContract<TreasuryContract>,
    index: bigint = 0n,
    isCadencePrivate: boolean,
    tgeAt: bigint,
    startAt: bigint,
    durationSeconds: bigint,
    vestingCadenceSeconds: bigint,
    claimDeadline: bigint,
) {
    const vestingConfig: VestingConfig = {
        $$type: 'VestingConfig',
        isCadencePrivate: isCadencePrivate,
        tgeAt: tgeAt,
        startAt: startAt,
        durationSeconds: durationSeconds,
        vestingCadence: vestingCadenceSeconds,
        claimDeadline: claimDeadline,
    };

    const jettonVesting = blockchain.openContract(await JettonVesting.fromInit(index, vestingConfig));

    const vestingJettonWallet = await jettonMaster.getGetWalletAddress(jettonVesting.address);

    const jettonVestingDeploy: Deploy = {
        $$type: 'Deploy',
        tokenWallet: vestingJettonWallet,
        allocator: deployer.address,
    };

    const deployResult = await jettonVesting.send(
        deployer.getSender(),
        {
            value: VESTING_DEPLOY_FEE,
        },

        jettonVestingDeploy
    );

    return { jettonVesting, deployResult };
}
