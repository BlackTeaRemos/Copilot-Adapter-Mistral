import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
    chat,
    ChatRequestTurn,
    ChatResponseMarkdownPart,
    ChatResponseTurn,
    commands,
    LanguageModelTextPart,
    lm,
    MarkdownString,
    window,
} from 'vscode';
import { activate, deactivate } from './extension.js';

vi.mock( `./provider`, () => {
    const mockDispose = vi.fn();
    const mockSetApiKey = vi.fn();
    const mockOnDidChange = vi.fn().mockReturnValue( { dispose: vi.fn() } );
    const mockProvider = {
        setApiKey: mockSetApiKey,
        signInWithBrowser: vi.fn(),
        dispose: mockDispose,
        isAuthenticated: vi.fn().mockReturnValue( false ),
        refreshStatusBar: vi.fn(),
        currentModelName: ``,
        onDidChangeLanguageModelChatInformation: mockOnDidChange,
        _onDidChangeLanguageModelChatInformation: { fire: vi.fn(), dispose: vi.fn() },
        fetchModels: vi.fn().mockResolvedValue( [] ),
        ensureClient: vi.fn().mockResolvedValue( null ),
    };

    return {
        MistralChatModelProvider: vi.fn().mockImplementation( function (
            context: any,
            logOutputChannel: any,
            autoInit?: boolean,
            statusBarItem?: any,
        ) {
            // Preserve constructor signature for testing registration logic
            var _ = context;
            _ = logOutputChannel;
            _ = autoInit;
            _ = statusBarItem;

            return mockProvider;
        } ),
    };
} );

