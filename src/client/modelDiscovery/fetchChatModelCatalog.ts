import type { Mistral } from '@mistralai/mistralai';
import type { MistralModel } from '../../types.js';
import type { MistralClientLogger } from '../clientLogger.js';
import { CapabilityModelStore } from '../modelStore.js';
import { CreateAuthoredModelCards } from './createAuthoredModelCards.js';
import type { KnownModelCard } from './knownModelCard.js';
import { ModelCardConverter } from './modelCardConverter.js';

export async function FetchChatModelCatalog (
    client: Mistral,
    log: MistralClientLogger,
): Promise<MistralModel[]> {
    const response = await client.models.list();
    if ( !response.data ) {
        log.error( `[Mistral] Failed to fetch models. Check API key and network connectivity.` );
        return [];
    }
    const byId = new Map<string, KnownModelCard>();
    for ( const card of CreateAuthoredModelCards() ) {
        byId.set( card.id, card );
    }
    const apiIdentifiers = new Set<string>();
    for ( const card of response.data ) {
        if ( !card || ( card.type !== `base` && card.type !== `fine-tuned` ) ) {
            continue;
        }
        if ( typeof card.id !== `string` || !card.id.trim() ) {
            continue;
        }
        if ( !apiIdentifiers.has( card.id ) ) {
            byId.set( card.id, card );
            apiIdentifiers.add( card.id );
        }
    }
    for ( const [ identifier ] of byId ) {
        if ( apiIdentifiers.has( identifier ) ) {
            continue;
        }
        const declaredByApi = [ ...byId.values() ].some( candidate => {
            return apiIdentifiers.has( candidate.id ) && candidate.aliases?.includes( identifier );
        } );
        if ( declaredByApi ) {
            byId.delete( identifier );
        }
    }
    const convertedModels: MistralModel[] = [];
    const converter = new ModelCardConverter();
    for ( const card of byId.values() ) {
        try {
            convertedModels.push( {
                ...converter.Convert( card ),
                catalogSource: apiIdentifiers.has( card.id ) ? `api` : `provisioned`,
            } );
        } catch ( error ) {
            log.warn( `[Mistral] Skipping invalid model "${ card.id }": ${ String( error ) }` );
        }
    }
    const store = CapabilityModelStore.getInstance();
    store.clear();
    for ( const model of convertedModels ) {
        store.insertModel( model );
    }
    return store.getChatModels();
}
