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
    private readonly utilityItem: vscode.StatusBarItem;

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
        // priorities 110, 109, 108, 107 → renders as: Mistral | FIM | Index | Utility
        this.mainItem = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Right, 110 );
        this.mainItem.name = `Mistral`;

        this.fimItem = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Right, 109 );
        this.fimItem.name = `Mistral FIM`;
        this.fimItem.command = `mistral-adapter.toggleInlineCompletions`;

        this.indexItem = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Right, 108 );
        this.indexItem.name = `Mistral Index`;
        this.indexItem.command = `mistral-adapter.embeddingMenu`;

        this.utilityItem = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Right, 107 );
        this.utilityItem.name = `Mistral Utility`;
        this.utilityItem.command = `mistral-adapter.utilityModelMenu`;

        context.subscriptions.push( this.mainItem, this.fimItem, this.indexItem, this.utilityItem );
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
            this.utilityItem.hide();
            return;
        }

        const utilityLine = utilityModel.startsWith( `mistral/` ) || utilitySmallModel.startsWith( `mistral/` )
            ? `\n\n$(hubot) Utility: \`${ utilityModel || `—` }\` · Small: \`${ utilitySmallModel || `—` }\`` +
              `\n\n[$(settings-gear) Change utility models](command:mistral-adapter.utilityModelMenu)`
            : `\n\n$(warning) Utility models not configured — [Set up](command:mistral-adapter.configureUtilityModels)`;

        this.mainItem.text = `$(hubot) Mistral`;
        this.mainItem.tooltip = md( `**Mistral** - signed in${ utilityLine }` );
        this.mainItem.backgroundColor = undefined;
        this.mainItem.command = undefined;
        this.mainItem.show();

        // FIM item
        if ( fimEnabled && fimModelId ) {
            this.fimItem.text = `$(sparkle)`;
            this.fimItem.tooltip = md(
                `**Mistral FIM** - on · \`${ fimModelId }\`\n\n` +
                `[$(circle-slash) Turn off](command:mistral-adapter.toggleInlineCompletions) &nbsp; ` +
                `[$(settings-gear) Change model](command:mistral-adapter.selectInlineCompletionModel)`,
            );
            this.fimItem.backgroundColor = undefined;
        } else if ( fimEnabled ) {
            this.fimItem.text = `$(warning)`;
            this.fimItem.tooltip = md(
                `**Mistral FIM** - on · no model selected\n\n` +
                `[$(settings-gear) Pick model](command:mistral-adapter.selectInlineCompletionModel) &nbsp; ` +
                `[$(circle-slash) Turn off](command:mistral-adapter.toggleInlineCompletions)`,
            );
            this.fimItem.backgroundColor = new vscode.ThemeColor( `statusBarItem.warningBackground` );
        } else {
            this.fimItem.text = `$(circle-slash)`;
            this.fimItem.tooltip = md(
                `**Mistral FIM** - off\n\n` +
                `[$(sparkle) Enable](command:mistral-adapter.toggleInlineCompletions) &nbsp; ` +
                `[$(settings-gear) Select model](command:mistral-adapter.selectInlineCompletionModel)`,
            );
            this.fimItem.backgroundColor = undefined;
        }
        this.fimItem.show();

        // Index item
        if ( indexState === `ready` ) {
            this.indexItem.text = `$(database)`;
            this.indexItem.tooltip = md(
                `**Mistral Index** - ${ indexChunkCount } chunks · ${ indexFileCount } files · \`${ indexModel }\`\n\n` +
                `[$(refresh) Rebuild](command:mistral-adapter.buildEmbeddingIndex) &nbsp; ` +
                `[$(search) Search](command:mistral-adapter.semanticSearch) &nbsp; ` +
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
                `[$(database) Build](command:mistral-adapter.buildEmbeddingIndex) &nbsp; ` +
                `[$(settings-gear) Select model](command:mistral-adapter.selectEmbeddingModel)`,
            );
            this.indexItem.backgroundColor = new vscode.ThemeColor( `statusBarItem.warningBackground` );
        }
        this.indexItem.show();

        // Utility item
        const utilityConfigured = utilityModel.startsWith( `mistral/` ) || utilitySmallModel.startsWith( `mistral/` );
        if ( utilityConfigured ) {
            this.utilityItem.text = `$(hubot)`;
            this.utilityItem.tooltip = md(
                `**Mistral Utility** - configured\n\n` +
                `Utility: \`${ utilityModel || `—` }\`  ·  Small: \`${ utilitySmallModel || `—` }\`\n\n` +
                `[$(settings-gear) Change](command:mistral-adapter.utilityModelMenu)`,
            );
            this.utilityItem.backgroundColor = undefined;
        } else {
            this.utilityItem.text = `$(hubot)`;
            this.utilityItem.tooltip = md(
                `**Mistral Utility** - not configured\n\n` +
                `Chat titles, commit messages and other VS Code utility features use the Copilot default model.\n\n` +
                `[$(check) Configure](command:mistral-adapter.configureUtilityModels) &nbsp; ` +
                `[$(settings-gear) Select manually](command:mistral-adapter.utilityModelMenu)`,
            );
            this.utilityItem.backgroundColor = new vscode.ThemeColor( `statusBarItem.warningBackground` );
        }
        this.utilityItem.show();
    }
}
