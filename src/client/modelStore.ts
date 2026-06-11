import type { MistralModel } from '../types.js';

/**
 * Extracts the family prefix from a model ID by stripping a trailing
 * `-latest` or `-NNNN` date-stamp segment.
 */
export function familyPrefix ( id: string ): string {
    return id.replace( /-(?:latest|\d{4})$/i, `` );
}

/** Joins all numeric runs in an id into a comparable version string. */
function extractVersion ( id: string ): string {
    return ( id.match( /(\d+(?:\.\d+)?)/g ) ?? [] ).join( `.` );
}

/**
 * Picks the canonical ID from a list of model IDs: prefer a `latest`
 * variant, else the highest numeric version.
 */
export function pickCanonical ( ids: string[] ): string {
    const latest = ids.find( id => {
        return /latest/i.test( id );
    } );
    if ( latest ) {
        return latest;
    }
    return ids.reduce( ( best, id ) => {
        return extractVersion( id ).localeCompare( extractVersion( best ), undefined, { numeric: true } ) > 0 ? id : best;
    } );
}

/**
 * Stores models grouped by their capabilities for efficient retrieval.
 */
export class CapabilityModelStore {
    private static _instance: CapabilityModelStore;
    private modelsByCapability: Map<keyof CapabilityModelStore.Capabilities, MistralModel[]>;
    private allModels: MistralModel[];
    private bestCandidateByFamily: Map<string, string>;

    private constructor () {
        this.modelsByCapability = new Map();
        this.allModels = [];
        this.bestCandidateByFamily = new Map();
    }

    /**
     * Gets the singleton instance of CapabilityModelStore.
     * @returns The singleton instance.
     */
    public static getInstance (): CapabilityModelStore {
        if ( !CapabilityModelStore._instance ) {
            CapabilityModelStore._instance = new CapabilityModelStore();
        }
        return CapabilityModelStore._instance;
    }



    /**
     * Inserts a model into the store, handling deduplication.
     * @param model The model to insert.
     */
    insertModel ( model: MistralModel ): void {
        const prefix = familyPrefix( model.id );
        const currentBest = this.bestCandidateByFamily.get( prefix );

        // Determine the best candidate for the family.
        const bestCandidate = currentBest ? pickCanonical( [ currentBest, model.id ] ) : model.id;
        this.bestCandidateByFamily.set( prefix, bestCandidate );

        // Skip insertion if this is not the best candidate.
        if ( bestCandidate !== model.id ) {
            return;
        }

        // This model wins its family. If an inferior member was inserted earlier,
        // evict it so the store holds exactly one model per family regardless of
        // insertion order.
        if ( currentBest && currentBest !== model.id ) {
            this.removeById( currentBest );
        }

        // Add the model to the store.
        this.allModels.push( model );

        const capabilities: ( keyof CapabilityModelStore.Capabilities )[] = [
            `toolCalling`,
            `supportsVision`,
            `supportsCompletionFim`,
            `completionChat`,
        ];

        for ( const capability of capabilities ) {
            if ( model[ capability as keyof MistralModel ] ) {
                const models = this.modelsByCapability.get( capability ) ?? [];
                models.push( model );
                this.modelsByCapability.set( capability, models );
            }
        }
    }

    /**
     * Removes a model (by id) from the all-models list and every capability index.
     * @param id The model ID to evict.
     */
    private removeById ( id: string ): void {
        this.allModels = this.allModels.filter( m => {
            return m.id !== id;
        } );
        for ( const [ capability, models ] of this.modelsByCapability ) {
            this.modelsByCapability.set( capability, models.filter( m => {
                return m.id !== id;
            } ) );
        }
    }

    /**
     * Retrieves models that support a specific capability.
     * @param capability The capability to filter by.
     * @returns An array of models that support the capability.
     */
    getModelsByCapability ( capability: keyof CapabilityModelStore.Capabilities ): MistralModel[] {
        return this.modelsByCapability.get( capability ) ?? [];
    }

    /**
     * Retrieves all models in the store.
     * @returns An array of all models.
     */
    getAllModels (): MistralModel[] {
        return this.allModels;
    }

    /**
     * Retrieves models that support chat completion.
     * @returns An array of chat-compatible models.
     */
    getChatModels (): MistralModel[] {
        return this.getModelsByCapability( `completionChat` );
    }

    /**
     * Clears all models from the store.
     */
    clear (): void {
        this.modelsByCapability.clear();
        this.allModels = [];
        this.bestCandidateByFamily.clear();
    }

    /**
     * Retrieves models that support tool calling.
     * @returns An array of models that support tool calling.
     */
    getModelsWithToolCalling (): MistralModel[] {
        return this.getModelsByCapability( `toolCalling` );
    }

    /**
     * Retrieves models that support vision.
     * @returns An array of models that support vision.
     */
    getModelsWithVision (): MistralModel[] {
        return this.getModelsByCapability( `supportsVision` );
    }

    /**
     * Retrieves models that support Fill-in-the-Middle (FIM) completion.
     * @returns An array of models that support FIM completion.
     */
    getModelsWithCompletionFim (): MistralModel[] {
        return this.getModelsByCapability( `supportsCompletionFim` );
    }

}

/**
 * Namespace for CapabilityModelStore types.
 */
export namespace CapabilityModelStore {
    /**
     * Represents the capabilities of a model.
     */
    export interface Capabilities {
        toolCalling: boolean;
        supportsParallelToolCalls: boolean;
        supportsVision: boolean;
        supportsCompletionFim: boolean;
        completionChat: boolean;
    }
}
