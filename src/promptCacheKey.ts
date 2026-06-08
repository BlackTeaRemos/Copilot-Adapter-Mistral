import { createHash } from 'crypto';
import type { MistralMessage } from './types.js';

/**
 * Derives a stable `prompt_cache_key` for a conversation.
 *
 * Keyed off the durable conversation prefix — the model id, all system messages,
 * and the first user message — so every turn of the same conversation reuses the
 * same key while distinct conversations get distinct keys. Mistral does the
 * actual prefix matching; a stable key only raises the cache-hit probability.
 */
export function computePromptCacheKey( modelId: string, messages: readonly MistralMessage[] ): string {
    const contentToText = ( c: MistralMessage[ `content` ] ): string => {
        return typeof c === `string` ? c
            : Array.isArray( c ) ? c.map( p => {
                return ( p.type === `text` ? p.text : `[img]` );
            } ).join( `` )
                : ``;
    };
    const parts: string[] = [modelId];
    for ( const m of messages ) {
        if ( m.role === `system` ) {
            parts.push( `S:` + contentToText( m.content ) );
        }
    }
    const firstUser = messages.find( m => {
        return m.role === `user`;
    } );
    if ( firstUser ) {
        parts.push( `U:` + contentToText( firstUser.content ) );
    }
    return `vscode-` + createHash( `sha256` ).update( parts.join( ` ` ) ).digest( `hex` ).slice( 0, 32 );
}
