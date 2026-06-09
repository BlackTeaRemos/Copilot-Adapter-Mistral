import { LogOutputChannel } from 'vscode';
import {
    CLOCK_SKEW_TOLERANCE_MS,
    DEFAULT_BROWSER_AUTH_API_BASE_URL,
    DEFAULT_BROWSER_AUTH_BASE_URL,
    HTTP_GONE,
    HTTP_TOO_MANY_REQUESTS,
    MAX_CONSECUTIVE_POLL_FAILURES,
    POLL_BACKOFF_BASE_MS,
    POLL_BACKOFF_MAX_MS,
    POLL_INTERVAL_MS,
} from './constants.js';
import { Attempt } from './attempt.js';
import { BrowserOpener } from './browserOpener.js';
import { BrowserSignInDeps } from './browserSignInDeps.js';
import { BrowserSignInError } from './browserSignInError.js';
import { BrowserSignInStatus } from './browserSignInStatus.js';
import { CreateProcessPayload } from './createProcessPayload.js';
import { PollPayload } from './pollPayload.js';
import { PkceCodes } from './pkceCodes.js';
import { parseJsonObject } from './parseJsonObject.js';
import { parseRetryAfter } from './parseRetryAfter.js';
import { validateUrlAgainstBase } from './validateUrlAgainstBase.js';

/**
 * Browser sign-in (PKCE polling) flow ported from mistral-vibe.
 *
 * Flow:
 *   1. Generate PKCE verifier + S256 challenge.
 *   2. POST {api}/vibe/sign-in {code_challenge, code_challenge_method:"S256"}
 *        -> {process_id, sign_in_url, poll_url, expires_at}
 *   3. Open sign_in_url in the user's browser.
 *   4. Poll poll_url until status "completed" -> exchange_token.
 *   5. POST {api}/vibe/sign-in/{process_id}/exchange {exchange_token, code_verifier}
 *        -> {api_key}
 *
 * Client good-citizen safeguards (we are a client of Mistral's backend, so the
 * only DDoS lever we have is to behave well):
 *   - default poll interval (POLL_INTERVAL_MS), never tighter than the server cadence;
 *   - honours Retry-After (and HTTP 429) so we back off exactly as the server asks;
 *   - jittered exponential backoff between transient poll failures;
 *   - at most MAX_CONSECUTIVE_POLL_FAILURES transient failures before giving up;
 *   - hard expiry/timeout from server-issued expires_at (+ small clock-skew margin);
 *   - returned sign_in_url / poll_url are validated against the configured base
 *     origin + path before we ever open a browser or send a request to them.
 */
export class BrowserSignInService {
    private readonly log: LogOutputChannel;
    private readonly openBrowser: BrowserOpener;
    private readonly onStatus?: ( status: BrowserSignInStatus ) => void;
    private readonly onAttemptStarted?: ( signInUrl: string, expiresAt: Date ) => void;
    private readonly signal?: AbortSignal;
    private readonly browserBaseUrl: string;
    private readonly apiBaseUrl: string;
    private readonly sleep: ( ms: number ) => Promise<void>;
    private readonly now: () => number;

    constructor( deps: BrowserSignInDeps ) {
        this.log = deps.log;
        this.openBrowser = deps.openBrowser;
        this.onStatus = deps.onStatus;
        this.onAttemptStarted = deps.onAttemptStarted;
        this.signal = deps.signal;
        this.browserBaseUrl = ( deps.browserBaseUrl ?? DEFAULT_BROWSER_AUTH_BASE_URL ).replace( /\/+$/, `` );
        this.apiBaseUrl = ( deps.apiBaseUrl ?? DEFAULT_BROWSER_AUTH_API_BASE_URL ).replace( /\/+$/, `` );
        this.sleep = deps.sleep ?? ( ms => {
            return new Promise( resolve => {
                return setTimeout( resolve, ms );
            } );
        } );
        this.now = deps.now ?? ( () => {
            return Date.now();
        } );
    }

