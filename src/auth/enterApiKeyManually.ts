import { window } from 'vscode';
import { AuthDeps } from './authDeps.js';
import { storeAndActivate } from './storeAndActivate.js';

/** Manual API-key entry fallback. */
export async function enterApiKeyManually( deps: AuthDeps ): Promise<string | undefined> {
    const { context, log } = deps;
    const existing = await context.secrets.get( `MISTRAL_API_KEY` );
    log.debug( `[Mistral] Prompting user for API key (existing present: ` + !!existing + `)` );
    const apiKey = await window.showInputBox( {
        placeHolder: `Mistral API Key`,
        password: true,
        value: existing || ``,
        prompt: `Enter your Mistral API key (get one at https://console.mistral.ai/)`,
        ignoreFocusOut: true,
        validateInput: value => {
            if ( !value || value.trim().length === 0 ) {
                return `API key is required`;
            }
            if ( value.length < 20 ) {
                return `API key appears too short`;
            }
            return undefined;
        },
    } );

    const trimmedApiKey = apiKey?.trim();
    if ( !trimmedApiKey ) {
        log.info( `[Mistral] enterApiKeyManually canceled by user` );
        return undefined;
    }

    const isValid = await deps.validateApiKey( trimmedApiKey );
    if ( !isValid ) {
        log.warn( `[Mistral] Provided API key failed validation` );
        await window.showErrorMessage( `Invalid Mistral API key. Please check your key and try again.` );
        return undefined;
    }

    return storeAndActivate( deps, trimmedApiKey );
}
