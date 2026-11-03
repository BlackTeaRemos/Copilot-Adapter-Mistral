import * as vscode from 'vscode';
import { MistralChatModelProvider } from './provider.js';
import { MistralInlineCompletionProvider } from './inlineCompletionProvider.js';
import { InlineCompletionToggle } from './inlineCompletionToggle.js';
import { registerMistralEmbeddingsProviders } from './_future_/embeddingsProvider.js';
import { registerMistralTerminalCompletions } from './_future_/terminalCompletionProvider.js';
import { CodebaseEmbeddingIndex } from './embeddings/codebaseIndex.js';
import { EmbeddingStatus } from './embeddings/embeddingStatus.js';
import { registerCodebaseSearchTool } from './embeddings/searchTool.js';
import { EMBEDDING_MODELS, coerceEmbeddingModel, type EmbeddingModel } from './embeddings/mistralEmbeddings.js';
import { MistralStatusBar } from './mistralStatusBar.js';
import { GetUserFriendlyError } from './extensionLifecycle/getUserFriendlyError.js';
import { ValidateInlineCompletionModel } from './extensionLifecycle/validateInlineCompletionModel.js';
import { RunSelectUtilityModel } from './extensionLifecycle/runSelectUtilityModel.js';
import { PromptConfigureUtilityModels } from './extensionLifecycle/promptConfigureUtilityModels.js';
import { UTILITY_NOTIFICATION_STATE_KEY } from './extensionLifecycle/utilityNotificationStateKey.js';
import { ResolveCatalogModel } from './modelSelection/resolveCatalogModel.js';
export { deactivate } from './extensionLifecycle/deactivate.js';

