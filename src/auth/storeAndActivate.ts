import { createMistralClient } from '../client/index.js';
import { AuthDeps } from './authDeps.js';

/** Persist the key, build the client, and refresh model state. */
export async function storeAndActivate ( deps: AuthDeps, apiKey: string ): Promise<string> {
    const { context, log } = deps;
    await context.secrets.store( `MISTRAL_API_KEY`, apiKey );
    log.info( `[Mistral] API key stored successfully` );
    deps.setClient( createMistralClient( apiKey, log ) );
    deps.invalidateModelCache();
    deps.fireModelInfoChange();
    return apiKey;
}
