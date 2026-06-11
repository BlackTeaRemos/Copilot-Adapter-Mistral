import { BrowserSignInError } from './browserSignInError.js';

export async function parseJsonObject ( response: Response ): Promise<Record<string, unknown>> {
    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        throw new BrowserSignInError( `Sign-in returned an unreadable response.`, `provider_error` );
    }
    if ( payload === null || typeof payload !== `object` || Array.isArray( payload ) ) {
        throw new BrowserSignInError( `Sign-in returned an unexpected response.`, `provider_error` );
    }
    return payload as Record<string, unknown>;
}
