import type { Mistral } from '@mistralai/mistralai';

/** Mistral's embedding models. Only these may be used for embeddings. */
export const EMBEDDING_MODELS = [`codestral-embed`, `mistral-embed`] as const;
export type EmbeddingModel = typeof EMBEDDING_MODELS[ number ];

/** Default embedding model. codestral-embed is tuned for code retrieval. */
export const DEFAULT_EMBED_MODEL: EmbeddingModel = `codestral-embed`;

/** True when `id` is a Mistral embedding model (vs a chat/FIM model). */
export function isEmbeddingModel( id: string ): boolean {
    return /embed/i.test( id );
}

/** Returns `model` if it is an embedding model, else the default embed model. */
export function coerceEmbeddingModel( model: string | undefined ): EmbeddingModel {
    return model && isEmbeddingModel( model ) ? model as EmbeddingModel : DEFAULT_EMBED_MODEL;
}

/** Inputs sent per embeddings request. Mistral accepts batches; keep them modest. */
export const EMBED_BATCH_SIZE = 64;

export interface EmbeddingsLogger {
    info ( msg: string ): void;
    warn ( msg: string ): void;
    error ( msg: string ): void;
    debug ( msg: string ): void;
}

export interface CreateEmbeddingsOptions {
    /** Optional fixed output dimension (codestral-embed supports up to 3072). */
    outputDimension?: number;
    /** Returns true to abort before the next batch. */
    shouldCancel?: () => boolean;
    /** Called after each batch with the count embedded so far. */
    onProgress?: ( done: number, total: number ) => void;
    log?: EmbeddingsLogger;
}

/**
 * Embeds `inputs` with the given Mistral model, batching requests and
 * preserving input order via each item's response `index`.
 *
 * @returns One vector per input, index-aligned with `inputs`. A cancelled run
 *          returns the vectors collected so far (trailing slots may be empty).
 */
export async function createEmbeddings(
    client: Mistral,
    model: string,
    inputs: string[],
    opts: CreateEmbeddingsOptions = {},
): Promise<number[][]> {
    if ( !isEmbeddingModel( model ) ) {
        throw new Error( `"${ model }" is not a Mistral embedding model. Use one of: ${ EMBEDDING_MODELS.join( `, ` ) }.` );
    }
    const out: number[][] = new Array( inputs.length );
    for ( let start = 0; start < inputs.length; start += EMBED_BATCH_SIZE ) {
        if ( opts.shouldCancel?.() ) {
            break;
        }
        const batch = inputs.slice( start, start + EMBED_BATCH_SIZE );
        const res = await client.embeddings.create( {
            model,
            inputs: batch,
            outputDimension: opts.outputDimension,
        } );
        for ( let i = 0; i < res.data.length; i++ ) {
            const d = res.data[ i ];
            // Fall back to positional order when the API omits `index`.
            const offset = d.index ?? i;
            out[ start + offset ] = d.embedding ?? [];
        }
        opts.onProgress?.( Math.min( start + batch.length, inputs.length ), inputs.length );
    }
    return out;
}

/** Cosine similarity of two equal-length vectors. Returns 0 for a zero vector. */
export function cosineSimilarity( a: readonly number[], b: readonly number[] ): number {
    const n = Math.min( a.length, b.length );
    let dot = 0, na = 0, nb = 0;
    for ( let i = 0; i < n; i++ ) {
        dot += a[ i ] * b[ i ];
        na += a[ i ] * a[ i ];
        nb += b[ i ] * b[ i ];
    }
    if ( na === 0 || nb === 0 ) {
        return 0;
    }
    return dot / ( Math.sqrt( na ) * Math.sqrt( nb ) );
}

/**
 * Ranks `items` by cosine similarity to `query`, descending, keeping the top
 * `topK`. Items below `minScore` (if given) are dropped.
 */
export function rankBySimilarity<T>(
    query: readonly number[],
    items: ReadonlyArray<{ item: T; vector: readonly number[]; }>,
    topK: number,
    minScore = 0,
): Array<{ item: T; score: number; }> {
    return items
        .map( ( { item, vector } ) => {
            return  { item, score: cosineSimilarity( query, vector ) };
        } )
        .filter( e => {
            return e.score > minScore;
        } )
        .sort( ( a, b ) => {
            return b.score - a.score;
        } )
        .slice( 0, topK );
}
