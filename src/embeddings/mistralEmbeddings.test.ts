import { describe, expect, it, vi } from 'vitest';
import { createEmbeddings, cosineSimilarity, rankBySimilarity, EMBED_BATCH_SIZE, isEmbeddingModel, coerceEmbeddingModel } from './mistralEmbeddings.js';

function mockClient ( handler: ( inputs: string[] ) => number[][] ) {
    return {
        embeddings: {
            create: vi.fn( async ( req: { inputs: string[]; } ) => {
                return  {
                    data: handler( req.inputs ).map( ( embedding, index ) => {
                        return  { embedding, index };
                    } ),
                };
            } ),
        },
    } as any;
}

describe( `embedding model helpers`, () => {
    it( `isEmbeddingModel matches embed models only`, () => {
        expect( isEmbeddingModel( `mistral-embed` ) ).toBe( true );
        expect( isEmbeddingModel( `codestral-embed` ) ).toBe( true );
        expect( isEmbeddingModel( `mistral-large-latest` ) ).toBe( false );
        expect( isEmbeddingModel( `codestral-latest` ) ).toBe( false );
    } );
    it( `coerceEmbeddingModel falls back to default for non-embed/undefined`, () => {
        expect( coerceEmbeddingModel( `mistral-embed` ) ).toBe( `mistral-embed` );
        expect( coerceEmbeddingModel( `mistral-large-latest` ) ).toBe( `codestral-embed` );
        expect( coerceEmbeddingModel( undefined ) ).toBe( `codestral-embed` );
    } );
    it( `createEmbeddings rejects non-embedding models`, async () => {
        const client = { embeddings: { create: vi.fn() } } as any;
        await expect( createEmbeddings( client, `mistral-large-latest`, [ `x` ] ) ).rejects.toThrow( /not a Mistral embedding model/ );
        expect( client.embeddings.create ).not.toHaveBeenCalled();
    } );
} );

describe( `cosineSimilarity`, () => {
    it( `is 1 for identical vectors`, () => {
        expect( cosineSimilarity( [ 1, 2, 3 ], [ 1, 2, 3 ] ) ).toBeCloseTo( 1, 6 );
    } );
    it( `is 0 for orthogonal vectors`, () => {
        expect( cosineSimilarity( [ 1, 0 ], [ 0, 1 ] ) ).toBe( 0 );
    } );
    it( `is 0 when either vector is all zeros`, () => {
        expect( cosineSimilarity( [ 0, 0 ], [ 1, 1 ] ) ).toBe( 0 );
    } );
    it( `compares only the overlapping length`, () => {
        expect( cosineSimilarity( [ 1, 0, 9 ], [ 1, 0 ] ) ).toBeCloseTo( 1, 6 );
    } );
} );

describe( `rankBySimilarity`, () => {
    const items = [
        { item: `a`, vector: [ 1, 0 ] },
        { item: `b`, vector: [ 0.9, 0.1 ] },
        { item: `c`, vector: [ 0, 1 ] },
    ];
    it( `orders by descending similarity and caps at topK`, () => {
        const r = rankBySimilarity( [ 1, 0 ], items, 2 );
        expect( r.map( x => {
            return x.item;
        } ) ).toEqual( [ `a`, `b` ] );
        expect( r[ 0 ].score ).toBeGreaterThanOrEqual( r[ 1 ].score );
    } );
    it( `drops items at or below minScore`, () => {
        const r = rankBySimilarity( [ 1, 0 ], items, 10, 0.5 );
        expect( r.map( x => {
            return x.item;
        } ) ).toEqual( [ `a`, `b` ] );
        expect( r.some( x => {
            return x.item === `c`;
        } ) ).toBe( false );
    } );
} );

describe( `createEmbeddings`, () => {
    it( `returns one vector per input, index-aligned`, async () => {
        const client = mockClient( inputs => {
            return inputs.map( ( _, i ) => {
                return [ i, i + 1 ];
            } );
        } );
        const out = await createEmbeddings( client, `codestral-embed`, [ `x`, `y`, `z` ] );
        expect( out ).toEqual( [ [ 0, 1 ], [ 1, 2 ], [ 2, 3 ] ] );
    } );

    it( `restores order when the API returns shuffled indices`, async () => {
        const client = {
            embeddings: {
                create: vi.fn( async () => {
                    return  {
                        data: [
                            { embedding: [ 2 ], index: 2 },
                            { embedding: [ 0 ], index: 0 },
                            { embedding: [ 1 ], index: 1 },
                        ],
                    };
                } ),
            },
        } as any;
        const out = await createEmbeddings( client, `mistral-embed`, [ `a`, `b`, `c` ] );
        expect( out ).toEqual( [ [ 0 ], [ 1 ], [ 2 ] ] );
    } );

    it( `batches large inputs`, async () => {
        const client = mockClient( inputs => {
            return inputs.map( () => {
                return [ 1 ];
            } );
        } );
        const inputs = Array.from( { length: EMBED_BATCH_SIZE + 5 }, ( _, i ) => {
            return `t${ i }`;
        } );
        const out = await createEmbeddings( client, `mistral-embed`, inputs );
        expect( out ).toHaveLength( inputs.length );
        expect( client.embeddings.create ).toHaveBeenCalledTimes( 2 );
    } );

    it( `reports progress and stops when cancelled`, async () => {
        const client = mockClient( inputs => {
            return inputs.map( () => {
                return [ 1 ];
            } );
        } );
        const inputs = Array.from( { length: EMBED_BATCH_SIZE * 3 }, ( _, i ) => {
            return `t${ i }`;
        } );
        let cancel = false;
        const seen: number[] = [];
        await createEmbeddings( client, `mistral-embed`, inputs, {
            onProgress: done => {
                seen.push( done ); cancel = true;
            },
            shouldCancel: () => {
                return cancel;
            },
        } );
        // First batch runs, then cancellation halts further batches.
        expect( client.embeddings.create ).toHaveBeenCalledTimes( 1 );
        expect( seen ).toEqual( [ EMBED_BATCH_SIZE ] );
    } );
} );
