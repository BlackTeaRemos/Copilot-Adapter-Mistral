import { Mistral } from '@mistralai/mistralai';
import { workspace } from 'vscode';
import type { MistralClientLogger } from './clientLogger.js';

export function createMistralClient( apiKey: string, log: MistralClientLogger ): Mistral {
    const config = workspace.getConfiguration( `mistral` );
    const baseUrl = config.get<string>( `baseUrl` );
    const options: ConstructorParameters<typeof Mistral>[ 0 ] = {
        apiKey,
        retryConfig: {
            strategy: `backoff`,
            backoff: { initialInterval: 1000, maxInterval: 60000, exponent: 2, maxElapsedTime: 300000 },
            retryConnectionErrors: true,
        },
    };
    if ( baseUrl ) {
        options.serverURL = baseUrl;
        log.info( `[Mistral] Using custom base URL: ` + baseUrl );
    }
    return new Mistral( options );
}
