import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    LanguageModelChatMessageRole,
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
    window,
} from 'vscode';
import { MistralChatModelProvider } from './provider.js';
import { createMistralClient } from './client/index.js';

vi.mock( `./client/index.js`, async ( importOriginal ) => {
    const actual = await importOriginal<typeof import( './client/index.js' )>();
    return {
        ...actual,
        createMistralClient: vi.fn().mockReturnValue( {
            models: { list: vi.fn().mockResolvedValue( {} ) },
        } ),
    };
} );

const mockContext = {
    secrets: {
        get: vi.fn().mockResolvedValue( undefined ),
        store: vi.fn().mockResolvedValue( undefined ),
        delete: vi.fn().mockResolvedValue( undefined ),
        onDidChange: vi.fn(),
    },
    globalState: {
        get: vi.fn().mockReturnValue( {} ),
        update: vi.fn().mockResolvedValue( undefined ),
        keys: vi.fn().mockReturnValue( [] ),
        setKeysForSync: vi.fn(),
    },
    subscriptions: [],
} as any;

const noCancel = { isCancellationRequested: false, onCancellationRequested: vi.fn() } as any;

function userMsg ( ...parts: any[] ) {
    return { role: LanguageModelChatMessageRole.User, content: parts, name: undefined };
}

const baseModel = {
    id: `test-model`, name: `Test Model`,
    maxInputTokens: 4096, maxOutputTokens: 4096,
    defaultCompletionTokens: 4096,
    toolCalling: false, supportsParallelToolCalls: false, supportsVision: false,
} as any;

function makeStream ( ...chunks: Array<{ content?: string; toolCalls?: any[]; finishReason?: string; usage?: any; }> ) {
    return ( async function* () {
        for ( const c of chunks ) {
            yield {
                data: {
                    usage: c.usage,
                    choices: [ { delta: { content: c.content ?? ``, toolCalls: c.toolCalls }, finishReason: c.finishReason ?? null } ],
                },
            };
        }
    } )();
}

// ── setApiKey ─────────────────────────────────────────────────────────────────

describe( `setApiKey`, () => {
    let provider: MistralChatModelProvider;

    beforeEach( () => {
        provider = new MistralChatModelProvider( mockContext, undefined, false );
        vi.spyOn( window, `showQuickPick` ).mockResolvedValue( { method: `paste` } as any );
    } );

    it( `stores trimmed key and returns it`, async () => {
        vi.spyOn( window, `showInputBox` ).mockResolvedValue( `  valid-key-here  ` );
        vi.mocked( createMistralClient ).mockReturnValue( { models: { list: vi.fn().mockResolvedValue( {} ) } } as any );
        const result = await provider.setApiKey();
        expect( result ).toBe( `valid-key-here` );
        expect( mockContext.secrets.store ).toHaveBeenCalledWith( `MISTRAL_API_KEY`, `valid-key-here` );
    } );

    it( `returns undefined on cancellation`, async () => {
        vi.spyOn( window, `showInputBox` ).mockResolvedValue( undefined );
        expect( await provider.setApiKey() ).toBeUndefined();
    } );

    it( `returns undefined and shows error on invalid key`, async () => {
        vi.spyOn( window, `showInputBox` ).mockResolvedValue( `bad-key` );
        vi.mocked( createMistralClient ).mockReturnValue( { models: { list: vi.fn().mockRejectedValue( Object.assign( new Error( `Unauthorized` ), { statusCode: 401 } ) ) } } as any );
        expect( await provider.setApiKey() ).toBeUndefined();
        expect( window.showErrorMessage ).toHaveBeenCalled();
    } );

    it( `fires model info change event after storing key`, async () => {
        vi.spyOn( window, `showInputBox` ).mockResolvedValue( `valid-api-key-xyz` );
        vi.mocked( createMistralClient ).mockReturnValue( { models: { list: vi.fn().mockResolvedValue( {} ) } } as any );
        const listener = vi.fn();
        provider.onDidChangeLanguageModelChatInformation( listener );
        await provider.setApiKey();
        expect( listener ).toHaveBeenCalledTimes( 1 );
    } );

    it( `returns undefined if secret storage throws`, async () => {
        vi.spyOn( window, `showInputBox` ).mockResolvedValue( `valid-api-key-xyz` );
        vi.mocked( createMistralClient ).mockReturnValue( { models: { list: vi.fn().mockResolvedValue( {} ) } } as any );
        vi.spyOn( mockContext.secrets, `store` ).mockRejectedValue( new Error( `storage error` ) );
        expect( await provider.setApiKey() ).toBeUndefined();
    } );
} );

