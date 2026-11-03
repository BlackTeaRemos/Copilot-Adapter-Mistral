import * as vscode from 'vscode';
import type { MistralChatModelProvider } from '../provider.js';
import { ResolveCatalogModel } from '../modelSelection/resolveCatalogModel.js';
import { GetUtilityModelDefault } from './getUtilityModelDefault.js';
import { GetUtilitySmallModelDefault } from './getUtilitySmallModelDefault.js';
import { UTILITY_NOTIFICATION_STATE_KEY } from './utilityNotificationStateKey.js';

export async function PromptConfigureUtilityModels (
    context: vscode.ExtensionContext,
    log: vscode.LogOutputChannel,
    provider: Pick<MistralChatModelProvider, `fetchModels`>,
): Promise<void> {
    const cfg = vscode.workspace.getConfiguration( `chat` );
    const utilityModel: string = cfg.get( `utilityModel` ) ?? ``;
    const utilitySmallModel: string = cfg.get( `utilitySmallModel` ) ?? ``;

    const needsConfig = !utilityModel.startsWith( `mistral/` ) || !utilitySmallModel.startsWith( `mistral/` );
    if ( !needsConfig ) {
        return;
    }

    const alreadyShown = context.globalState.get<boolean>( UTILITY_NOTIFICATION_STATE_KEY );
    if ( alreadyShown ) {
        return;
    }
    await context.globalState.update( UTILITY_NOTIFICATION_STATE_KEY, true );

    log.info( `[Mistral] Prompting user to configure utility models (current: utilityModel="${ utilityModel }", utilitySmallModel="${ utilitySmallModel }")` );

    const selection = await vscode.window.showInformationMessage(
        `Mistral: Configure utility models (used for chat titles, commit messages, etc.) to use your Mistral API key?`,
        `Configure`,
        `Open Settings`,
        `Dismiss`,
    );

    if ( selection === `Configure` ) {
        const models = await provider.fetchModels();
        const configuredUtility = GetUtilityModelDefault();
        const configuredSmallUtility = GetUtilitySmallModelDefault();
        const resolvedUtility = ResolveCatalogModel( models, configuredUtility );
        const resolvedSmallUtility = ResolveCatalogModel( models, configuredSmallUtility );
        const utilityIdentifier = resolvedUtility ? `mistral/${ resolvedUtility.id }` : configuredUtility;
        const smallUtilityIdentifier = resolvedSmallUtility ? `mistral/${ resolvedSmallUtility.id }` : configuredSmallUtility;
        const target = vscode.ConfigurationTarget.Global;
        if ( !utilityModel.startsWith( `mistral/` ) ) {
            await cfg.update( `utilityModel`, utilityIdentifier, target );
        }
        if ( !utilitySmallModel.startsWith( `mistral/` ) ) {
            await cfg.update( `utilitySmallModel`, smallUtilityIdentifier, target );
        }
        log.info( `[Mistral] Utility models configured: utilityModel=${ utilityIdentifier }, utilitySmallModel=${ smallUtilityIdentifier }` );
        vscode.window.showInformationMessage( `Mistral: Utility models configured. Chat title generation and commit messages now use Mistral.` );
    } else if ( selection === `Open Settings` ) {
        await vscode.commands.executeCommand( `workbench.action.openSettings`, `chat.utilityModel` );
    }
}
