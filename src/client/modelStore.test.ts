import { beforeEach, describe, expect, it } from 'vitest';
import { CapabilityModelStore } from './modelStore.js';
import { CreateSelectionModel } from '../modelSelection/tests/createSelectionModel.js';

describe( `CapabilityModelStore exact catalog identities`, () => {
    const store = CapabilityModelStore.getInstance();
    beforeEach( () => {
        store.clear();
    } );

    it( `preserves separately addressable versions in either insertion order`, () => {
        for ( const identifiers of [
            [ `mistral-large-2512`, `mistral-large-latest`, `mistral-large-4` ],
            [ `mistral-large-4`, `mistral-large-latest`, `mistral-large-2512` ],
        ] ) {
            store.clear();
            for ( const identifier of identifiers ) {
                store.insertModel( CreateSelectionModel( identifier ) );
            }
            expect( store.getAllModels().map( model => {
                return model.id;
            } ) ).toEqual( identifiers );
        }
    } );

    it( `replaces an exact ID and updates every capability result`, () => {
        store.insertModel( CreateSelectionModel( `same-id`, { toolCalling: true, supportsVision: true } ) );
        store.insertModel( CreateSelectionModel( `same-id`, { supportsCompletionFim: true, completionChat: false } ) );
        expect( store.getAllModels() ).toHaveLength( 1 );
        expect( store.getModelsWithToolCalling() ).toEqual( [] );
        expect( store.getModelsWithVision() ).toEqual( [] );
        expect( store.getChatModels() ).toEqual( [] );
        expect( store.getModelsWithCompletionFim() ).toHaveLength( 1 );
    } );

    it( `returns independent array snapshots and clears all capabilities`, () => {
        store.insertModel( CreateSelectionModel( `chat`, { toolCalling: true } ) );
        store.getAllModels().length = 0;
        expect( store.getChatModels() ).toHaveLength( 1 );
        store.clear();
        expect( store.getAllModels() ).toEqual( [] );
        expect( store.getModelsWithToolCalling() ).toEqual( [] );
    } );
} );
