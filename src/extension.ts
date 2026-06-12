import * as vscode from 'vscode';
import { MistralChatModelProvider } from './provider.js';
import { MistralInlineCompletionProvider } from './inlineCompletionProvider.js';
import { InlineCompletionToggle } from './inlineCompletionToggle.js';
import { getStatusCode, getErrorName, getErrorMessage } from './assertions/index.js';
import { registerMistralEmbeddingsProviders } from './embeddings/embeddingsProvider.js';
import { registerMistralTerminalCompletions } from './terminalCompletionProvider.js';
import { CodebaseEmbeddingIndex } from './embeddings/codebaseIndex.js';
import { EmbeddingStatus } from './embeddings/embeddingStatus.js';
import { registerCodebaseSearchTool } from './embeddings/searchTool.js';
import { EMBEDDING_MODELS, coerceEmbeddingModel, type EmbeddingModel } from './embeddings/mistralEmbeddings.js';
import { MistralStatusBar } from './mistralStatusBar.js';

function getUserFriendlyError ( error: unknown ): string {
    const statusCode = getStatusCode( error );
    if ( typeof statusCode === `number` ) {
        switch ( statusCode ) {
            case 400:
                return `Bad request - the message or parameters sent to Mistral were invalid. Check model options and message format.`;
            case 401:
                return `Invalid API key. Run "Mistral: Manage API Key" to update it.`;
            case 403:
                return `Access denied. Your API key lacks permission for this model or feature. Check your Mistral plan at console.mistral.ai.`;
            case 404:
                return `Model not found. The requested model may have been deprecated or renamed. Reload the window to refresh the model list.`;
            case 408:
                return `Request timed out. The model took too long to respond - try a shorter prompt or smaller context.`;
            case 413:
                return `Context too large. Reduce the number of messages or attached files and try again.`;
            case 422:
                return `Invalid request parameters. Check that your model options (temperature, topP, etc.) are within valid ranges.`;
            case 429:
                return `Rate limit exceeded. Too many requests - wait a moment and try again, or check your quota at console.mistral.ai.`;
            case 500:
                return `Mistral server error. The service encountered an internal error - try again shortly.`;
            case 502:
                return `Mistral gateway error. The service is temporarily unreachable - try again in a few seconds.`;
            case 503:
                return `Mistral service unavailable. The API may be under maintenance - check status.mistral.ai for updates.`;
            case 504:
                return `Mistral gateway timeout. The service did not respond in time - try again or use a shorter prompt.`;
        }
        if ( statusCode >= 500 ) {
            return `Mistral server error (${ statusCode }). Try again shortly or check status.mistral.ai.`;
        }
        if ( statusCode >= 400 ) {
            return `Request rejected by Mistral (HTTP ${ statusCode }). Check the output channel for details.`;
        }
    }

    const name = getErrorName( error );
    if ( name === `AbortError` || name === `CancelledError` ) {
        return `Request cancelled.`;
    }

    const message = getErrorMessage( error );
    if ( message && message.length > 0 ) {
        if ( message.toLowerCase().includes( `network` ) || message.toLowerCase().includes( `fetch` ) ) {
            return `Network error - check your internet connection and try again.`;
        }
        return message;
    }

    return `An unexpected error occurred. Check the Mistral output channel for details.`;
}

