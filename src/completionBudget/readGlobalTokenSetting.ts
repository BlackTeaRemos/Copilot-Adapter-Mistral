import { workspace } from 'vscode';
import type { GlobalTokenSetting } from './globalTokenSetting.js';

export function ReadGlobalTokenSetting (): GlobalTokenSetting {
    const configuration = workspace.getConfiguration( `mistral` );
    const inspected = configuration.inspect?.<unknown>( `maxTokens` );
    if ( !inspected ) {
        const value = configuration.get<unknown>( `maxTokens` );
        return { value: value === null ? undefined : value, origin: value === null ? `automatic maximum` : `scope unavailable` };
    }
    const scopes = [
        { value: inspected.workspaceFolderLanguageValue, label: `workspace folder language setting` },
        { value: inspected.workspaceLanguageValue, label: `workspace language setting` },
        { value: inspected.globalLanguageValue, label: `user language setting` },
        { value: inspected.workspaceFolderValue, label: `workspace folder setting` },
        { value: inspected.workspaceValue, label: `workspace setting` },
        { value: inspected.globalValue, label: `user setting` },
    ];
    const selected = scopes.find( scope => {
        return scope.value !== undefined;
    } );
    const value = configuration.get<unknown>( `maxTokens` );
    return selected
        ? { value: value === null ? undefined : value, origin: value === null ? `automatic maximum (${ selected.label })` : selected.label }
        : { value: undefined, origin: `automatic maximum` };
}
