export interface Attempt {
    processId: string;
    signInUrl: string;
    pollUrl: string;
    expiresAt: number;
    codeVerifier: string;
}
