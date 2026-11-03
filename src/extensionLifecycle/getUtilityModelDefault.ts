import * as vscode from 'vscode';
import { DEFAULT_CHAT_MODEL_ID } from '../modelSelection/defaultModels.js';

export function GetUtilityModelDefault (): string {
    return vscode.workspace.getConfiguration( `mistral` ).get<string>( `utilityModel` ) || `mistral/${ DEFAULT_CHAT_MODEL_ID }`;
}
