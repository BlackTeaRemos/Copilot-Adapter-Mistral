import type { ChatCompletionStreamRequest } from '@mistralai/mistralai/models/components';

export function assertChatStreamRequest ( req: unknown ): asserts req is ChatCompletionStreamRequest {
    if ( typeof req !== 'object' || req === null ) {
        throw new TypeError( '[Mistral] request must be an object' );
    }
    const r = req as Record<string, unknown>;
    if ( typeof r[ 'model' ] !== 'string' || !r[ 'model' ] ) {
        throw new TypeError( '[Mistral] request.model must be a non-empty string' );
    }
    if ( !Array.isArray( r[ 'messages' ] ) ) {
        throw new TypeError( '[Mistral] request.messages must be an array' );
    }
}