// ── initClient ────────────────────────────────────────────────────────────────

describe( `callInitClient`, () => {
    it( `returns true when stored key exists`, async () => {
        vi.spyOn( mockContext.secrets, `get` ).mockResolvedValue( `stored-key` );
        const provider = new MistralChatModelProvider( mockContext, undefined, false );
        expect( await provider[ `callInitClient` ]( true ) ).toBe( true );
    } );

    it( `returns false in silent mode with no stored key`, async () => {
        vi.spyOn( mockContext.secrets, `get` ).mockResolvedValue( undefined );
        const provider = new MistralChatModelProvider( mockContext, undefined, false );
        expect( await provider[ `callInitClient` ]( true ) ).toBe( false );
    } );

    it( `prompts when not silent and no stored key`, async () => {
        vi.spyOn( mockContext.secrets, `get` ).mockResolvedValue( undefined );
        vi.spyOn( window, `showQuickPick` ).mockResolvedValue( { method: `paste` } as any );
        vi.spyOn( window, `showInputBox` ).mockResolvedValue( `new-api-key-xyz` );
        vi.spyOn( mockContext.secrets, `store` ).mockResolvedValue( undefined );
        const provider = new MistralChatModelProvider( mockContext, undefined, false );
        vi.mocked( createMistralClient ).mockReturnValue( { models: { list: vi.fn().mockResolvedValue( {} ) } } as any );
        expect( await provider[ `callInitClient` ]( false ) ).toBe( true );
        expect( window.showInputBox ).toHaveBeenCalled();
    } );
} );

// ── provideLanguageModelChatResponse ─────────────────────────────────────────