    /** Run the full flow: start, open browser, poll, exchange. Returns the API key. */
    public async authenticate(): Promise<string> {
        const attempt = await this.startAttempt();
        this.onAttemptStarted?.( attempt.signInUrl, new Date( attempt.expiresAt ) );
        this.emit( `opening_browser` );
        await this.openBrowserOrThrow( attempt.signInUrl );
        this.emit( `waiting_for_browser_sign_in` );
        const exchangeToken = await this.waitForCompletion( attempt );
        this.emit( `exchanging` );
        const apiKey = await this.exchange( attempt, exchangeToken );
        this.emit( `completed` );
        return apiKey;
    }

    private emit( status: BrowserSignInStatus ): void {
        this.onStatus?.( status );
    }

    private throwIfAborted(): void {
        if ( this.signal?.aborted ) {
            throw new BrowserSignInError( `Browser sign-in was cancelled.`, `timed_out` );
        }
    }

    private async startAttempt(): Promise<Attempt> {
        const verifier = PkceCodes.generateVerifier();
        const challenge = await PkceCodes.generateChallenge( verifier );

        let response: Response;
        try {
            response = await fetch( `${ this.apiBaseUrl }/vibe/sign-in`, {
                method: `POST`,
                headers: { 'content-type': `application/json` },
                body: JSON.stringify( { code_challenge: challenge, code_challenge_method: `S256` } ),
                signal: this.signal,
            } );
        } catch( err ) {
            this.log.warn( `[Mistral] Browser sign-in start request failed: ` + String( err ) );
            throw new BrowserSignInError( `Failed to start browser sign-in.`, `start_failed` );
        }
        if ( !response.ok ) {
            this.log.warn( `[Mistral] Browser sign-in start returned status ` + response.status );
            throw new BrowserSignInError( `Failed to start browser sign-in.`, `start_failed` );
        }

        const data = await parseJsonObject( response );
        const payload = data as Partial<CreateProcessPayload>;
        if (
            typeof payload.process_id !== `string` ||
            typeof payload.sign_in_url !== `string` ||
            typeof payload.poll_url !== `string` ||
            typeof payload.expires_at !== `string`
        ) {
            throw new BrowserSignInError( `Failed to start browser sign-in.`, `start_failed` );
        }
        const expiresAt = Date.parse( payload.expires_at );
        if ( Number.isNaN( expiresAt ) ) {
            throw new BrowserSignInError( `Failed to start browser sign-in.`, `start_failed` );
        }

        return {
            processId: payload.process_id,
            signInUrl: validateUrlAgainstBase( payload.sign_in_url, this.browserBaseUrl ),
            pollUrl: validateUrlAgainstBase( payload.poll_url, this.apiBaseUrl ),
            expiresAt,
            codeVerifier: verifier,
        };
    }

    private async openBrowserOrThrow( signInUrl: string ): Promise<void> {
        let opened: boolean;
        try {
            opened = await this.openBrowser( signInUrl );
        } catch( err ) {
            this.log.warn( `[Mistral] Failed to open browser for sign-in: ` + String( err ) );
            throw new BrowserSignInError( `Failed to open browser for sign-in.`, `open_browser_failed` );
        }
        if ( !opened ) {
            throw new BrowserSignInError( `Failed to open browser for sign-in.`, `open_browser_failed` );
        }
    }

    private async waitForCompletion( attempt: Attempt ): Promise<string> {
        const deadline = attempt.expiresAt + CLOCK_SKEW_TOLERANCE_MS;
        let consecutiveFailures = 0;
        // First iteration polls immediately (no leading sleep) so a user who
        // finishes in the browser fast isn't held back by the poll interval.
        while ( this.now() < deadline ) {
            this.throwIfAborted();
            let payload: PollPayload;
            try {
                payload = await this.poll( attempt.pollUrl );
            } catch( err ) {
                if ( err instanceof BrowserSignInError && err.code === `poll_failed` ) {
                    consecutiveFailures += 1;
                    if ( consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES ) {
                        throw err;
                    }
                    await this.sleepUntilNextPollOrTimeout( deadline, this.backoffDelay( consecutiveFailures ) );
                    continue;
                }
                throw err;
            }

            consecutiveFailures = 0;
            switch ( payload.status ) {
                case `pending`:
                    await this.sleepUntilNextPollOrTimeout( deadline, payload.retryAfterMs );
                    break;
                case `completed`:
                    if ( payload.exchange_token ) {
                        return payload.exchange_token;
                    }
                    throw new BrowserSignInError( `Sign-in worked, but setup couldn't finish.`, `missing_exchange_token` );
                case `expired`:
                    throw new BrowserSignInError( `Browser sign-in expired.`, `expired` );
                case `denied`:
                    throw new BrowserSignInError( `Browser sign-in was denied.`, `denied` );
                case `error`:
                    throw new BrowserSignInError( payload.message || `Browser sign-in failed.`, `provider_error` );
                default:
                    throw new BrowserSignInError( `Browser sign-in returned an unknown state.`, `unknown_state` );
            }
        }
        throw new BrowserSignInError( `Browser sign-in timed out.`, `timed_out` );
    }