describe( `extension`, () => {
    const mockContext = {
        subscriptions: { push: vi.fn() },
        extensionUri: `/fake-extension`,
    } as any;

    beforeEach( () => {
        vi.clearAllMocks();
    } );

    describe( `activate`, () => {
        it( `registers the language model chat provider`, () => {
            activate( mockContext );
            expect( lm.registerLanguageModelChatProvider ).toHaveBeenCalledWith( `mistral`, expect.any( Object ) );
        } );

        it( `registers the manageApiKey command`, () => {
            activate( mockContext );
            expect( commands.registerCommand ).toHaveBeenCalledWith( `mistral-adapter.manageApiKey`, expect.any( Function ) );
        } );

        it( `registers the embedding index and semantic search commands`, () => {
            activate( mockContext );
            expect( commands.registerCommand ).toHaveBeenCalledWith( `mistral-adapter.buildEmbeddingIndex`, expect.any( Function ) );
            expect( commands.registerCommand ).toHaveBeenCalledWith( `mistral-adapter.semanticSearch`, expect.any( Function ) );
        } );

        it( `pushes provider + 6 commands + dispose handler bundled in first push call`, () => {
            activate( mockContext );
            // First push call is provider + manageApiKey + configureUtilityModels + selectUtilityModel + selectUtilitySmallModel + signIn + selectInlineCompletionModel + dispose handler
            expect( mockContext.subscriptions.push.mock.calls[ 0 ] ).toHaveLength( 8 );
        } );

        it( `creates output channel and status bar and tracks them in subscriptions`, () => {
            activate( mockContext );
            expect( window.createOutputChannel ).toHaveBeenCalledWith( `Mistral Models`, { log: true } );
            expect( window.createStatusBarItem ).toHaveBeenCalled();
            // push call index 11: output channel + status bar
            expect( mockContext.subscriptions.push.mock.calls[ 11 ] ).toHaveLength( 2 );
        } );

        it( `creates the @mistral chat participant`, () => {
            activate( mockContext );
            expect( chat.createChatParticipant ).toHaveBeenCalledWith( `mistral-api-for-copilot-adapter.mistral`, expect.any( Function ) );
        } );

        it( `pushes participant disposable into context.subscriptions`, () => {
            activate( mockContext );
            // 13 push calls: bundle(5), inline register, toggle command, embeddingsProvider,
            // mistralBar(3 items), embeddingIndex, searchTool, authChangeListener,
            // embeddingStatus.onChange, embeddingCommands, configWatcher, output+statusBar(2), participant(1)
            expect( mockContext.subscriptions.push ).toHaveBeenCalledTimes( 13 );
            expect( mockContext.subscriptions.push.mock.calls[ 12 ] ).toHaveLength( 1 );
        } );
    } );

    describe( `activate - participant handler`, () => {
        async function getHandler () {
            activate( mockContext );
            const [ , handler ] = ( chat.createChatParticipant as ReturnType<typeof vi.fn> ).mock.calls[ 0 ];
            return handler;
        }

        it( `sends history + prompt to request.model.sendRequest`, async () => {
            const handler = await getHandler();

            const mockStream = { markdown: vi.fn() };
            const mockResponse = {
                stream: ( async function* () {
                    yield new LanguageModelTextPart( `world` );
                } )(),
            };
            const mockSendRequest = vi.fn().mockResolvedValue( mockResponse );

            const mockRequest = { prompt: `hello`, model: { sendRequest: mockSendRequest } };
            const mockChatContext = { history: [] };
            const mockToken = { isCancellationRequested: false };

            await handler( mockRequest, mockChatContext, mockStream, mockToken );

            expect( mockSendRequest ).toHaveBeenCalledOnce();
            const [ messages ] = mockSendRequest.mock.calls[ 0 ];
            // Last message is the current prompt
            expect( messages.at( -1 ).content ).toBe( `hello` );
        } );

        it( `streams text chunks back as markdown`, async () => {
            const handler = await getHandler();

            const mockStream = { markdown: vi.fn() };
            const mockResponse = {
                stream: ( async function* () {
                    yield new LanguageModelTextPart( `chunk1` );
                    yield new LanguageModelTextPart( `chunk2` );
                } )(),
            };
            const mockSendRequest = vi.fn().mockResolvedValue( mockResponse );

            await handler( { prompt: `test`, model: { sendRequest: mockSendRequest } }, { history: [] }, mockStream, {
                isCancellationRequested: false,
            } );

            expect( mockStream.markdown ).toHaveBeenCalledWith( `chunk1` );
            expect( mockStream.markdown ).toHaveBeenCalledWith( `chunk2` );
        } );

        it( `includes prior ChatRequestTurn as a User message in history`, async () => {
            const handler = await getHandler();

            const mockResponse = { stream: ( async function* () { } )() };
            const mockSendRequest = vi.fn().mockResolvedValue( mockResponse );

            const priorRequest = new ( ChatRequestTurn as any )( `prior question` );
            await handler(
                { prompt: `follow-up`, model: { sendRequest: mockSendRequest } },
                { history: [ priorRequest ] },
                { markdown: vi.fn() },
                { isCancellationRequested: false },
            );

            const [ messages ] = mockSendRequest.mock.calls[ 0 ];
            expect( messages[ 0 ].content ).toBe( `prior question` );
            expect( messages[ 1 ].content ).toBe( `follow-up` );
        } );

        it( `includes prior ChatResponseTurn as an Assistant message in history`, async () => {
            const handler = await getHandler();

            const mockResponse = { stream: ( async function* () { } )() };
            const mockSendRequest = vi.fn().mockResolvedValue( mockResponse );

            const priorResponse = new ( ChatResponseTurn as any )( [
                new ( ChatResponseMarkdownPart as any )( new ( MarkdownString as any )( `prior answer` ) ),
            ] );
            await handler(
                { prompt: `next`, model: { sendRequest: mockSendRequest } },
                { history: [ priorResponse ] },
                { markdown: vi.fn() },
                { isCancellationRequested: false },
            );

            const [ messages ] = mockSendRequest.mock.calls[ 0 ];
            expect( messages[ 0 ].content ).toBe( `prior answer` );
        } );

        it( `includes prior ChatResponseTurn2 as an Assistant message in history`, async () => {
            const handler = await getHandler();

            const mockResponse = { stream: ( async function* () { } )() };
            const mockSendRequest = vi.fn().mockResolvedValue( mockResponse );

            const ChatResponseTurn2Ctor = ( vscode as unknown as { ChatResponseTurn2?: new ( ...args: unknown[] ) => unknown; } )
                .ChatResponseTurn2;
            expect( ChatResponseTurn2Ctor ).toBeTypeOf( `function` );

            const priorResponseV2 = new ( ChatResponseTurn2Ctor as any )( [
                new ( ChatResponseMarkdownPart as any )( new ( MarkdownString as any )( `prior v2 answer` ) ),
            ] );
            await handler(
                { prompt: `next`, model: { sendRequest: mockSendRequest } },
                { history: [ priorResponseV2 ] },
                { markdown: vi.fn() },
                { isCancellationRequested: false },
            );

            const [ messages ] = mockSendRequest.mock.calls[ 0 ];
            expect( messages[ 0 ].content ).toBe( `prior v2 answer` );
        } );

        it( `surfaces errors as a markdown message`, async () => {
            const handler = await getHandler();

            const mockStream = { markdown: vi.fn() };
            const mockSendRequest = vi.fn().mockRejectedValue( new Error( `model unavailable` ) );

            await handler( { prompt: `hi`, model: { sendRequest: mockSendRequest } }, { history: [] }, mockStream, {
                isCancellationRequested: false,
            } );

            expect( mockStream.markdown ).toHaveBeenCalledWith( expect.stringContaining( `model unavailable` ) );
        } );

        it( `sanitizes error messages and hides sensitive details`, async () => {
            const handler = await getHandler();

            const mockStream = { markdown: vi.fn() };
            const mockSendRequest = vi.fn().mockRejectedValue( {
                statusCode: 401,
                message: `secret token leak`,
            } );

            await handler( { prompt: `test`, model: { sendRequest: mockSendRequest } }, { history: [] }, mockStream, {
                isCancellationRequested: false,
            } );

            // Should show user-friendly message for 401, not the raw error
            const callArg = mockStream.markdown.mock.calls[ 0 ][ 0 ];
            expect( callArg ).toContain( `API key` );
            expect( callArg ).not.toContain( `secret token leak` );
        } );
    } );

    describe( `deactivate`, () => {
        it( `returns undefined`, () => {
            expect( deactivate() ).toBeUndefined();
        } );
    } );
} );
