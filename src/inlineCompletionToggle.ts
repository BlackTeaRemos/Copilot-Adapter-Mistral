import * as vscode from 'vscode';

const COPILOT_BACKUP_KEY = `mistral.copilotEnableBackup`;
const COPILOT_SECTION = `github.copilot`;
const COPILOT_ENABLE = `enable`;

export class InlineCompletionToggle {
    constructor (
        private readonly context: vscode.ExtensionContext,
        private readonly log: vscode.LogOutputChannel,
    ) { }

    public isEnabled (): boolean {
        return vscode.workspace.getConfiguration( `mistral` ).get( `inlineCompletionEnabled` ) ?? false;
    }

    private getModelId (): string {
        return vscode.workspace.getConfiguration( `mistral` ).get( `inlineCompletionModel` ) ?? ``;
    }

    public render (): void { }

    public async enable (): Promise<void> {
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
        this.log.info( `[Mistral] Inline completions enabled - Copilot inline disabled (github.copilot.enable = { "*": false }).` );
        this.render();
    }

    public async disable (): Promise<void> {
        const copilotCfg = vscode.workspace.getConfiguration( COPILOT_SECTION );
        const backup = this.context.globalState.get<Record<string, boolean> | null>( COPILOT_BACKUP_KEY );

        // Restore: if user had an explicit global value, put it back; otherwise clear our override.
        const restoreValue = backup === undefined ? undefined : ( backup ?? undefined );
        await copilotCfg.update( COPILOT_ENABLE, restoreValue, vscode.ConfigurationTarget.Global );
        await this.context.globalState.update( COPILOT_BACKUP_KEY, undefined );

        await vscode.workspace.getConfiguration( `mistral` ).update(
            `inlineCompletionEnabled`, false, vscode.ConfigurationTarget.Global,
        );
        this.log.info( `[Mistral] Inline completions disabled - Copilot inline restored.` );
        this.render();
    }

    public async toggle (): Promise<void> {
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
