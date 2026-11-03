import type { MistralModel } from '../types.js';
import type { MistralChatModelInformation } from './mistralChatModelInformation.js';
import { BuildConfigurationSchema } from './modelConfiguration/buildConfigurationSchema.js';

export function proposedModelInfoFields (
    model: MistralModel,
    isDefault: boolean,
): Pick<MistralChatModelInformation, `capabilities` | `isDefault` | `isUserSelectable` | `configurationSchema`> {
    return {
        capabilities: {
            toolCalling: model.toolCalling,
            imageInput: model.supportsVision ?? false,
        },
        isUserSelectable: true,
        isDefault,
        configurationSchema: BuildConfigurationSchema( model ),
    };
}
