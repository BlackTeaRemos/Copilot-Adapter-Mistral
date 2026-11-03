/**
 * PKCE code generation for the browser sign-in flow. Produces the high-entropy
 * verifier kept locally and the S256 challenge sent to the server, so the
 * exchange can only be completed by the client that started the attempt.
 */
export class PkceCodes {
    public GenerateVerifier (): string {
        const bytes = new Uint8Array( 64 );
        crypto.getRandomValues( bytes );
        return this.__Base64UrlEncode( bytes );
    }

    public async GenerateChallenge ( verifier: string ): Promise<string> {
        const digest = await crypto.subtle.digest( `SHA-256`, new TextEncoder().encode( verifier ) );
        return this.__Base64UrlEncode( new Uint8Array( digest ) );
    }

    private __Base64UrlEncode ( bytes: Uint8Array ): string {
        let binary = ``;
        for ( const b of bytes ) {
            binary += String.fromCharCode( b );
        }
        return btoa( binary ).replace( /\+/g, `-` ).replace( /\//g, `_` ).replace( /=+$/, `` );
    }
}
