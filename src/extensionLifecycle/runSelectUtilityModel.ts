import * as vscode from 'vscode';
import { MistralChatModelProvider } from '../provider.js';
import { ResolveCatalogModel } from '../modelSelection/resolveCatalogModel.js';

export async function RunSelectUtilityModel (
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

    const currentModel = ResolveCatalogModel( chatModels, currentMistralId );
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
            picked: m.id === ( currentModel?.id ?? currentMistralId ),
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
