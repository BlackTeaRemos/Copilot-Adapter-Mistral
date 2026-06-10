import { Mistral } from '@mistralai/mistralai';
import { ExtensionContext, LogOutputChannel } from 'vscode';

export interface AuthDeps {
    context: ExtensionContext;
    log: LogOutputChannel;
    getClient: () => Mistral | null;
    setClient: ( client: Mistral | null ) => void;
    invalidateModelCache: () => void;
    fireModelInfoChange: () => void;
}
