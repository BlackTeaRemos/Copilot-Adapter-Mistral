import * as vscode from 'vscode';

export interface MistralStatusBarState {
    authenticated: boolean;
    fimEnabled: boolean;
    fimModelId: string;
    indexState: `off` | `indexing` | `ready`;
    indexChunkCount: number;
    indexFileCount: number;
    indexModel: string;
    utilityModel: string;
    utilitySmallModel: string;
}

function md ( value: string ): vscode.MarkdownString {
    const s = new vscode.MarkdownString( value );
    s.isTrusted = true;
    s.supportThemeIcons = true;
    return s;
}

export class MistralStatusBar {
    private readonly mainItem: vscode.StatusBarItem;
    private readonly fimItem: vscode.StatusBarItem;
    private readonly indexItem: vscode.StatusBarItem;

    private state: MistralStatusBarState = {
        authenticated: false,
        fimEnabled: false,
        fimModelId: ``,
        indexState: `off`,
        indexChunkCount: 0,
        indexFileCount: 0,
        indexModel: ``,
        utilityModel: ``,
        utilitySmallModel: ``,
    };

    constructor ( context: vscode.ExtensionContext ) {
        // priorities 110, 109, 108 → renders as: Mistral | FIM+Utility | Index
        this.mainItem = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Right, 110 );
        this.mainItem.name = `Mistral`;

        this.fimItem = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Right, 109 );
        this.fimItem.name = `Mistral FIM`;
        this.fimItem.command = `mistral-adapter.toggleInlineCompletions`;

        this.indexItem = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Right, 108 );
        this.indexItem.name = `Mistral Index`;
        this.indexItem.command = `mistral-adapter.embeddingMenu`;

        context.subscriptions.push( this.mainItem, this.fimItem, this.indexItem );
    }

    update ( patch: Partial<MistralStatusBarState> ): void {
        Object.assign( this.state, patch );
        this.render();
    }

    render (): void {
        const { authenticated, fimEnabled, fimModelId, indexState, indexChunkCount, indexFileCount, indexModel, utilityModel, utilitySmallModel } = this.state;

        if ( !authenticated ) {
            this.mainItem.text = `$(hubot) Mistral`;
            this.mainItem.tooltip = md(
                `**Mistral** - not signed in\n\n` +
                `[$(sign-in) Sign in with browser](command:mistral-adapter.signIn) &nbsp; ` +
                `[$(key) Enter API key](command:mistral-adapter.manageApiKey)`,
            );
            this.mainItem.backgroundColor = new vscode.ThemeColor( `statusBarItem.warningBackground` );
            this.mainItem.command = `mistral-adapter.signIn`;
            this.mainItem.show();
            this.fimItem.hide();
            this.indexItem.hide();
            return;
        }

        this.mainItem.text = `$(hubot) Mistral`;
        this.mainItem.tooltip = md( `**Mistral** - signed in` );
        this.mainItem.backgroundColor = undefined;
        this.mainItem.command = undefined;
        this.mainItem.show();

        // FIM + Utility combined item - click toggles FIM
        const utilityConfigured = utilityModel.startsWith( `mistral/` ) || utilitySmallModel.startsWith( `mistral/` );

        const shortId = ( qualified: string ) => {
            return qualified.startsWith( `mistral/` ) ? qualified.slice( `mistral/`.length ) : qualified;
        };

        const utilitySection =
            `\n\n---\n\n` +
            `[$(hubot) Utility: ${ utilityModel ? shortId( utilityModel ) : `not set` }](command:mistral-adapter.selectUtilityModel)\n\n` +
            `[$(hubot) Small: ${ utilitySmallModel ? shortId( utilitySmallModel ) : `not set` }](command:mistral-adapter.selectUtilitySmallModel)\n\n` +
            ( !utilityConfigured
                ? `[$(check) Auto-configure both](command:mistral-adapter.configureUtilityModels)\n\n`
                : `` );

        if ( fimEnabled && fimModelId ) {
            this.fimItem.text = `$(sparkle)`;
            this.fimItem.tooltip = md(
                `**Mistral FIM** - on\n\n` +
                `[$(circle-slash) Turn off](command:mistral-adapter.toggleInlineCompletions)\n\n` +
                `[$(settings-gear) FIM: ${ fimModelId }](command:mistral-adapter.selectInlineCompletionModel)` +
                utilitySection,
            );
            this.fimItem.backgroundColor = undefined;
        } else if ( fimEnabled ) {
            this.fimItem.text = `$(warning)`;
            this.fimItem.tooltip = md(
                `**Mistral FIM** - on · no model\n\n` +
                `[$(circle-slash) Turn off](command:mistral-adapter.toggleInlineCompletions)\n\n` +
                `[$(settings-gear) FIM: not set](command:mistral-adapter.selectInlineCompletionModel)` +
                utilitySection,
            );
            this.fimItem.backgroundColor = new vscode.ThemeColor( `statusBarItem.warningBackground` );
        } else {
            this.fimItem.text = `$(circle-slash)`;
            this.fimItem.tooltip = md(
                `**Mistral FIM** - off\n\n` +
                `[$(sparkle) Turn on](command:mistral-adapter.toggleInlineCompletions)\n\n` +
                `[$(settings-gear) FIM: ${ fimModelId || `not set` }](command:mistral-adapter.selectInlineCompletionModel)` +
                utilitySection,
            );
            this.fimItem.backgroundColor = utilityConfigured ? undefined : new vscode.ThemeColor( `statusBarItem.warningBackground` );
        }
        this.fimItem.show();

        // Index item
        if ( indexState === `ready` ) {
            this.indexItem.text = `$(database)`;
            this.indexItem.tooltip = md(
                `**Mistral Index** - ${ indexChunkCount } chunks · ${ indexFileCount } files\n\n` +
                `[$(refresh) Rebuild](command:mistral-adapter.buildEmbeddingIndex)\n\n` +
                `[$(search) Search](command:mistral-adapter.semanticSearch)\n\n` +
                `[$(settings-gear) Embed: ${ indexModel }](command:mistral-adapter.selectEmbeddingModel)\n\n` +
                `[$(trash) Clear](command:mistral-adapter.clearEmbeddingIndex)`,
            );
            this.indexItem.backgroundColor = undefined;
        } else if ( indexState === `indexing` ) {
            this.indexItem.text = `$(sync~spin)`;
            this.indexItem.tooltip = md( `**Mistral Index** - building with \`${ indexModel }\`…` );
            this.indexItem.backgroundColor = undefined;
        } else {
            this.indexItem.text = `$(database)`;
            this.indexItem.tooltip = md(
                `**Mistral Index** - no index\n\n` +
                `[$(database) Build](command:mistral-adapter.buildEmbeddingIndex)\n\n` +
                `[$(settings-gear) Embed: ${ indexModel || `not set` }](command:mistral-adapter.selectEmbeddingModel)`,
            );
            this.indexItem.backgroundColor = new vscode.ThemeColor( `statusBarItem.warningBackground` );
        }
        this.indexItem.show();
    }
}
