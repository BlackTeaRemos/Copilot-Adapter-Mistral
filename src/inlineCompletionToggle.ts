import * as vscode from 'vscode';

const COPILOT_BACKUP_KEY = `mistral.copilotEnableBackup`;
const COPILOT_SECTION = `github.copilot`;
const COPILOT_ENABLE = `enable`;

export class InlineCompletionToggle {
    private readonly statusBar: vscode.StatusBarItem;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly log: vscode.LogOutputChannel,
    ) {
        this.statusBar = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Right, 100 );
        this.statusBar.name = `Mistral Inline Completions`;
        this.statusBar.command = `mistral-adapter.toggleInlineCompletions`;
        this.context.subscriptions.push( this.statusBar );
    }

    public isEnabled(): boolean {
        return vscode.workspace.getConfiguration( `mistral` ).get( `inlineCompletionEnabled` ) ?? false;
    }

    private getModelId(): string {
        return vscode.workspace.getConfiguration( `mistral` ).get( `inlineCompletionModel` ) ?? ``;
    }

    public render(): void {
        const enabled = this.isEnabled();
        const modelId = this.getModelId();

        if ( enabled && modelId !== `` ) {
            this.statusBar.text = `$(sparkle) Mistral FIM`;
            this.statusBar.tooltip = `Mistral inline completions ON (${ modelId }) — Copilot inline disabled. Click to switch back to Copilot.`;
            this.statusBar.backgroundColor = undefined;
        } else if ( enabled && modelId === `` ) {
            this.statusBar.text = `$(warning) Mistral FIM`;
            this.statusBar.tooltip = `Mistral inline completions ON but no model selected. Click to pick a model, or toggle off.`;
            this.statusBar.backgroundColor = new vscode.ThemeColor( `statusBarItem.warningBackground` );
        } else {
            this.statusBar.text = `$(circle-slash) Mistral FIM`;
            this.statusBar.tooltip = `Mistral inline completions OFF — Copilot active. Click to enable Mistral FIM.`;
            this.statusBar.backgroundColor = undefined;
        }
        this.statusBar.show();
    }

    public async enable(): Promise<void> {
        const copilotCfg = vscode.workspace.getConfiguration( COPILOT_SECTION );
        const inspect = copilotCfg.inspect<Record<string, boolean>>( COPILOT_ENABLE );
        const current = inspect?.globalValue;

        // Back up the user's existing global value once, so disable() restores it exactly.
        if ( this.context.globalState.get( COPILOT_BACKUP_KEY ) === undefined ) {
            await this.context.globalState.update( COPILOT_BACKUP_KEY, current ?? null );
        }

        await copilotCfg.update( COPILOT_ENABLE, { '*': false }, vscode.ConfigurationTarget.Global );
        await vscode.workspace.getConfiguration( `mistral` ).update(
            `inlineCompletionEnabled`, true, vscode.ConfigurationTarget.Global,
        );
        this.log.info( `[Mistral] Inline completions enabled — Copilot inline disabled (github.copilot.enable = { "*": false }).` );
        this.render();
    }

    public async disable(): Promise<void> {
        const copilotCfg = vscode.workspace.getConfiguration( COPILOT_SECTION );
        const backup = this.context.globalState.get<Record<string, boolean> | null>( COPILOT_BACKUP_KEY );

        // Restore: if user had an explicit global value, put it back; otherwise clear our override.
        const restoreValue = backup === undefined ? undefined : ( backup ?? undefined );
        await copilotCfg.update( COPILOT_ENABLE, restoreValue, vscode.ConfigurationTarget.Global );
        await this.context.globalState.update( COPILOT_BACKUP_KEY, undefined );

        await vscode.workspace.getConfiguration( `mistral` ).update(
            `inlineCompletionEnabled`, false, vscode.ConfigurationTarget.Global,
        );
        this.log.info( `[Mistral] Inline completions disabled — Copilot inline restored.` );
        this.render();
    }

    public async toggle(): Promise<void> {
        if ( this.isEnabled() ) {
            await this.disable();
        } else {
            if ( this.getModelId() === `` ) {
                const pick = await vscode.window.showInformationMessage(
                    `No Mistral inline completion model selected. Pick one now?`,
                    `Select Model`, `Cancel`,
                );
                if ( pick === `Select Model` ) {
                    await vscode.commands.executeCommand( `mistral-adapter.selectInlineCompletionModel` );
                }
                if ( this.getModelId() === `` ) {
                    this.render(); return;
                }
            }
            await this.enable();
        }
    }
}
