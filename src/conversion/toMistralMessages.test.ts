import { describe, expect, it } from 'vitest';
import {
    LanguageModelChatMessageRole,
    LanguageModelDataPart,
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
} from 'vscode';
import { toMistralMessages } from './toMistralMessages.js';
import { createToolCallIdMap } from './toolCallIdMap.js';

function userMsg ( ...parts: any[] ) {
    return { role: LanguageModelChatMessageRole.User, content: parts, name: '' };
}
function assistantMsg ( ...parts: any[] ) {
    return { role: LanguageModelChatMessageRole.Assistant, content: parts, name: '' };
}
function freshMap () { return createToolCallIdMap(); }

describe( 'toMistralMessages', () => {
    it( 'converts plain text user message', () => {
        const msgs = toMistralMessages( [ userMsg( new LanguageModelTextPart( 'Hello' ) ) ], freshMap() );
        expect( msgs ).toEqual( [ { role: 'user', content: 'Hello' } ] );
    } );

    it( 'concatenates multiple text parts', () => {
        const msgs = toMistralMessages(
            [ userMsg( new LanguageModelTextPart( 'Hello' ), new LanguageModelTextPart( ' world' ) ) ],
            freshMap(),
        );
        expect( msgs ).toEqual( [ { role: 'user', content: 'Hello world' } ] );
    } );

    it( 'converts plain text assistant message', () => {
        const msgs = toMistralMessages( [ assistantMsg( new LanguageModelTextPart( 'Hi' ) ) ], freshMap() );
        expect( msgs ).toEqual( [ { role: 'assistant', content: 'Hi', toolCalls: undefined } ] );
    } );

    it( 'skips empty user message', () => {
        expect( toMistralMessages( [ userMsg() ], freshMap() ) ).toHaveLength( 0 );
    } );

    it( 'skips empty assistant message', () => {
        expect( toMistralMessages( [ assistantMsg() ], freshMap() ) ).toHaveLength( 0 );
    } );

    it( 'converts assistant tool call — content null, toolCalls populated', () => {
        const toolCall = new LanguageModelToolCallPart( 'vs-1', 'search_files', { query: 'foo' } );
        const msgs = toMistralMessages( [ assistantMsg( toolCall ) ], freshMap() );
        const msg = msgs[ 0 ] as any;
        expect( msg.role ).toBe( 'assistant' );
        expect( msg.content ).toBeNull();
        expect( msg.toolCalls ).toHaveLength( 1 );
        expect( msg.toolCalls[ 0 ].type ).toBe( 'function' );
        expect( msg.toolCalls[ 0 ].function.name ).toBe( 'search_files' );
        expect( JSON.parse( msg.toolCalls[ 0 ].function.arguments ) ).toEqual( { query: 'foo' } );
    } );

    it( 'converts tool result into role="tool" message', () => {
        const map = freshMap();
        const toolCall = new LanguageModelToolCallPart( 'vs-2', 'read_file', { path: '/foo' } );
        const toolResult = new LanguageModelToolResultPart( 'vs-2', [ new LanguageModelTextPart( 'file contents' ) ] );
        const msgs = toMistralMessages( [ assistantMsg( toolCall ), userMsg( toolResult ) ], map );
        const toolMsg = msgs.find( ( m: any ) => m.role === 'tool' ) as any;
        expect( toolMsg ).toBeDefined();
        expect( toolMsg.content ).toBe( 'file contents' );
        expect( typeof toolMsg.toolCallId ).toBe( 'string' );
    } );

    it( 'encodes image as base64 imageUrl chunk', () => {
        const msgs = toMistralMessages(
            [ userMsg( new LanguageModelDataPart( new Uint8Array( [ 1, 2, 3 ] ), 'image/png' ) ) ],
            freshMap(),
        );
        const content = ( msgs[ 0 ] as any ).content as any[];
        expect( content[ 0 ].type ).toBe( 'image_url' );
        expect( content[ 0 ].imageUrl ).toMatch( /^data:image\/png;base64,/ );
    } );

    it( 'stringifies non-image data part as text placeholder', () => {
        const msgs = toMistralMessages(
            [ userMsg( new LanguageModelDataPart( new Uint8Array( [ 0 ] ), 'application/pdf' ) ) ],
            freshMap(),
        );
        expect( ( msgs[ 0 ] as any ).content ).toBe( '[data:application/pdf]' );
    } );

    it( 'multimodal message includes text chunk then image chunk', () => {
        const msgs = toMistralMessages(
            [ userMsg( new LanguageModelTextPart( 'Look:' ), new LanguageModelDataPart( new Uint8Array( [ 9 ] ), 'image/jpeg' ) ) ],
            freshMap(),
        );
        const content = ( msgs[ 0 ] as any ).content as any[];
        expect( content[ 0 ] ).toEqual( { type: 'text', text: 'Look:' } );
        expect( content[ 1 ].type ).toBe( 'image_url' );
    } );

    it( 'assistant with text + tool call keeps both', () => {
        const toolCall = new LanguageModelToolCallPart( 'vs-4', 'fn', {} );
        const msgs = toMistralMessages( [ assistantMsg( new LanguageModelTextPart( 'thinking...' ), toolCall ) ], freshMap() );
        const msg = msgs[ 0 ] as any;
        expect( msg.content ).toBe( 'thinking...' );
        expect( msg.toolCalls ).toHaveLength( 1 );
    } );

    it( 'multiple tool results become separate role="tool" messages', () => {
        const map = freshMap();
        const tc1 = new LanguageModelToolCallPart( 'id-1', 'fn1', {} );
        const tc2 = new LanguageModelToolCallPart( 'id-2', 'fn2', {} );
        const tr1 = new LanguageModelToolResultPart( 'id-1', [ new LanguageModelTextPart( 'r1' ) ] );
        const tr2 = new LanguageModelToolResultPart( 'id-2', [ new LanguageModelTextPart( 'r2' ) ] );
        const msgs = toMistralMessages( [ assistantMsg( tc1, tc2 ), userMsg( tr1, tr2 ) ], map );
        expect( msgs.filter( ( m: any ) => m.role === 'tool' ) ).toHaveLength( 2 );
    } );

    it( 'empty messages array returns empty array', () => {
        expect( toMistralMessages( [], freshMap() ) ).toEqual( [] );
    } );
} );
