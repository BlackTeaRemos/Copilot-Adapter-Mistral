import { describe, expect, it } from 'vitest';
import { ResolveCatalogModel } from '../resolveCatalogModel.js';
import { SelectDefaultModel } from '../selectDefaultModel.js';
import { CreateSelectionModel } from './createSelectionModel.js';

describe( `catalog-driven model selection`, () => {
    it( `prefers the current public default regardless of response ordering`, () => {
        const models = [ CreateSelectionModel( `codestral-2508` ), CreateSelectionModel( `mistral-large-4` ) ];
        expect( SelectDefaultModel( models, `` ) ).toBe( `mistral-large-4` );
    } );

    it( `resolves an explicitly configured API alias to its advertised card`, () => {
        const current = CreateSelectionModel( `mistral-medium-3-5`, { aliases: [ `mistral-medium-latest` ] } );
        expect( SelectDefaultModel( [ current ], `mistral/mistral-medium-latest` ) ).toBe( current.id );
    } );

    it( `keeps exact-ID selections authoritative over other cards' aliases`, () => {
        const exact = CreateSelectionModel( `selected-id` );
        const other = CreateSelectionModel( `other-id`, { aliases: [ exact.id ] } );
        expect( ResolveCatalogModel( [ other, exact ], exact.id ) ).toBe( exact );
    } );

    it( `does not guess shared aliases or map a different vendor to Mistral`, () => {
        const models = [
            CreateSelectionModel( `first`, { aliases: [ `shared` ] } ),
            CreateSelectionModel( `second`, { aliases: [ `shared` ] } ),
        ];
        expect( ResolveCatalogModel( models, `shared` ) ).toBeUndefined();
        expect( ResolveCatalogModel( models, `other/first` ) ).toBeUndefined();
        expect( ResolveCatalogModel( models, `first-latest` ) ).toBeUndefined();
    } );

    it( `avoids deprecated automatic defaults while retaining an explicit dated selection`, () => {
        const deprecated = CreateSelectionModel( `mistral-large-4`, { deprecationDate: `2026-10-31` } );
        const active = CreateSelectionModel( `mistral-small-2603` );
        expect( SelectDefaultModel( [ deprecated, active ], `missing-model` ) ).toBe( active.id );
        expect( SelectDefaultModel( [ deprecated, active ], deprecated.id ) ).toBe( deprecated.id );
    } );

    it( `prefers an API-listed active model over an unconfirmed provisioned default`, () => {
        const provisioned = CreateSelectionModel( `mistral-large-4`, { catalogSource: `provisioned` } );
        const discovered = CreateSelectionModel( `mistral-medium-3-5`, { catalogSource: `api` } );
        expect( SelectDefaultModel( [ provisioned, discovered ], `` ) ).toBe( discovered.id );
        expect( SelectDefaultModel( [ provisioned, discovered ], provisioned.id ) ).toBe( provisioned.id );
    } );

    it( `handles empty and deprecated-only catalogs without synthesizing an identity`, () => {
        expect( SelectDefaultModel( [], `configured` ) ).toBe( `` );
        const deprecated = CreateSelectionModel( `retiring`, { deprecationDate: `2026-10-31` } );
        expect( SelectDefaultModel( [ deprecated ], `missing` ) ).toBe( deprecated.id );
    } );
} );
