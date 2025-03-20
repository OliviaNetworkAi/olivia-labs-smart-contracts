import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/Jetton/jetton_master.tact',
    options: {
        debug: true,
    },
};