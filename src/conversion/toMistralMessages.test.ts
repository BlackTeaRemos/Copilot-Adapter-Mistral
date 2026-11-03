import { CreateUserMessage as userMsg } from '../test/messages/createUserMessage.js';
import { CreateAssistantMessage as assistantMsg } from '../test/messages/createAssistantMessage.js';
import { describe, expect, it } from 'vitest';
import {
    LanguageModelDataPart,
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
} from 'vscode';
import { toMistralMessages } from './toMistralMessages.js';
import { createToolCallIdMap } from './toolCallIdMap.js';





describe( `toMistralMessages`, () => {
    it( `converts plain text user message`, () => {
        const msgs = toMistralMessages( [ userMsg( new LanguageModelTextPart( `Hello` ) ) ], createToolCallIdMap() );
        expect( msgs ).toEqual( [ { role: `user`, content: `Hello` } ] );
    } );

    it( `concatenates multiple text parts`, () => {
        const msgs = toMistralMessages(
            [ userMsg( new LanguageModelTextPart( `Hello` ), new LanguageModelTextPart( ` world` ) ) ],
            createToolCallIdMap(),
        );
        expect( msgs ).toEqual( [ { role: `user`, content: `Hello world` } ] );
    } );

    it( `converts plain text assistant message`, () => {
        const msgs = toMistralMessages( [ assistantMsg( new LanguageModelTextPart( `Hi` ) ) ], createToolCallIdMap() );
        expect( msgs ).toEqual( [ { role: `assistant`, content: `Hi`, toolCalls: undefined } ] );
    } );

    it( `skips empty user message`, () => {
        expect( toMistralMessages( [ userMsg() ], createToolCallIdMap() ) ).toHaveLength( 0 );
    } );

    it( `skips empty assistant message`, () => {
        expect( toMistralMessages( [ assistantMsg() ], createToolCallIdMap() ) ).toHaveLength( 0 );
    } );

    it( `converts assistant tool call - content null, toolCalls populated`, () => {
        const toolCall = new LanguageModelToolCallPart( `vs-1`, `search_files`, { query: `foo` } );
        const msgs = toMistralMessages( [ assistantMsg( toolCall ) ], createToolCallIdMap() );
        const msg = msgs[ 0 ];
        if ( msg.role !== `assistant` ) {
            throw new Error( `Expected an assistant message` );
        }
        expect( msg.role ).toBe( `assistant` );
        expect( msg.content ).toBeNull();
        expect( msg.toolCalls ).toHaveLength( 1 );
        const emittedCall = msg.toolCalls?.[ 0 ];
        if ( !emittedCall ) {
            throw new Error( `Expected a tool call` );
        }
        expect( emittedCall.type ).toBe( `function` );
        expect( emittedCall.function.name ).toBe( `search_files` );
        expect( JSON.parse( emittedCall.function.arguments ) ).toEqual( { query: `foo` } );
    } );

    it( `converts tool result into role="tool" message`, () => {
        const map = createToolCallIdMap();
        const toolCall = new LanguageModelToolCallPart( `vs-2`, `read_file`, { path: `/foo` } );
        const toolResult = new LanguageModelToolResultPart( `vs-2`, [ new LanguageModelTextPart( `file contents` ) ] );
        const msgs = toMistralMessages( [ assistantMsg( toolCall ), userMsg( toolResult ) ], map );
        const toolMsg = msgs.find( ( message ) => {
            return message.role === `tool`;
        } );
        expect( toolMsg ).toBeDefined();
        if ( !toolMsg ) {
            throw new Error( `Expected a tool result message` );
        }
        expect( toolMsg.content ).toBe( `file contents` );
        expect( typeof toolMsg.toolCallId ).toBe( `string` );
    } );

    it( `encodes image as base64 imageUrl chunk`, () => {
        const msgs = toMistralMessages(
            [ userMsg( new LanguageModelDataPart( new Uint8Array( [ 1, 2, 3 ] ), `image/png` ) ) ],
            createToolCallIdMap(),
        );
        const content = msgs[ 0 ].content;
        if ( !Array.isArray( content ) ) {
            throw new Error( `Expected multimodal content` );
        }
        expect( content[ 0 ].type ).toBe( `image_url` );
        if ( content[ 0 ].type !== `image_url` ) {
            throw new Error( `Expected an image chunk` );
        }
        expect( content[ 0 ].imageUrl ).toMatch( /^data:image\/png;base64,/ );
    } );

    it( `drops non-image data parts instead of injecting them into the prompt`, () => {
        const msgs = toMistralMessages(
            [ userMsg( new LanguageModelDataPart( new Uint8Array( [ 0 ] ), `application/pdf` ) ) ],
            createToolCallIdMap(),
        );
        const serialized = JSON.stringify( msgs );
        expect( serialized ).not.toContain( `data:` );
        expect( serialized ).not.toContain( `application/pdf` );
    } );

    it( `multimodal message includes text chunk then image chunk`, () => {
        const msgs = toMistralMessages(
            [ userMsg( new LanguageModelTextPart( `Look:` ), new LanguageModelDataPart( new Uint8Array( [ 9 ] ), `image/jpeg` ) ) ],
            createToolCallIdMap(),
        );
        const content = msgs[ 0 ].content;
        if ( !Array.isArray( content ) ) {
            throw new Error( `Expected multimodal content` );
        }
        expect( content[ 0 ] ).toEqual( { type: `text`, text: `Look:` } );
        expect( content[ 1 ].type ).toBe( `image_url` );
    } );

    it( `assistant with text + tool call keeps both`, () => {
        const toolCall = new LanguageModelToolCallPart( `vs-4`, `fn`, {} );
        const msgs = toMistralMessages( [ assistantMsg( new LanguageModelTextPart( `thinking...` ), toolCall ) ], createToolCallIdMap() );
        const msg = msgs[ 0 ];
        if ( msg.role !== `assistant` ) {
            throw new Error( `Expected an assistant message` );
        }
        expect( msg.content ).toBe( `thinking...` );
        expect( msg.toolCalls ).toHaveLength( 1 );
    } );

    it( `multiple tool results become separate role="tool" messages`, () => {
        const map = createToolCallIdMap();
        const tc1 = new LanguageModelToolCallPart( `id-1`, `fn1`, {} );
        const tc2 = new LanguageModelToolCallPart( `id-2`, `fn2`, {} );
        const tr1 = new LanguageModelToolResultPart( `id-1`, [ new LanguageModelTextPart( `r1` ) ] );
        const tr2 = new LanguageModelToolResultPart( `id-2`, [ new LanguageModelTextPart( `r2` ) ] );
        const msgs = toMistralMessages( [ assistantMsg( tc1, tc2 ), userMsg( tr1, tr2 ) ], map );
        expect( msgs.filter( ( message ) => {
            return message.role === `tool`;
        } ) ).toHaveLength( 2 );
    } );

    it( `empty messages array returns empty array`, () => {
        expect( toMistralMessages( [], createToolCallIdMap() ) ).toEqual( [] );
    } );
} );
