/**
 * PKCE code generation for the browser sign-in flow. Produces the high-entropy
 * verifier kept locally and the S256 challenge sent to the server, so the
 * exchange can only be completed by the client that started the attempt.
 */
export class PkceCodes {
    /** 64 random bytes, base64url-encoded — the secret held by this client. */
    public static generateVerifier(): string {
        const bytes = new Uint8Array( 64 );
        crypto.getRandomValues( bytes );
        return PkceCodes.base64UrlEncode( bytes );
    }

    /** S256 challenge: base64url( SHA-256( verifier ) ). */
    public static async generateChallenge( verifier: string ): Promise<string> {
        const digest = await crypto.subtle.digest( `SHA-256`, new TextEncoder().encode( verifier ) );
        return PkceCodes.base64UrlEncode( new Uint8Array( digest ) );
    }

    private static base64UrlEncode( bytes: Uint8Array ): string {
        let binary = ``;
        for ( const b of bytes ) {
            binary += String.fromCharCode( b );
        }
        return btoa( binary ).replace( /\+/g, `-` ).replace( /\//g, `_` ).replace( /=+$/, `` );
    }
}
