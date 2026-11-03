import type { BaseModelCard } from '@mistralai/mistralai/models/components';

export function CreateAuthoredModelCards (): BaseModelCard[] {
    const definitions = [
        { id: `mistral-large-4`, name: `Mistral Large 4`, context: 1000000, vision: true, owner: `mistralai` },
        { id: `mistral-medium-3-5`, name: `Mistral Medium 3.5`, context: 256000, vision: true, owner: `mistralai` },
        { id: `mistral-small-2603`, name: `Mistral Small 4`, context: 256000, vision: true, owner: `mistralai` },
        { id: `zai-glm-5-3`, name: `Z.ai GLM 5.3`, context: 1000000, vision: false, owner: `z-ai` },
        { id: `zai-glm-5-3-flash`, name: `Z.ai GLM 5.3 Flash`, context: 1000000, vision: true, owner: `z-ai` },
    ];
    return definitions.map( definition => {
        return {
            id: definition.id,
            object: `model`,
            ownedBy: definition.owner,
            internal: false,
            capabilities: {
                completionChat: true,
                functionCalling: true,
                reasoning: false,
                completionFim: false,
                fineTuning: false,
                vision: definition.vision,
                ocr: false,
                classification: false,
                moderation: false,
                audio: false,
                audioTranscription: false,
                audioTranscriptionRealtime: false,
                audioSpeech: false,
                unifiedResources: false,
            },
            name: definition.name,
            maxContextLength: definition.context,
            aliases: [],
            type: `base`,
        };
    } );
}
