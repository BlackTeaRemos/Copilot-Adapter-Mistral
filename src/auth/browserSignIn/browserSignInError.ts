import { BrowserSignInErrorCode } from './browserSignInErrorCode.js';

export class BrowserSignInError extends Error {
    public readonly code: BrowserSignInErrorCode;
    constructor ( message: string, code: BrowserSignInErrorCode ) {
        super( message );
        this.name = `BrowserSignInError`;
        this.code = code;
    }
}