async function validateInlineCompletionModel (
    provider: MistralChatModelProvider,
    log: vscode.LogOutputChannel,
): Promise<void> {
    const modelId: string = vscode.workspace.getConfiguration( `mistral` ).get( `inlineCompletionModel` ) ?? ``;
    if ( modelId === `` ) {
        log.info( `[Mistral] Inline completions use Copilot default (mistral.inlineCompletionModel empty).` );
        return;
    }

    await provider.ensureClient( true );
    const models = await provider.fetchModels();
    const fimModels = models.filter( m => {
        return m.supportsCompletionFim;
    } );
    log.info( `[Mistral] FIM-capable models: ${ fimModels.map( m => {
        return m.id;
    } ).join( `, ` ) || `none` }` );

    if ( !fimModels.some( m => {
        return m.id === modelId;
    } ) ) {
        log.warn( `[Mistral] inlineCompletionModel "${ modelId }" not among FIM-capable models. Available: ${ fimModels.map( m => {
            return m.id;
        } ).join( `, ` ) || `none` }` );
        vscode.window.showWarningMessage(
            `Mistral: inline completion model "${ modelId }" is not available or does not support Fill-in-the-Middle. Check the Mistral output channel for available models.`,
        );
        return;
    }
    log.info( `[Mistral] Inline completions provided by Mistral FIM model "${ modelId }".` );
}

const UTILITY_NOTIFICATION_STATE_KEY = `mistral.utilityModelNotificationShown`;

function getUtilityModelDefault (): string {
    return vscode.workspace.getConfiguration( `mistral` ).get<string>( `utilityModel` ) || `mistral/mistral-large-latest`;
}

function getUtilitySmallModelDefault (): string {
    return vscode.workspace.getConfiguration( `mistral` ).get<string>( `utilitySmallModel` ) || `mistral/mistral-small-latest`;
}

async function runSelectUtilityModel (
    provider: MistralChatModelProvider,
    log: vscode.LogOutputChannel,
    settingKey: `utilityModel` | `utilitySmallModel`,
    title: string,
): Promise<void> {
    const qp = vscode.window.createQuickPick();
    qp.title = title;
    qp.placeholder = `Fetching models…`;
    qp.busy = true;
    qp.show();

    const models = await provider.fetchModels();
    const chatModels = models.filter( m => {
        return m.completionChat;
    } );
    const currentVsCodeValue: string = vscode.workspace.getConfiguration( `chat` ).get( settingKey ) ?? ``;
    const currentMistralId = currentVsCodeValue.startsWith( `mistral/` )
        ? currentVsCodeValue.slice( `mistral/`.length )
        : ``;

    const clearItem: vscode.QuickPickItem = {
        label: `$(circle-slash) Clear (use Copilot default)`,
        description: ``,
        detail: `Remove Mistral from this utility slot`,
        picked: currentVsCodeValue === `` || !currentVsCodeValue.startsWith( `mistral/` ),
    };
    const modelItems: vscode.QuickPickItem[] = chatModels.map( m => {
        return {
            label: m.name,
            description: m.id,
            detail: m.detail,
            picked: m.id === currentMistralId,
        };
    } );

    qp.items = [ clearItem, ...modelItems ];
    qp.activeItems = qp.items.filter( i => {
        return i.picked;
    } );
    qp.busy = false;
    qp.placeholder = `Choose a Mistral model`;

    qp.onDidAccept( async () => {
        const selected = qp.selectedItems[ 0 ];
        qp.hide();
        if ( !selected ) {
            return;
        }
        const newValue = selected === clearItem ? `` : `mistral/${ selected.description ?? `` }`;
        await vscode.workspace.getConfiguration( `chat` ).update( settingKey, newValue || undefined, vscode.ConfigurationTarget.Global );
        log.info( `[Mistral] ${ settingKey } set to "${ newValue || `(cleared)` }"` );
    } );
    qp.onDidHide( () => {
        return qp.dispose();
    } );
}