    private async poll( pollUrl: string ): Promise<PollPayload> {
        const validated = validateUrlAgainstBase( pollUrl, this.apiBaseUrl );
        let response: Response;
        try {
            response = await fetch( validated, { signal: this.signal } );
        } catch( err ) {
            throw new BrowserSignInError( `Browser sign-in status could not be retrieved.`, `poll_failed` );
        }
        if ( response.status === HTTP_GONE ) {
            return { status: `expired` };
        }
        // Server is rate-limiting us: back off as instructed, keep waiting.
        if ( response.status === HTTP_TOO_MANY_REQUESTS ) {
            return { status: `pending`, retryAfterMs: parseRetryAfter( response, this.now ) };
        }
        if ( !response.ok ) {
            throw new BrowserSignInError( `Browser sign-in status could not be retrieved.`, `poll_failed` );
        }
        const data = await parseJsonObject( response );
        const status = data.status;
        if ( status !== `pending` && status !== `completed` && status !== `expired` && status !== `denied` && status !== `error` ) {
            throw new BrowserSignInError( `Browser sign-in returned an unknown state.`, `unknown_state` );
        }
        return {
            status,
            exchange_token: typeof data.exchange_token === `string` ? data.exchange_token : undefined,
            message: typeof data.message === `string` ? data.message : undefined,
            retryAfterMs: parseRetryAfter( response, this.now ),
        };
    }

    /** Exponential backoff with jitter for transient poll failures. */
    private backoffDelay( attempt: number ): number {
        const base = Math.min( POLL_BACKOFF_BASE_MS * 2 ** ( attempt - 1 ), POLL_BACKOFF_MAX_MS );
        return base + Math.floor( Math.random() * 500 );
    }

    private async sleepUntilNextPollOrTimeout( deadline: number, requestedMs?: number ): Promise<void> {
        const remaining = deadline - this.now();
        if ( remaining <= 0 ) {
            throw new BrowserSignInError( `Browser sign-in timed out.`, `timed_out` );
        }
        const wanted = requestedMs && requestedMs > 0 ? requestedMs : POLL_INTERVAL_MS;
        await this.sleep( Math.min( wanted, remaining ) );
    }

    private async exchange( attempt: Attempt, exchangeToken: string ): Promise<string> {
        let response: Response;
        try {
            response = await fetch( `${ this.apiBaseUrl }/vibe/sign-in/${ encodeURIComponent( attempt.processId ) }/exchange`, {
                method: `POST`,
                headers: { 'content-type': `application/json` },
                body: JSON.stringify( { exchange_token: exchangeToken, code_verifier: attempt.codeVerifier } ),
                signal: this.signal,
            } );
        } catch( err ) {
            this.log.warn( `[Mistral] Browser sign-in exchange request failed: ` + String( err ) );
            throw new BrowserSignInError( `Failed to exchange browser sign-in for an API key.`, `exchange_failed` );
        }
        if ( !response.ok ) {
            this.log.warn( `[Mistral] Browser sign-in exchange returned status ` + response.status );
            throw new BrowserSignInError( `Failed to exchange browser sign-in for an API key.`, `exchange_failed` );
        }
        const data = await parseJsonObject( response );
        if ( typeof data.api_key === `string` && data.api_key ) {
            return data.api_key;
        }
        throw new BrowserSignInError( `Browser sign-in exchange did not return an API key.`, `missing_api_key` );
    }
}
