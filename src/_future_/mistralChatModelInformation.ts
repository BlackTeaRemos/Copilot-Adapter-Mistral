import type { LanguageModelChatInformation } from 'vscode';
import type { ModelConfigurationSchema } from './modelConfiguration/modelConfigurationSchema.js';

export interface MistralChatModelInformation extends LanguageModelChatInformation {
    readonly maxContextWindowTokens?: number;
    readonly configurationSchema?: ModelConfigurationSchema;
    readonly isDefault?: boolean;
    readonly isUserSelectable?: boolean;
    readonly pricing?: string;
    readonly priceCategory?: string;
    readonly inputCost?: number;
    readonly outputCost?: number;
    readonly cacheCost?: number;
}
