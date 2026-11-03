import type { ModelConfigurationProperty } from '../_future_/modelConfiguration/modelConfigurationProperty.js';
import { ContextWindowResolver } from './contextWindowResolver.js';

const INPUT_CONTEXT_PRESETS = [ 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576 ];

export class ContextWindowSchemaBuilder {
    private readonly _resolver = new ContextWindowResolver();

    public Build ( modelInputLimit: number ): ModelConfigurationProperty | undefined {
        const { maxInputTokens } = this._resolver.ResolveSelection( modelInputLimit, undefined );
        const choices = [
            ...INPUT_CONTEXT_PRESETS.filter( preset => {
                return preset < maxInputTokens;
            } ),
            maxInputTokens,
        ];
        if ( choices.length < 2 ) {
            return undefined;
        }
        return {
            type: `integer`,
            title: `Context Size`,
            description: `Maximum input tokens used by VS Code to assemble the conversation. Output capacity is reserved separately.`,
            enum: choices,
            enumItemLabels: choices.map( choice => {
                return `${ choice.toLocaleString( `en-US` ) } tokens`;
            } ),
            enumDescriptions: choices.map( choice => {
                return choice === maxInputTokens
                    ? `Full model input allowance; output capacity is reserved separately.`
                    : `Limit the input context assembled by VS Code.`;
            } ),
            default: maxInputTokens,
            minimum: 1,
            maximum: maxInputTokens,
            group: `tokens`,
        };
    }
}
