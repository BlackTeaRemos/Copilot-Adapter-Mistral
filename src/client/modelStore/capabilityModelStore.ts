import type { MistralModel } from '../../types.js';
import type { ModelCapabilities } from './modelCapabilities.js';

export class CapabilityModelStore {
    private static _instance: CapabilityModelStore | undefined;
    private readonly _models = new Map<string, MistralModel>();

    private constructor () {
        return;
    }

    public static getInstance (): CapabilityModelStore {
        CapabilityModelStore._instance ??= new CapabilityModelStore();
        return CapabilityModelStore._instance;
    }

    public insertModel ( model: MistralModel ): void {
        this._models.set( model.id, model );
    }

    public getModelsByCapability ( capability: keyof ModelCapabilities ): MistralModel[] {
        return this.getAllModels().filter( model => {
            return Boolean( model[ capability ] );
        } );
    }

    public getAllModels (): MistralModel[] {
        return [ ...this._models.values() ];
    }

    public getChatModels (): MistralModel[] {
        return this.getModelsByCapability( `completionChat` );
    }

    public clear (): void {
        this._models.clear();
    }

    public getModelsWithToolCalling (): MistralModel[] {
        return this.getModelsByCapability( `toolCalling` );
    }

    public getModelsWithVision (): MistralModel[] {
        return this.getModelsByCapability( `supportsVision` );
    }

    public getModelsWithCompletionFim (): MistralModel[] {
        return this.getModelsByCapability( `supportsCompletionFim` );
    }
}
