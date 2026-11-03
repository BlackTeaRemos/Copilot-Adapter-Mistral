import type { ExtensionContext, LogOutputChannel } from 'vscode';

interface RunningMean {
    mean: number;
    n: number;
    lastDelta: number;
}

const ZERO_MEAN: RunningMean = { mean: 0, n: 0, lastDelta: 0 };
const STORAGE_KEY = `mistral.tokenizerCalibration.v1`;
const MIN_CONF = 0.4;

export class TokenizerCalibration {
    private readonly _data: Map<string, RunningMean>;

    public constructor (
        private readonly _context: ExtensionContext,
        private readonly _log?: Pick<LogOutputChannel, `warn`>,
    ) {
        const stored = _context.globalState.get<Record<string, RunningMean>>( STORAGE_KEY, {} );
        this._data = new Map( Object.entries( stored ) );
    }

    public record ( modelId: string, mistralPromptTokens: number, tiktokenEstimate: number ): void {
        if ( mistralPromptTokens <= 0 || tiktokenEstimate <= 0 ) {
            return;
        }
        const previous = this._data.get( modelId ) ?? { ...ZERO_MEAN };
        this._data.set( modelId, this.__UpdateMean( previous, mistralPromptTokens / tiktokenEstimate ) );
        void this.__Persist().catch( error => {
            this._log?.warn( `[Mistral] Tokenizer calibration could not be saved: ${ String( error ) }` );
        } );
    }

    public scale ( modelId: string ): number | undefined {
        const statistics = this._data.get( modelId );
        return statistics && this.__Confidence( statistics ) >= MIN_CONF ? statistics.mean : undefined;
    }

    public confidenceLevel ( modelId: string ): number {
        const statistics = this._data.get( modelId );
        return statistics ? this.__Confidence( statistics ) : 0;
    }

    public sampleCount ( modelId: string ): number {
        return this._data.get( modelId )?.n ?? 0;
    }

    private __UpdateMean ( previous: RunningMean, sample: number ): RunningMean {
        const sampleCount = previous.n + 1;
        const mean = previous.mean + ( sample - previous.mean ) / sampleCount;
        return { mean, n: sampleCount, lastDelta: Math.abs( mean - previous.mean ) };
    }

    private __Confidence ( statistics: RunningMean ): number {
        const countFactor = 1 - 1 / Math.sqrt( statistics.n + 1 );
        if ( statistics.n < 2 || statistics.mean === 0 ) {
            return countFactor;
        }
        const stabilityFactor = 1 - Math.min( 1, statistics.lastDelta / statistics.mean );
        return Math.sqrt( countFactor * stabilityFactor );
    }

    private async __Persist (): Promise<void> {
        const stored = Object.fromEntries( this._data );
        await this._context.globalState.update( STORAGE_KEY, stored );
    }
}
