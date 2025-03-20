import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/Vesting/jetton_vesting.tact',
    options: {
        debug: true,
    },
};