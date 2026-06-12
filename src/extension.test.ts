import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
    commands,
    lm,
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
            // push call index 12: output channel + status bar
            expect( mockContext.subscriptions.push.mock.calls[ 12 ] ).toHaveLength( 2 );
        } );

        it( `pushes output channel and status bar as the final subscription bundle`, () => {
            activate( mockContext );
            // 13 push calls: bundle(5), inline register, toggle command, embeddingsProvider,
            // terminalCompletions, mistralBar(3 items), embeddingIndex, searchTool, authChangeListener,
            // embeddingStatus.onChange, embeddingCommands, configWatcher, output+statusBar(2)
            expect( mockContext.subscriptions.push ).toHaveBeenCalledTimes( 13 );
            expect( mockContext.subscriptions.push.mock.calls[ 12 ] ).toHaveLength( 2 );
        } );
    } );

    describe( `deactivate`, () => {
        it( `returns undefined`, () => {
            expect( deactivate() ).toBeUndefined();
        } );
    } );
} );