export function activate ( context: vscode.ExtensionContext ) {
    const logOutputChannel = vscode.window.createOutputChannel( `Mistral Models`, { log: true } );
    const usageStatusBar = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Left, 100 );
    usageStatusBar.name = `Mistral Usage`;
    usageStatusBar.hide();

    const provider = new MistralChatModelProvider( context, logOutputChannel, true, usageStatusBar );
    context.subscriptions.push(
        vscode.lm.registerLanguageModelChatProvider( `mistral`, provider ),
        vscode.commands.registerCommand( `mistral-adapter.manageApiKey`, async () => {
            await provider.setApiKey();
        } ),
        vscode.commands.registerCommand( `mistral-adapter.configureUtilityModels`, async () => {
            await context.globalState.update( UTILITY_NOTIFICATION_STATE_KEY, false );
            await PromptConfigureUtilityModels( context, logOutputChannel, provider );
        } ),
        vscode.commands.registerCommand( `mistral-adapter.selectUtilityModel`, async () => {
            await RunSelectUtilityModel( provider, logOutputChannel, `utilityModel`, `Select Utility Model (chat titles, feedback…)` );
        } ),
        vscode.commands.registerCommand( `mistral-adapter.selectUtilitySmallModel`, async () => {
            await RunSelectUtilityModel( provider, logOutputChannel, `utilitySmallModel`, `Select Small Utility Model (commit messages, quick tasks…)` );
        } ),
        vscode.commands.registerCommand( `mistral-adapter.signIn`, async () => {
            await provider.signInWithBrowser();
        } ),
        vscode.commands.registerCommand( `mistral-adapter.selectInlineCompletionModel`, async () => {
            const qp = vscode.window.createQuickPick();
            qp.title = `Select Inline Completion Model`;
            qp.placeholder = `Fetching FIM-capable models…`;
            qp.busy = true;
            qp.show();

            const models = await provider.fetchModels();
            const fimModels = models.filter( m => {
                return m.supportsCompletionFim;
            } );
            const currentId: string = vscode.workspace.getConfiguration( `mistral` ).get( `inlineCompletionModel` ) ?? ``;

            const currentModel = ResolveCatalogModel( fimModels, currentId );
            const defaultItem: vscode.QuickPickItem = {
                label: `VS Code / Copilot default`,
                description: ``,
                detail: `Let Copilot choose the completion model`,
                picked: currentId === ``,
            };
            const modelItems: vscode.QuickPickItem[] = fimModels.map( m => {
                return {
                    label: m.name,
                    description: m.id,
                    detail: m.detail,
                    picked: m.id === ( currentModel?.id ?? currentId ),
                };
            } );

            qp.items = [ defaultItem, ...modelItems ];
            qp.activeItems = qp.items.filter( i => {
                return i.picked;
            } );
            qp.busy = false;
            qp.placeholder = `Choose a model for inline completions`;

            qp.onDidAccept( async () => {
                const selected = qp.selectedItems[ 0 ];
                qp.hide();
                if ( !selected ) {
                    return;
                }
                const newId = selected === defaultItem ? `` : ( selected.description ?? `` );
                await vscode.workspace.getConfiguration( `mistral` ).update(
                    `inlineCompletionModel`, newId, vscode.ConfigurationTarget.Global,
                );
            } );
            qp.onDidHide( () => {
                return qp.dispose();
            } );
        } ),
        {
            dispose: () => {
                return provider.dispose();
            },
        },
    );

    const inlineProvider = new MistralInlineCompletionProvider( provider, logOutputChannel );
    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            [ { scheme: `file` }, { scheme: `untitled` }, { scheme: `vscode-notebook-cell` } ],
            inlineProvider,
        ),
    );

    const toggle = new InlineCompletionToggle( context, logOutputChannel );
    toggle.render();
    context.subscriptions.push(
        vscode.commands.registerCommand( `mistral-adapter.toggleInlineCompletions`, () => {
            return toggle.toggle();
        } ),
    );

    const getClient = () => {
        return provider.ensureClient( true );
    };
    context.subscriptions.push( registerMistralEmbeddingsProviders( getClient, logOutputChannel ) );
    context.subscriptions.push( registerMistralTerminalCompletions( getClient, logOutputChannel ) );

    const getEmbeddingModel = (): EmbeddingModel => {
        return coerceEmbeddingModel( vscode.workspace.getConfiguration( `mistral` ).get( `embeddingModel` ) );
    };

    const mistralBar = new MistralStatusBar( context );
    const refreshMistralBar = () => {
        const chatCfg = vscode.workspace.getConfiguration( `chat` );
        mistralBar.update( {
            authenticated: provider.isAuthenticated(),
            fimEnabled: toggle.isEnabled(),
            fimModelId: vscode.workspace.getConfiguration( `mistral` ).get<string>( `inlineCompletionModel` ) ?? ``,
            utilityModel: chatCfg.get<string>( `utilityModel` ) ?? ``,
            utilitySmallModel: chatCfg.get<string>( `utilitySmallModel` ) ?? ``,
        } );
    };

    const embeddingIndex = new CodebaseEmbeddingIndex( context, getClient, logOutputChannel, getEmbeddingModel );
    const embeddingStatus = new EmbeddingStatus( context, embeddingIndex, getEmbeddingModel, s => {
        return mistralBar.update( {
            indexState: s.indexState,
            indexChunkCount: s.chunkCount,
            indexFileCount: s.fileCount,
            indexModel: s.model,
        } );
    } );
    context.subscriptions.push( embeddingIndex );
    context.subscriptions.push( registerCodebaseSearchTool( embeddingIndex, logOutputChannel ) );
    let utilityModelPromptFired = false;
    context.subscriptions.push( provider.onDidChangeLanguageModelChatInformation( () => {
        provider.refreshStatusBar();
        refreshMistralBar();
        if ( !utilityModelPromptFired && provider.isAuthenticated() ) {
            utilityModelPromptFired = true;
            void PromptConfigureUtilityModels( context, logOutputChannel, provider );
        }
    } ) );
    void embeddingIndex.load().then( () => {
        return embeddingStatus.render();
    } );
    refreshMistralBar();
    embeddingStatus.render();

    const runSemanticSearch = async (): Promise<void> => {
        if ( !vscode.workspace.workspaceFolders?.length ) {
            vscode.window.showWarningMessage( `Mistral: open a folder to use semantic search.` );
            return;
        }
        const query = await vscode.window.showInputBox( {
            title: `Mistral: Semantic Code Search`,
            placeHolder: `Describe what you are looking for…`,
        } );
        if ( !query ) {
            return;
        }
        const results = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Mistral: Searching…`, cancellable: true },
            ( _p, token ) => {
                return embeddingIndex.search( query, 15, token );
            },
        );
        if ( results.length === 0 ) {
            vscode.window.showInformationMessage( `Mistral: no matches. Build the index first via "Mistral: Build Codebase Embedding Index".` );
            return;
        }
        const rootFolder = vscode.workspace.workspaceFolders?.[ 0 ];
        if ( !rootFolder ) {
            logOutputChannel.warn( `[Mistral] Search results could not be opened because the workspace was closed.` );
            return;
        }
        const items: (vscode.QuickPickItem & { uri: vscode.Uri; line: number; })[] = results.map( r => {
            return {
                label: `$(file-code) ${ r.entry.file }:${ r.entry.startLine }`,
                description: `${ ( r.score * 100 ).toFixed( 0 ) }%`,
                detail: r.entry.text.split( `\n` ).find( l => {
                    return l.trim().length > 0;
                } )?.slice( 0, 120 ),
                uri: vscode.Uri.joinPath( rootFolder.uri, r.entry.file ),
                line: r.entry.startLine,
            };
        } );
        const pick = await vscode.window.showQuickPick( items, { title: `Mistral: ${ results.length } matches`, matchOnDetail: true } );
        if ( !pick ) {
            return;
        }
        const doc = await vscode.workspace.openTextDocument( pick.uri );
        const editor = await vscode.window.showTextDocument( doc );
        const pos = new vscode.Position( Math.max( 0, pick.line - 1 ), 0 );
        editor.selection = new vscode.Selection( pos, pos );
        editor.revealRange( new vscode.Range( pos, pos ), vscode.TextEditorRevealType.InCenter );
    };

    const runBuildIndex = async (): Promise<void> => {
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Mistral: Building codebase embedding index`, cancellable: true },
            ( progress, token ) => {
                return embeddingIndex.build( progress, token );
            },
        );
        vscode.window.showInformationMessage(
            result.total > 0
                ? `Mistral: index ready - ${ result.total } chunks (${ result.embedded } embedded, ${ result.reused } reused).`
                : `Mistral: no indexable files found.`,
        );
    };

    context.subscriptions.push(
        vscode.commands.registerCommand( `mistral-adapter.buildEmbeddingIndex`, async () => {
            try {
                await runBuildIndex();
            } catch ( error ) {
                vscode.window.showErrorMessage( `Mistral: ${ GetUserFriendlyError( error ) }` );
            }
        } ),
        vscode.commands.registerCommand( `mistral-adapter.semanticSearch`, async () => {
            try {
                await runSemanticSearch();
            } catch ( error ) {
                vscode.window.showErrorMessage( `Mistral: ${ GetUserFriendlyError( error ) }` );
            }
        } ),
        vscode.commands.registerCommand( `mistral-adapter.selectEmbeddingModel`, async () => {
            const current = getEmbeddingModel();
            const pick = await vscode.window.showQuickPick(
                EMBEDDING_MODELS.map( m => {
                    return {
                        label: m,
                        description: m === current ? `$(check) current` : ``,
                        detail: m === `codestral-embed` ? `Code-tuned embeddings (recommended for source)` : `General-purpose text embeddings`,
                    };
                } ),
                { title: `Mistral: Select Embedding Model` },
            );
            if ( !pick ) {
                return;
            }
            await vscode.workspace.getConfiguration( `mistral` ).update( `embeddingModel`, pick.label, vscode.ConfigurationTarget.Global );
            embeddingStatus.render();
        } ),
        vscode.commands.registerCommand( `mistral-adapter.clearEmbeddingIndex`, async () => {
            await embeddingIndex.clear();
            vscode.window.showInformationMessage( `Mistral: embedding index cleared.` );
        } ),
        vscode.commands.registerCommand( `mistral-adapter.embeddingMenu`, async () => {
            const ready = embeddingIndex.getState() === `ready`;
            const actions = [
                { label: `$(database) Build / refresh index`, detail: `Embed only files changed since the last build`, id: `build` },
                ...( ready ? [ { label: `$(search) Semantic search`, detail: `Search ${ embeddingIndex.chunkCount } indexed chunks`, id: `search` } ] : [] ),
                { label: `$(settings-gear) Select embedding model`, detail: `Current: ${ getEmbeddingModel() }`, id: `model` },
                ...( ready ? [ { label: `$(trash) Clear index`, detail: `Delete the stored index`, id: `clear` } ] : [] ),
            ];
            const pick = await vscode.window.showQuickPick( actions, { title: `Mistral Embedding Index` } );
            if ( !pick ) {
                return;
            }
            try {
                if ( pick.id === `build` ) {
                    await runBuildIndex();
                } else if ( pick.id === `search` ) {
                    await runSemanticSearch();
                } else if ( pick.id === `model` ) {
                    await vscode.commands.executeCommand( `mistral-adapter.selectEmbeddingModel` );
                } else if ( pick.id === `clear` ) {
                    await vscode.commands.executeCommand( `mistral-adapter.clearEmbeddingIndex` );
                }
            } catch ( error ) {
                vscode.window.showErrorMessage( `Mistral: ${ GetUserFriendlyError( error ) }` );
            }
        } ),
        vscode.commands.registerCommand( `mistral-adapter.utilityModelMenu`, async () => {
            const chatCfg = vscode.workspace.getConfiguration( `chat` );
            const currentUtility: string = chatCfg.get( `utilityModel` ) ?? ``;
            const currentSmall: string = chatCfg.get( `utilitySmallModel` ) ?? ``;
            const actions = [
                {
                    label: `$(hubot) Select utility model`,
                    detail: `Current: ${ currentUtility || `(not set)` }`,
                    id: `utility`,
                },
                {
                    label: `$(hubot) Select small utility model`,
                    detail: `Current: ${ currentSmall || `(not set)` }`,
                    id: `small`,
                },
                {
                    label: `$(check) Auto-configure both`,
                    detail: `Set recommended Mistral defaults for both utility slots`,
                    id: `configure`,
                },
            ];
            const pick = await vscode.window.showQuickPick( actions, { title: `Mistral Utility Models` } );
            if ( !pick ) {
                return;
            }
            try {
                if ( pick.id === `utility` ) {
                    await vscode.commands.executeCommand( `mistral-adapter.selectUtilityModel` );
                } else if ( pick.id === `small` ) {
                    await vscode.commands.executeCommand( `mistral-adapter.selectUtilitySmallModel` );
                } else if ( pick.id === `configure` ) {
                    await context.globalState.update( UTILITY_NOTIFICATION_STATE_KEY, false );
                    await PromptConfigureUtilityModels( context, logOutputChannel, provider );
                }
            } catch ( error ) {
                vscode.window.showErrorMessage( `Mistral: ${ GetUserFriendlyError( error ) }` );
            }
        } ),
    );

    void ValidateInlineCompletionModel( provider, logOutputChannel );

    provider.ensureClient( true ).then( client => {
        if ( client ) {
            utilityModelPromptFired = true;
            void PromptConfigureUtilityModels( context, logOutputChannel, provider );
        }
    } ).catch( error => {
        logOutputChannel.warn( `[Mistral] Configuration update failed: ${ String( error ) }` );
    } );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration( e => {
            if ( e.affectsConfiguration( `mistral.inlineCompletionModel` ) ) {
                void ValidateInlineCompletionModel( provider, logOutputChannel );
            }
            if (
                e.affectsConfiguration( `mistral.inlineCompletionModel` ) ||
                e.affectsConfiguration( `mistral.inlineCompletionEnabled` )
            ) {
                toggle.render();
            }
            if (
                e.affectsConfiguration( `mistral.inlineCompletionModel` ) ||
                e.affectsConfiguration( `mistral.inlineCompletionEnabled` ) ||
                e.affectsConfiguration( `chat.utilityModel` ) ||
                e.affectsConfiguration( `chat.utilitySmallModel` )
            ) {
                refreshMistralBar();
            }
            if ( e.affectsConfiguration( `chat.utilityModel` ) || e.affectsConfiguration( `chat.utilitySmallModel` ) ) {
                const chatCfg = vscode.workspace.getConfiguration( `chat` );
                const um: string = chatCfg.get( `utilityModel` ) ?? ``;
                const usm: string = chatCfg.get( `utilitySmallModel` ) ?? ``;
                if ( !um.startsWith( `mistral/` ) || !usm.startsWith( `mistral/` ) ) {
                    void context.globalState.update( UTILITY_NOTIFICATION_STATE_KEY, false );
                }
            }
        } ),
    );

    context.subscriptions.push( logOutputChannel, usageStatusBar );
}
