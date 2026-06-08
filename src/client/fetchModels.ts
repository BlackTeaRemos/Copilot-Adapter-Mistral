import { Mistral } from '@mistralai/mistralai';
import type { BaseModelCard, FTModelCard } from '@mistralai/mistralai/models/components';
import type { MistralModel } from '../types.js';
import { DEFAULT_COMPLETION_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS, MODEL_OUTPUT_LIMITS } from '../types.js';
import { formatModelName } from '../conversion/index.js';
import type { MistralClientLogger } from './clientLogger.js';
import { CapabilityModelStore, pickCanonical } from './modelStore.js';

// Re-exported for callers and tests that import the canonical-id picker from here.
export { pickCanonical };

type KnownModelCard = BaseModelCard | FTModelCard;


async function _fetchModels (
    client: Mistral,
    log: MistralClientLogger,
): Promise<MistralModel[]> {
    const response = await client.models.list();

    const byId = new Map<string, KnownModelCard>();
    for ( const model of response.data ?? [] ) {
        if ( model.type !== 'base' && model.type !== 'fine-tuned' ) {
            continue;
        }
        if ( !byId.has( model.id ) ) {
            byId.set( model.id, model );
        }
    }

    // Reset the singleton so repeat fetches (after cache expiry) don't accumulate stale models.
    const store = CapabilityModelStore.getInstance();
    store.clear();

    // Store all models in the CapabilityModelStore, including non-chat models.
    // Deduplication by family prefix is handled internally by CapabilityModelStore.insertModel.
    for ( const [ , modelCard ] of byId ) {
        const originalName = modelCard.name ? formatModelName( modelCard.name ) : formatModelName( modelCard.id );
        const model: MistralModel = {
            id: modelCard.id,
            name: originalName,
            detail: modelCard.description ?? undefined,
            maxInputTokens: modelCard.maxContextLength ?? 32768,
            maxOutputTokens: MODEL_OUTPUT_LIMITS[ modelCard.id.toLowerCase() ] ?? DEFAULT_MAX_OUTPUT_TOKENS,
            defaultCompletionTokens: DEFAULT_COMPLETION_TOKENS,
            toolCalling: modelCard.capabilities?.functionCalling ?? false,
            supportsParallelToolCalls: modelCard.capabilities?.functionCalling ?? false,
            supportsVision: modelCard.capabilities?.vision ?? false,
            supportsCompletionFim: modelCard.capabilities?.completionFim ?? false,
            completionChat: modelCard.capabilities.completionChat,
            temperature: modelCard.defaultModelTemperature ?? undefined,
        };
        store.insertModel( model );
    }

    // Keep chat-compatible models, then collapse any sharing a display name to
    // the single canonical (latest/highest-version) entry.
    const chatModels = store.getAllModels().filter( model => model.completionChat );

    const byName = new Map<string, MistralModel[]>();
    for ( const model of chatModels ) {
        const group = byName.get( model.name );
        if ( group ) { group.push( model ); }
        else { byName.set( model.name, [ model ] ); }
    }

    const result: MistralModel[] = [];
    for ( const group of byName.values() ) {
        if ( group.length === 1 ) { result.push( group[ 0 ] ); continue; }
        const canonicalId = pickCanonical( group.map( m => m.id ) );
        result.push( group.find( m => m.id === canonicalId ) ?? group[ 0 ] );
    }

    return result;
}

export async function fetchModels ( client: Mistral, log: MistralClientLogger ): Promise<MistralModel[]> {
    try {
        return await _fetchModels( client, log );
    } catch ( error ) {
        log.error( '[Mistral] Failed to fetch models: ' + String( error ) );
        return [];
    }
};