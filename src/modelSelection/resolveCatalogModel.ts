import type { MistralModel } from '../types.js';

export function ResolveCatalogModel ( models: readonly MistralModel[], identifier: unknown ): MistralModel | undefined {
    if ( typeof identifier !== `string` || identifier.length === 0 ) {
        return undefined;
    }
    const normalizedIdentifier = identifier.startsWith( `mistral/` )
        ? identifier.slice( `mistral/`.length )
        : identifier;
    const exactModel = models.find( candidate => {
        return candidate.id === normalizedIdentifier;
    } );
    if ( exactModel ) {
        return exactModel;
    }
    const matchingModels = models.filter( candidate => {
        return candidate.aliases?.includes( normalizedIdentifier );
    } );
    return matchingModels.length === 1 ? matchingModels[ 0 ] : undefined;
}
