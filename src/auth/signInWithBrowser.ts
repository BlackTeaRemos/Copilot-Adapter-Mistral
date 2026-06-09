import { CancellationTokenSource, ProgressLocation, Uri, env, window } from 'vscode';
import { AuthDeps } from './authDeps.js';
import { BrowserSignInError, BrowserSignInService } from './browserSignIn/index.js';
import { enterApiKeyManually } from './enterApiKeyManually.js';
import { storeAndActivate } from './storeAndActivate.js';

async function attemptSignIn( deps: AuthDeps, state: { signInUrl: string | undefined } ): Promise<string> {
    const { log } = deps;
    const cts = new CancellationTokenSource();
    try {
        const apiKey = await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Signing in to Mistral…`,
                cancellable: true,
            },
            async( progress, token ) => {
                const onCancel = token.onCancellationRequested( () => cts.cancel() );
                try {
                    const abortController = new AbortController();
                    cts.token.onCancellationRequested( () => abortController.abort() );
                    if ( cts.token.isCancellationRequested ) abortController.abort();
                    const service = new BrowserSignInService( {
                        log,
                        signal: abortController.signal,
                        onAttemptStarted: url => { state.signInUrl = url; },
                        openBrowser: url => Promise.resolve( env.openExternal( Uri.parse( url ) ) ),
                        onStatus: status => {
                            const messages: Record<string, string> = {
                                opening_browser: `Opening your browser…`,
                                waiting_for_browser_sign_in: `Waiting for you to finish in the browser…`,
                                exchanging: `Finishing sign-in…`,
                                completed: `Signed in.`,
                            };
                            progress.report( { message: messages[ status ] } );
                        },
                    } );
                    return await service.authenticate();
                } finally {
                    onCancel.dispose();
                }
            },
        );
        // The exchange step already proves the key is valid server-side, so we
        // skip the extra validateApiKey (models.list) round-trip here.
        return storeAndActivate( deps, apiKey );
    } finally {
        cts.dispose();
    }
}

/**
 * Browser sign-in (PKCE) flow. Runs inside a cancellable progress notification;
 * cancelling aborts polling. Falls back to a hint toward manual entry on failure.
 */
export async function signInWithBrowser( deps: AuthDeps ): Promise<string | undefined> {
    const { log } = deps;
    const state = { signInUrl: undefined as string | undefined };
    try {
        return await attemptSignIn( deps, state );
    } catch( err ) {
        if ( err instanceof BrowserSignInError ) {
            log.warn( `[Mistral] Browser sign-in failed (` + err.code + `): ` + err.message );
            // Browser couldn't be opened (e.g. popup blocked): let the user open
            // the page manually and retry, instead of dropping straight to paste.
            if ( err.code === `open_browser_failed` && state.signInUrl ) {
                const action = await window.showErrorMessage(
                    `Couldn't open your browser automatically.`,
                    `Open sign-in page`,
                    `Paste API key instead`,
                );
                if ( action === `Open sign-in page` ) {
                    await env.openExternal( Uri.parse( state.signInUrl ) );
                    return signInWithBrowser( deps );
                }
                if ( action === `Paste API key instead` ) {
                    return enterApiKeyManually( deps );
                }
            } else if ( err.code !== `timed_out` ) {
                const fallback = await window.showErrorMessage( err.message, `Paste API key instead` );
                if ( fallback ) return enterApiKeyManually( deps );
            }
        } else {
            log.warn( `[Mistral] Browser sign-in failed: ` + String( err ) );
            await window.showErrorMessage( `Browser sign-in failed. Please try again.` );
        }
        return undefined;
    }
}
