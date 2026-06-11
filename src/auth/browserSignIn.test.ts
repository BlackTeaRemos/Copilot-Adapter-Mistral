import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogOutputChannel } from 'vscode';
import { BrowserSignInError, BrowserSignInService } from './browserSignIn/index.js';

const API = `https://console.mistral.ai/api`;
const BROWSER = `https://console.mistral.ai`;

const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
} as unknown as LogOutputChannel;

function jsonResponse (
    body: unknown,
    init: { status?: number; ok?: boolean; headers?: Record<string, string>; } = {},
): Response {
    const status = init.status ?? 200;
    const headers = init.headers ?? {};
    return {
        ok: init.ok ?? ( status >= 200 && status < 300 ),
        status,
        headers: { get: ( name: string ) => {
            return headers[ name.toLowerCase() ] ?? null;
        } },
        json: async () => {
            return body;
        },
    } as unknown as Response;
}

type FetchMock = ReturnType<typeof vi.fn>;

function makeService (
    fetchMock: FetchMock,
    openBrowser = vi.fn().mockResolvedValue( true ),
    sleepDelays?: number[],
): BrowserSignInService {
    vi.stubGlobal( `fetch`, fetchMock );
    return new BrowserSignInService( {
        log,
        openBrowser,
        browserBaseUrl: BROWSER,
        apiBaseUrl: API,
        sleep: async ( ms: number ) => {
            sleepDelays?.push( ms );
            return undefined;
        },
        now: () => {
            return 0;
        },
    } );
}

const startBody = {
    process_id: `proc_1`,
    sign_in_url: `${ BROWSER }/vibe/sign-in/proc_1`,
    poll_url: `${ API }/vibe/sign-in/proc_1/poll`,
    expires_at: new Date( 60_000 ).toISOString(),
};

beforeEach( () => {
    vi.useRealTimers();
} );

afterEach( () => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
} );

