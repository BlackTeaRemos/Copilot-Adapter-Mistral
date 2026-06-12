import type { ExtensionContext, LogOutputChannel } from 'vscode';
import type { MistralModel } from '../types.js';

const CACHE_KEY = `mistral.cachedModels`;
const CACHE_VERSION = 1;

interface CachedModels {
    version: number;
    timestamp: number;
    models: MistralModel[];
}

export class ModelCache {
    constructor (
        private readonly context: ExtensionContext,
        private readonly log: LogOutputChannel,
    ) { }

    public load (): MistralModel[] | null {
        const raw = this.context.globalState.get<CachedModels>( CACHE_KEY );
        if ( !raw || raw.version !== CACHE_VERSION || !Array.isArray( raw.models ) || raw.models.length === 0 ) {
            return null;
        }
        const ageMs = Date.now() - raw.timestamp;
        this.log.info( `[Mistral][probe] models served-from-cache (n=${ raw.models.length }, age=${ Math.round( ageMs / 1000 ) }s)` );
        return raw.models;
    }

    public async save ( models: MistralModel[] ): Promise<void> {
        if ( models.length === 0 ) {
            return;
        }
        const payload: CachedModels = { version: CACHE_VERSION, timestamp: Date.now(), models };
        await this.context.globalState.update( CACHE_KEY, payload );
        this.log.info( `[Mistral][probe] models cached-to-disk (n=${ models.length })` );
    }

    public async clear (): Promise<void> {
        await this.context.globalState.update( CACHE_KEY, undefined );
        this.log.info( `[Mistral] model cache cleared` );
    }
}