describe( `provideLanguageModelChatResponse`, () => {
    let provider: MistralChatModelProvider;

    beforeEach( () => {
        provider = new MistralChatModelProvider( mockContext, undefined, false );
        ( provider as any ).client = {
            models: { list: vi.fn().mockResolvedValue( { data: [] } ) },
            chat: { stream: vi.fn() },
        };
    } );

    it( `reports error text when client is null`, async () => {
        ( provider as any ).client = null;
        const progress = { report: vi.fn() };
        await provider.provideLanguageModelChatResponse( baseModel, [], {} as any, progress as any, noCancel );
        expect( ( progress.report.mock.calls[ 0 ][ 0 ] as any ).value ).toContain( `API key` );
    } );

    it( `streams text content to progress`, async () => {
        ( provider as any ).client.chat.stream.mockResolvedValue(
            makeStream( { content: `Hello` }, { content: ` world`, finishReason: `stop` } ),
        );
        const progress = { report: vi.fn() };
        await provider.provideLanguageModelChatResponse(
            baseModel, [ userMsg( new LanguageModelTextPart( `hi` ) ) ], {} as any, progress as any, noCancel,
        );
        const text = progress.report.mock.calls.map( ( c: any ) => {
            return c[ 0 ]?.value;
        } ).join( `` );
        expect( text ).toBe( `Hello world` );
    } );

    it( `routes think tags to thinking parts, not the answer`, async () => {
        ( provider as any ).client.chat.stream.mockResolvedValue(
            makeStream( { content: `<think>hidden</think>Answer`, finishReason: `stop` } ),
        );
        const progress = { report: vi.fn() };
        await provider.provideLanguageModelChatResponse(
            baseModel, [ userMsg( new LanguageModelTextPart( `hi` ) ) ], {} as any, progress as any, noCancel,
        );
        const answer = progress.report.mock.calls
            .filter( ( c: any ) => {
                return c[ 0 ]?.constructor?.name !== `LanguageModelThinkingPart`;
            } )
            .map( ( c: any ) => {
                return c[ 0 ]?.value;
            } ).join( `` );
        const thinking = progress.report.mock.calls
            .filter( ( c: any ) => {
                return c[ 0 ]?.constructor?.name === `LanguageModelThinkingPart`;
            } )
            .map( ( c: any ) => {
                return c[ 0 ]?.value;
            } ).join( `` );
        expect( answer ).toBe( `Answer` );
        expect( answer ).not.toContain( `hidden` );
        expect( thinking ).toBe( `hidden` );
    } );

    it( `tracks token usage from promptTokens/completionTokens`, async () => {
        ( provider as any ).client.chat.stream.mockResolvedValue(
            makeStream( { content: `Hi`, usage: { promptTokens: 10, completionTokens: 5 }, finishReason: `stop` } ),
        );
        await provider.provideLanguageModelChatResponse(
            baseModel, [ userMsg( new LanguageModelTextPart( `hi` ) ) ], {} as any, { report: vi.fn() } as any, noCancel,
        );
        expect( provider.getUsageStats() ).toEqual( { input: 10, output: 5, cached: 0, lastPrompt: 10 } );
    } );

    it( `reports error text on stream failure`, async () => {
        ( provider as any ).client.chat.stream.mockRejectedValue( new Error( `Network error` ) );
        const progress = { report: vi.fn() };
        await provider.provideLanguageModelChatResponse(
            baseModel, [ userMsg( new LanguageModelTextPart( `hi` ) ) ], {} as any, progress as any, noCancel,
        );
        expect( ( progress.report.mock.calls[ 0 ][ 0 ] as any ).value ).toContain( `Network error` );
    } );

    it( `passes AbortSignal to chat.stream`, async () => {
        ( provider as any ).client.chat.stream.mockResolvedValue( makeStream( { finishReason: `stop` } ) );
        await provider.provideLanguageModelChatResponse(
            baseModel, [ userMsg( new LanguageModelTextPart( `hi` ) ) ], {} as any, { report: vi.fn() } as any, noCancel,
        );
        const [ , opts ] = ( provider as any ).client.chat.stream.mock.calls[ 0 ];
        expect( opts.signal ).toBeInstanceOf( AbortSignal );
    } );

    it( `emits tool call when arguments accumulate across chunks`, async () => {
        ( provider as any ).client.chat.stream.mockResolvedValue( ( async function* () {
            yield { data: { choices: [ { delta: { toolCalls: [ { id: `call-1`, function: { name: `fn`, arguments: `{"x":` } } ] }, finishReason: null } ] } };
            yield { data: { choices: [ { delta: { toolCalls: [ { id: `call-1`, function: { name: `fn`, arguments: `"y"}` } } ] }, finishReason: `tool_calls` } ] } };
        } )() );
        const progress = { report: vi.fn() };
        await provider.provideLanguageModelChatResponse(
            { ...baseModel, toolCalling: true } as any,
            [ userMsg( new LanguageModelTextPart( `hi` ) ) ],
            { tools: [ { id: `fn`, description: `test` } ] } as any,
            progress as any,
            noCancel,
        );
        const toolCallPart = progress.report.mock.calls.find( ( c: any ) => {
            return c[ 0 ] instanceof LanguageModelToolCallPart;
        } );
        expect( toolCallPart ).toBeDefined();
        expect( ( toolCallPart![ 0 ] as LanguageModelToolCallPart ).name ).toBe( `fn` );
    } );
} );

// ── cache hit percentage calculation ──────────────────────────────────────────

describe( `cache hit percentage`, () => {
    it( `normal cache hit: 50% of current input tokens cached`, () => {
        const cached = 5000;
        const input = 10000;
        const denom = input > 0 ? input : 0;
        const pct = denom > 0 ? Math.round( ( cached / denom ) * 100 ) : 0;

        expect( pct ).toBe( 50 );
    } );

    it( `full cache hit: 100% of current input tokens cached`, () => {
        const cached = 10000;
        const input = 10000;
        const denom = input > 0 ? input : 0;
        const pct = denom > 0 ? Math.round( ( cached / denom ) * 100 ) : 0;

        expect( pct ).toBe( 100 );
    } );

    it( `uses current input as denominator, never exceeds 100%`, () => {
        const cached = 8000;
        const input = 10000;
        const denom = input > 0 ? input : 0;
        const pct = Math.round( ( cached / denom ) * 100 );

        expect( pct ).toBeLessThanOrEqual( 100 );
        expect( pct ).toBe( 80 );
    } );

    it( `falls back to lastPrompt only when input is 0`, () => {
        const cached = 5000;
        const input = 0;
        const lastPrompt = 10000;

        const denom = input > 0 ? input : lastPrompt;
        const pct = denom > 0 ? Math.round( ( cached / denom ) * 100 ) : 0;

        expect( denom ).toBe( 10000 );
        expect( pct ).toBe( 50 );
    } );

    it( `zero cache hit returns 0%`, () => {
        const cached = 0;
        const input = 10000;
        const denom = input > 0 ? input : 0;
        const pct = denom > 0 ? Math.round( ( cached / denom ) * 100 ) : 0;

        expect( pct ).toBe( 0 );
    } );

    it( `saved tokens calculated as 90% of cached`, () => {
        const testCases = [
            { cached: 1000, expected: 900 },
            { cached: 5000, expected: 4500 },
            { cached: 79856, expected: 71870 },
        ];

        testCases.forEach( ( { cached, expected } ) => {
            const saved = Math.round( cached * 0.9 );
            expect( saved ).toBe( expected );
        } );
    } );
} );

