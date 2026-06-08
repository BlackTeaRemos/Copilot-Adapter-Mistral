import { Mistral } from '@mistralai/mistralai';
import { ExtensionContext, LogOutputChannel, window } from 'vscode';
import { createMistralClient } from './client/index.js';

export type AuthDeps = {
    context: ExtensionContext;
    log: LogOutputChannel;
    getClient: () => Mistral | null;
    setClient: ( client: Mistral | null ) => void;
    invalidateModelCache: () => void;
    fireModelInfoChange: () => void;
    validateApiKey: ( apiKey: string ) => Promise<boolean>;
};

export async function validateApiKey( apiKey: string, log: LogOutputChannel ): Promise<boolean> {
    try {
        const testClient = createMistralClient( apiKey, log );
        await testClient.models.list();
        return true;
    } catch( error ) {
        const statusCode = ( error as { statusCode?: unknown; } ).statusCode;
        if ( statusCode === 401 || statusCode === 403 ) {
            return false;
        }
        return true;
    }
}

export async function setApiKey( deps: AuthDeps ): Promise<string | undefined> {
    const { context, log } = deps;
    let apiKey: string | undefined = await context.secrets.get( `MISTRAL_API_KEY` );
    log.debug( `[Mistral] Prompting user for API key (existing present: ` + !!apiKey + `)` );
    apiKey = await window.showInputBox( {
        placeHolder: `Mistral API Key`,
        password: true,
        value: apiKey || ``,
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
        log.info( `[Mistral] setApiKey canceled by user` );
        return undefined;
    }

    const isValid = await deps.validateApiKey( trimmedApiKey );
    if ( !isValid ) {
        log.warn( `[Mistral] Provided API key failed validation` );
        await window.showErrorMessage( `Invalid Mistral API key. Please check your key and try again.` );
        return undefined;
    }

    log.info( `[Mistral] Storing API key and initializing client` );
    try {
        await context.secrets.store( `MISTRAL_API_KEY`, trimmedApiKey );
        log.info( `[Mistral] API key stored successfully` );
    } catch( e ) {
        log.warn( `[Mistral] Failed to store API key in secret storage: ` + String( e ) );
    }
    deps.setClient( createMistralClient( trimmedApiKey, log ) );
    deps.invalidateModelCache();
    deps.fireModelInfoChange();
    return trimmedApiKey;
}

export async function initClient( silent: boolean, deps: AuthDeps ): Promise<boolean> {
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
    }
    log.debug( `[Mistral] initClient result: ` + !!apiKey );
    return !!apiKey;
}
