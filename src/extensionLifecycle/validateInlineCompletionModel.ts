import * as vscode from 'vscode';
import { MistralChatModelProvider } from '../provider.js';
import { ResolveCatalogModel } from '../modelSelection/resolveCatalogModel.js';

export async function ValidateInlineCompletionModel (
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

    if ( !ResolveCatalogModel( fimModels, modelId ) ) {
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
