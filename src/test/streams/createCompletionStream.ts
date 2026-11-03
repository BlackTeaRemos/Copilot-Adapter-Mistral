import type { CompletionEvent, CompletionResponseStreamChoice, ToolCall, UsageInfo } from '@mistralai/mistralai/models/components';

export function CreateCompletionStream ( ...chunks: { content?: string; toolCalls?: ToolCall[]; finishReason?: CompletionResponseStreamChoice[ `finishReason` ]; usage?: UsageInfo }[] ): AsyncIterable<CompletionEvent> {
    return ( async function* () {
        for ( const chunk of chunks ) {
            yield { data: { id: `test-completion`, model: `test-model`, usage: chunk.usage, choices: [ { index: 0, delta: { content: chunk.content ?? ``, toolCalls: chunk.toolCalls }, finishReason: chunk.finishReason ?? null } ] } };
        }
    } )();
}
