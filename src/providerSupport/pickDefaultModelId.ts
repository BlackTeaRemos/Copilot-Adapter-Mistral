import { workspace } from 'vscode';
import type { MistralModel } from '../types.js';
import { SelectDefaultModel } from '../modelSelection/selectDefaultModel.js';

export function PickDefaultModelId ( models: MistralModel[] ): string {
    const configuration = workspace.getConfiguration( `mistral` );
    const inspected = configuration.inspect?.<string>( `defaultModel` );
    const configured = inspected
        ? inspected.workspaceFolderValue ?? inspected.workspaceValue ?? inspected.globalValue ?? ``
        : configuration.get<string>( `defaultModel` ) ?? ``;
    return SelectDefaultModel( models, configured );
}
