import * as vscode from 'vscode';
import { DEFAULT_SMALL_MODEL_ID } from '../modelSelection/defaultModels.js';

export function GetUtilitySmallModelDefault (): string {
    return vscode.workspace.getConfiguration( `mistral` ).get<string>( `utilitySmallModel` ) || `mistral/${ DEFAULT_SMALL_MODEL_ID }`;
}