describe( `BrowserSignInService.authenticate`, () => {
    it( `runs the full PKCE flow and returns the api key`, async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce( jsonResponse( startBody ) )
            .mockResolvedValueOnce( jsonResponse( { status: `pending` } ) )
            .mockResolvedValueOnce( jsonResponse( { status: `completed`, exchange_token: `xtok` } ) )
            .mockResolvedValueOnce( jsonResponse( { api_key: `sk-test-key` } ) );

        const openBrowser = vi.fn().mockResolvedValue( true );
        const service = makeService( fetchMock, openBrowser );

        await expect( service.authenticate() ).resolves.toBe( `sk-test-key` );

        // start call uses S256 challenge
        const startCall = fetchMock.mock.calls[ 0 ];
        expect( startCall[ 0 ] ).toBe( `${ API }/vibe/sign-in` );
        const startPayload = JSON.parse( ( startCall[ 1 ] as RequestInit ).body as string );
        expect( startPayload.code_challenge_method ).toBe( `S256` );
        expect( typeof startPayload.code_challenge ).toBe( `string` );

        // browser opened to the validated sign-in url
        expect( openBrowser ).toHaveBeenCalledWith( startBody.sign_in_url );

        // exchange sends the same verifier that produced the challenge
        const exchangePayload = JSON.parse( ( fetchMock.mock.calls[ 3 ][ 1 ] as RequestInit ).body as string );
        expect( exchangePayload.exchange_token ).toBe( `xtok` );
        expect( typeof exchangePayload.code_verifier ).toBe( `string` );
    } );

    it( `rejects a sign-in url on a foreign host (no browser opened)`, async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            jsonResponse( { ...startBody, sign_in_url: `https://evil.example.com/vibe/sign-in/proc_1` } ),
        );
        const openBrowser = vi.fn().mockResolvedValue( true );
        const service = makeService( fetchMock, openBrowser );

        await expect( service.authenticate() ).rejects.toMatchObject( { code: `invalid_url` } );
        expect( openBrowser ).not.toHaveBeenCalled();
    } );

    it( `surfaces a denied sign-in`, async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce( jsonResponse( startBody ) )
            .mockResolvedValueOnce( jsonResponse( { status: `denied` } ) );
        const service = makeService( fetchMock );
        await expect( service.authenticate() ).rejects.toMatchObject( { code: `denied` } );
    } );

    it( `treats HTTP 410 on poll as expired`, async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce( jsonResponse( startBody ) )
            .mockResolvedValueOnce( jsonResponse( {}, { status: 410 } ) );
        const service = makeService( fetchMock );
        await expect( service.authenticate() ).rejects.toMatchObject( { code: `expired` } );
    } );

    it( `gives up after 3 consecutive poll failures`, async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce( jsonResponse( startBody ) )
            .mockRejectedValue( new Error( `network down` ) );
        const service = makeService( fetchMock );
        await expect( service.authenticate() ).rejects.toMatchObject( { code: `poll_failed` } );
        // 1 start + 3 poll attempts
        expect( fetchMock ).toHaveBeenCalledTimes( 4 );
    } );

    it( `recovers from a transient poll failure then completes`, async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce( jsonResponse( startBody ) )
            .mockRejectedValueOnce( new Error( `blip` ) )
            .mockResolvedValueOnce( jsonResponse( { status: `completed`, exchange_token: `xtok` } ) )
            .mockResolvedValueOnce( jsonResponse( { api_key: `sk-ok` } ) );
        const service = makeService( fetchMock );
        await expect( service.authenticate() ).resolves.toBe( `sk-ok` );
    } );

    it( `times out once expires_at passes`, async () => {
        vi.stubGlobal( `fetch`, vi.fn().mockResolvedValueOnce( jsonResponse( startBody ) ) );
        const service = new BrowserSignInService( {
            log,
            openBrowser: vi.fn().mockResolvedValue( true ),
            browserBaseUrl: BROWSER,
            apiBaseUrl: API,
            sleep: async () => {
                return undefined;
            },
            now: () => {
                return 999_999;
            }, // already past expires_at (60s)
        } );
        await expect( service.authenticate() ).rejects.toMatchObject( { code: `timed_out` } );
    } );

    it( `fails when the browser cannot be opened`, async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce( jsonResponse( startBody ) );
        const service = makeService( fetchMock, vi.fn().mockResolvedValue( false ) );
        await expect( service.authenticate() ).rejects.toMatchObject( { code: `open_browser_failed` } );
    } );

    it( `errors when exchange returns no api key`, async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce( jsonResponse( startBody ) )
            .mockResolvedValueOnce( jsonResponse( { status: `completed`, exchange_token: `xtok` } ) )
            .mockResolvedValueOnce( jsonResponse( {} ) );
        const service = makeService( fetchMock );
        await expect( service.authenticate() ).rejects.toMatchObject( { code: `missing_api_key` } );
    } );

    it( `aborts when the signal is already cancelled`, async () => {
        const controller = new AbortController();
        controller.abort();
        const fetchMock = vi.fn().mockResolvedValueOnce( jsonResponse( startBody ) );
        vi.stubGlobal( `fetch`, fetchMock );
        const service = new BrowserSignInService( {
            log,
            openBrowser: vi.fn().mockResolvedValue( true ),
            signal: controller.signal,
            browserBaseUrl: BROWSER,
            apiBaseUrl: API,
            sleep: async () => {
                return undefined;
            },
            now: () => {
                return 0;
            },
        } );
        await expect( service.authenticate() ).rejects.toBeInstanceOf( BrowserSignInError );
    } );

    it( `polls immediately before any sleep (fast finish)`, async () => {
        const delays: number[] = [];
        const fetchMock = vi.fn()
            .mockResolvedValueOnce( jsonResponse( startBody ) )
            .mockResolvedValueOnce( jsonResponse( { status: `completed`, exchange_token: `xtok` } ) )
            .mockResolvedValueOnce( jsonResponse( { api_key: `sk-fast` } ) );
        const service = makeService( fetchMock, undefined, delays );
        await expect( service.authenticate() ).resolves.toBe( `sk-fast` );
        // No sleep happened: first poll returned completed straight away.
        expect( delays ).toHaveLength( 0 );
    } );

    it( `honours Retry-After (seconds) on a pending poll`, async () => {
        const delays: number[] = [];
        const fetchMock = vi.fn()
            .mockResolvedValueOnce( jsonResponse( startBody ) )
            .mockResolvedValueOnce( jsonResponse( { status: `pending` }, { headers: { 'retry-after': `7` } } ) )
            .mockResolvedValueOnce( jsonResponse( { status: `completed`, exchange_token: `xtok` } ) )
            .mockResolvedValueOnce( jsonResponse( { api_key: `sk-ra` } ) );
        const service = makeService( fetchMock, undefined, delays );
        await expect( service.authenticate() ).resolves.toBe( `sk-ra` );
        expect( delays[ 0 ] ).toBe( 7000 );
    } );

    it( `treats HTTP 429 as pending and backs off per Retry-After`, async () => {
        const delays: number[] = [];
        const fetchMock = vi.fn()
            .mockResolvedValueOnce( jsonResponse( startBody ) )
            .mockResolvedValueOnce( jsonResponse( {}, { status: 429, headers: { 'retry-after': `2` } } ) )
            .mockResolvedValueOnce( jsonResponse( { status: `completed`, exchange_token: `xtok` } ) )
            .mockResolvedValueOnce( jsonResponse( { api_key: `sk-429` } ) );
        const service = makeService( fetchMock, undefined, delays );
        await expect( service.authenticate() ).resolves.toBe( `sk-429` );
        expect( delays[ 0 ] ).toBe( 2000 );
    } );

    it( `applies exponential backoff between transient poll failures`, async () => {
        const delays: number[] = [];
        const fetchMock = vi.fn()
            .mockResolvedValueOnce( jsonResponse( startBody ) )
            .mockRejectedValue( new Error( `down` ) );
        const service = makeService( fetchMock, undefined, delays );
        await expect( service.authenticate() ).rejects.toMatchObject( { code: `poll_failed` } );
        // Two backoff sleeps before the third failure aborts; second > first.
        expect( delays ).toHaveLength( 2 );
        expect( delays[ 1 ] ).toBeGreaterThan( delays[ 0 ] );
    } );
} );
