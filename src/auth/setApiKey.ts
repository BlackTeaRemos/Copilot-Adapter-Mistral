import { window } from 'vscode';
import { AuthDeps } from './authDeps.js';
import { enterApiKeyManually } from './enterApiKeyManually.js';
import { signInWithBrowser } from './signInWithBrowser.js';

/**
 * Entry point for the "Manage API Key" command. Offers browser sign-in as the
 * primary path and manual API-key entry as the fallback, then stores and
 * activates whichever succeeds.
 */
export async function setApiKey( deps: AuthDeps ): Promise<string | undefined> {
    const { log } = deps;
    const choice = await window.showQuickPick(
        [
            {
                label: `$(globe) Sign in with browser`,
                description: `Recommended`,
                detail: `Authenticate via console.mistral.ai and fetch a key automatically.`,
                method: `browser` as const,
            },
            {
                label: `$(key) Paste API key`,
                detail: `Enter an existing Mistral API key manually.`,
                method: `paste` as const,
            },
        ],
        {
            placeHolder: `How do you want to authenticate with Mistral?`,
            ignoreFocusOut: true,
        },
    );
    if ( !choice ) {
        log.info( `[Mistral] setApiKey canceled by user (no method chosen)` );
        return undefined;
    }
    if ( choice.method === `browser` ) {
        return signInWithBrowser( deps );
    }
    return enterApiKeyManually( deps );
}