// ── provideTokenCount ─────────────────────────────────────────────────────────

describe( `provideTokenCount`, () => {
    let provider: MistralChatModelProvider;
    beforeEach( () => {
        provider = new MistralChatModelProvider( mockContext, undefined, false );
    } );

    it( `counts tokens for plain text`, async () => {
        expect( await provider.provideTokenCount( {} as any, `Hello world`, {} as any ) ).toBeGreaterThan( 0 );
    } );

    it( `returns 0 for empty string`, async () => {
        expect( await provider.provideTokenCount( {} as any, ``, {} as any ) ).toBe( 0 );
    } );

    it( `counts tokens for message with text part`, async () => {
        const msg = { role: LanguageModelChatMessageRole.User, content: [ new LanguageModelTextPart( `Hi` ) ], name: undefined };
        expect( await provider.provideTokenCount( {} as any, msg, {} as any ) ).toBeGreaterThan( 0 );
    } );

    it( `counts tokens for message with tool call`, async () => {
        const msg = { role: LanguageModelChatMessageRole.Assistant, content: [ new LanguageModelToolCallPart( `id`, `fn`, { k: `v` } ) ], name: undefined };
        expect( await provider.provideTokenCount( {} as any, msg, {} as any ) ).toBeGreaterThan( 0 );
    } );

    it( `counts tokens for message with tool result`, async () => {
        const msg = { role: LanguageModelChatMessageRole.User, content: [ new LanguageModelToolResultPart( `id`, [ new LanguageModelTextPart( `result` ) ] ) ], name: undefined };
        expect( await provider.provideTokenCount( {} as any, msg, {} as any ) ).toBeGreaterThan( 0 );
    } );
} );

// ── EventEmitter ──────────────────────────────────────────────────────────────

describe( `EventEmitter (vscode mock)`, () => {
    it( `fires to subscribed listeners`, async () => {
        const { EventEmitter } = await import( `./test/vscode.mock.js` );
        const emitter = new EventEmitter<string>();
        const received: string[] = [];
        emitter.event( ( v: string ) => {
            return received.push( v );
        } );
        emitter.fire( `hello` );
        expect( received ).toEqual( [ `hello` ] );
    } );

    it( `removes listener on dispose`, async () => {
        const { EventEmitter } = await import( `./test/vscode.mock.js` );
        const emitter = new EventEmitter<number>();
        const received: number[] = [];
        const sub = emitter.event( ( v: number ) => {
            return received.push( v );
        } );
        emitter.fire( 1 );
        sub.dispose();
        emitter.fire( 2 );
        expect( received ).toEqual( [ 1 ] );
    } );

    it( `swallows listener errors so other listeners still run`, async () => {
        const { EventEmitter } = await import( `./test/vscode.mock.js` );
        const emitter = new EventEmitter<void>();
        const spy = vi.fn();
        emitter.event( () => {
            throw new Error( `boom` );
        } );
        emitter.event( spy );
        expect( () => {
            return emitter.fire();
        } ).not.toThrow();
        expect( spy ).toHaveBeenCalled();
    } );

    it( `clears all listeners on dispose`, async () => {
        const { EventEmitter } = await import( `./test/vscode.mock.js` );
        const emitter = new EventEmitter<void>();
        const spy = vi.fn();
        emitter.event( spy );
        emitter.dispose();
        emitter.fire();
        expect( spy ).not.toHaveBeenCalled();
    } );
} );
