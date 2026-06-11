import { createMistralClient } from '../client/index.js';
import { AuthDeps } from './authDeps.js';
import { setApiKey } from './setApiKey.js';

export async function initClient ( silent: boolean, deps: AuthDeps ): Promise<boolean> {
    if ( deps.getClient() ) {
        return true;
    }
    const { context, log } = deps;
    let apiKey: string | undefined = await context.secrets.get( `MISTRAL_API_KEY` );
    log.debug( `[Mistral] initClient called (silent=` + silent + `, hasStoredKey=` + !!apiKey + `)` );
    if ( !silent && !apiKey ) {
        apiKey = await setApiKey( deps );
    } else if ( apiKey ) {
        deps.setClient( createMistralClient( apiKey, log ) );
        deps.fireModelInfoChange();
    }
    log.debug( `[Mistral] initClient result: ` + !!apiKey );
    return !!apiKey;
}
