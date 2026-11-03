import type { MistralModel } from '../types.js';
import { DEFAULT_CHAT_MODEL_PREFERENCES } from './defaultModels.js';
import { ResolveCatalogModel } from './resolveCatalogModel.js';

export function SelectDefaultModel ( models: readonly MistralModel[], configuredIdentifier: string ): string {
    const configuredModel = ResolveCatalogModel( models, configuredIdentifier );
    if ( configuredModel ) {
        return configuredModel.id;
    }
    const activeModels = models.filter( candidate => {
        return !candidate.deprecationDate;
    } );
    const discoveredModels = activeModels.filter( candidate => {
        return candidate.catalogSource !== `provisioned`;
    } );
    const candidates = discoveredModels.length > 0 ? discoveredModels : activeModels;
    for ( const identifier of DEFAULT_CHAT_MODEL_PREFERENCES ) {
        const preferredModel = ResolveCatalogModel( candidates, identifier );
        if ( preferredModel ) {
            return preferredModel.id;
        }
    }
    return candidates[ 0 ]?.id ?? models[ 0 ]?.id ?? ``;
}
