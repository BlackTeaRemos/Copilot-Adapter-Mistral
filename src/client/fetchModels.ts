import type { Mistral } from '@mistralai/mistralai';
import type { MistralModel } from '../types.js';
import type { MistralClientLogger } from './clientLogger.js';
import { FetchChatModelCatalog } from './modelDiscovery/fetchChatModelCatalog.js';


export async function fetchModels ( client: Mistral, log: MistralClientLogger ): Promise<MistralModel[]> {
    try {
        return await FetchChatModelCatalog( client, log );
    } catch ( error ) {
        log.error( `[Mistral] Failed to fetch models: ` + String( error ) );
        return [];
    }
}