async function promptConfigureUtilityModels ( context: vscode.ExtensionContext, log: vscode.LogOutputChannel ): Promise<void> {
    const cfg = vscode.workspace.getConfiguration( `chat` );
    const utilityModel: string = cfg.get( `utilityModel` ) ?? ``;
    const utilitySmallModel: string = cfg.get( `utilitySmallModel` ) ?? ``;

    const needsConfig = !utilityModel.startsWith( `mistral/` ) || !utilitySmallModel.startsWith( `mistral/` );
    if ( !needsConfig ) {
        return;
    }

    const alreadyShown = context.globalState.get<boolean>( UTILITY_NOTIFICATION_STATE_KEY );
    if ( alreadyShown ) {
        return;
    }
    await context.globalState.update( UTILITY_NOTIFICATION_STATE_KEY, true );

    log.info( `[Mistral] Prompting user to configure utility models (current: utilityModel="${ utilityModel }", utilitySmallModel="${ utilitySmallModel }")` );

    const selection = await vscode.window.showInformationMessage(
        `Mistral: Configure utility models (used for chat titles, commit messages, etc.) to use your Mistral API key?`,
        `Configure`,
        `Open Settings`,
        `Dismiss`,
    );

    if ( selection === `Configure` ) {
        const target = vscode.ConfigurationTarget.Global;
        if ( !utilityModel.startsWith( `mistral/` ) ) {
            await cfg.update( `utilityModel`, getUtilityModelDefault(), target );
        }
        if ( !utilitySmallModel.startsWith( `mistral/` ) ) {
            await cfg.update( `utilitySmallModel`, getUtilitySmallModelDefault(), target );
        }
        log.info( `[Mistral] Utility models configured: utilityModel=${ getUtilityModelDefault() }, utilitySmallModel=${ getUtilitySmallModelDefault() }` );
        vscode.window.showInformationMessage( `Mistral: Utility models configured. Chat title generation and commit messages now use Mistral.` );
    } else if ( selection === `Open Settings` ) {
        await vscode.commands.executeCommand( `workbench.action.openSettings`, `chat.utilityModel` );
    }
}

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
            await promptConfigureUtilityModels( context, logOutputChannel );
        } ),
        vscode.commands.registerCommand( `mistral-adapter.selectUtilityModel`, async () => {
            await runSelectUtilityModel( provider, logOutputChannel, `utilityModel`, `Select Utility Model (chat titles, feedback…)` );
        } ),
        vscode.commands.registerCommand( `mistral-adapter.selectUtilitySmallModel`, async () => {
            await runSelectUtilityModel( provider, logOutputChannel, `utilitySmallModel`, `Select Small Utility Model (commit messages, quick tasks…)` );
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
                    picked: m.id === currentId,
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
            void promptConfigureUtilityModels( context, logOutputChannel );
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
        const items: Array<vscode.QuickPickItem & { uri: vscode.Uri; line: number; }> = results.map( r => {
            return {
                label: `$(file-code) ${ r.entry.file }:${ r.entry.startLine }`,
                description: `${ ( r.score * 100 ).toFixed( 0 ) }%`,
                detail: r.entry.text.split( `\n` ).find( l => {
                    return l.trim().length > 0;
                } )?.slice( 0, 120 ),
                uri: vscode.Uri.joinPath( vscode.workspace.workspaceFolders![ 0 ].uri, r.entry.file ),
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
                vscode.window.showErrorMessage( `Mistral: ${ getUserFriendlyError( error ) }` );
            }
        } ),
        vscode.commands.registerCommand( `mistral-adapter.semanticSearch`, async () => {
            try {
                await runSemanticSearch();
            } catch ( error ) {
                vscode.window.showErrorMessage( `Mistral: ${ getUserFriendlyError( error ) }` );
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
                vscode.window.showErrorMessage( `Mistral: ${ getUserFriendlyError( error ) }` );
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
                    await promptConfigureUtilityModels( context, logOutputChannel );
                }
            } catch ( error ) {
                vscode.window.showErrorMessage( `Mistral: ${ getUserFriendlyError( error ) }` );
            }
        } ),
    );

    void validateInlineCompletionModel( provider, logOutputChannel );

    provider.ensureClient( true ).then( client => {
        if ( client ) {
            utilityModelPromptFired = true;
            void promptConfigureUtilityModels( context, logOutputChannel );
        }
    } ).catch( () => { } );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration( e => {
            if ( e.affectsConfiguration( `mistral.inlineCompletionModel` ) ) {
                void validateInlineCompletionModel( provider, logOutputChannel );
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

export function deactivate () { }
