import type { ExtensionContext } from 'vscode';

/** Welford incremental mean — O(1) space, no sample window. */
type RunningMean = {
    mean: number;
    n: number;
    lastDelta: number;
};

const ZERO_MEAN: RunningMean = { mean: 0, n: 0, lastDelta: 0 };

function updateMean ( prev: RunningMean, x: number ): RunningMean {
    const n = prev.n + 1;
    const mean = prev.mean + ( x - prev.mean ) / n;
    return { mean, n, lastDelta: Math.abs( mean - prev.mean ) };
}

/**
 * Confidence in [0, 1). Geometric mean of count factor and stability factor.
 *
 *   n=0  → 0.00   n=3  → 0.50
 *   n=8  → 0.67   n=24 → 0.80
 */
function confidence ( m: RunningMean ): number {
    const countFactor = 1 - 1 / Math.sqrt( m.n + 1 );
    if ( m.n < 2 || m.mean === 0 ) { return countFactor; }
    const stabilityFactor = 1 - Math.min( 1, m.lastDelta / m.mean );
    return Math.sqrt( countFactor * stabilityFactor );
}

const STORAGE_KEY = 'mistral.tokenizerCalibration.v1';
const MIN_CONF = 0.4;

/**
 * Calibrates the tiktoken → Mistral token count scale factor per model.
 *
 * After each request VS Code gives us Mistral's actual `promptTokens`.
 * We also track our tiktoken estimate for that same prompt. The ratio
 * `mistralPromptTokens / tiktokenEstimate` is a stable, model-specific
 * constant (~1.15–1.4). After enough samples, `provideTokenCount` applies
 * it so the VS Code context window display matches Mistral's real counts.
 */
export class TokenizerCalibration {
    private data: Map<string, RunningMean>;

    constructor ( private readonly ctx: ExtensionContext ) {
        const stored = ctx.globalState.get<Record<string, RunningMean>>( STORAGE_KEY, {} );
        this.data = new Map( Object.entries( stored ) );
    }

    /**
     * Record one completed request.
     *
     * @param mistralPromptTokens  Actual prompt tokens from Mistral API response.
     * @param tiktokenEstimate     Our tiktoken estimate for the same prompt (0 = unknown).
     */
    record ( modelId: string, mistralPromptTokens: number, tiktokenEstimate: number ): void {
        if ( mistralPromptTokens <= 0 || tiktokenEstimate <= 0 ) { return; }
        const prev = this.data.get( modelId ) ?? { ...ZERO_MEAN };
        this.data.set( modelId, updateMean( prev, mistralPromptTokens / tiktokenEstimate ) );
        void this.persist();
    }

    /**
     * Scale factor to multiply tiktoken counts by to approximate Mistral counts.
     * Returns `undefined` when confidence is below threshold.
     */
    scale ( modelId: string ): number | undefined {
        const m = this.data.get( modelId );
        return m && confidence( m ) >= MIN_CONF ? m.mean : undefined;
    }

    confidenceLevel ( modelId: string ): number {
        const m = this.data.get( modelId );
        return m ? confidence( m ) : 0;
    }

    sampleCount ( modelId: string ): number {
        return this.data.get( modelId )?.n ?? 0;
    }

    private async persist (): Promise<void> {
        const obj: Record<string, RunningMean> = {};
        for ( const [ k, v ] of this.data ) { obj[ k ] = v; }
        await this.ctx.globalState.update( STORAGE_KEY, obj );
    }
}
