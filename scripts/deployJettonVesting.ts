import { toNano } from '@ton/core';
import { JettonVesting } from '../wrappers/JettonVesting';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const jettonVesting = provider.open(await JettonVesting.fromInit());

    await jettonVesting.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(jettonVesting.address);

    // run methods on `jettonVesting`
}
