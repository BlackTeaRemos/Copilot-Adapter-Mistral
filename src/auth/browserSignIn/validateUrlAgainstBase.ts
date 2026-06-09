import { BrowserSignInError } from './browserSignInError.js';

/**
 * Validate a server-returned URL against the expected base: same origin and the
 * path must live under the base path. Mirrors vibe's origin/path check so a
 * compromised or spoofed response can't redirect the browser or our polling to
 * an attacker-controlled host.
 */
export function validateUrlAgainstBase( value: string, baseUrl: string ): string {
    let current: URL;
    let base: URL;
    try {
        current = new URL( value );
        base = new URL( baseUrl );
    } catch {
        throw new BrowserSignInError( `Sign-in returned an invalid URL.`, `invalid_url` );
    }
    if ( current.protocol !== base.protocol || current.host !== base.host ) {
        throw new BrowserSignInError( `Sign-in returned a URL with an unexpected host.`, `invalid_url` );
    }
    const normBase = base.pathname.replace( /\/+$/, `` );
    if ( normBase && current.pathname !== normBase && !current.pathname.startsWith( `${ normBase }/` ) ) {
        throw new BrowserSignInError( `Sign-in returned a URL with an unexpected path.`, `invalid_url` );
    }
    return value;
}
