import { describe, expect, it } from 'vitest';
import {
    createToolCallIdMap,
    generateToolCallId,
    getOrCreateVsCodeToolCallId,
    getOrCreateMistralToolCallId,
    getMistralToolCallId,
} from './toolCallIdMap.js';

describe( 'generateToolCallId', () => {
    it( 'returns 9-char alphanumeric string', () => {
        expect( generateToolCallId() ).toMatch( /^[a-zA-Z0-9]{9}$/ );
    } );

    it( 'produces unique IDs', () => {
        const ids = new Set( Array.from( { length: 100 }, generateToolCallId ) );
        expect( ids.size ).toBe( 100 );
    } );
} );

describe( 'getOrCreateVsCodeToolCallId', () => {
    it( 'returns 9-char alphanumeric for new mistral ID', () => {
        const map = createToolCallIdMap();
        expect( getOrCreateVsCodeToolCallId( map, 'mistral-abc' ) ).toMatch( /^[a-zA-Z0-9]{9}$/ );
    } );

    it( 'idempotent — same mistral ID returns same vsCode ID', () => {
        const map = createToolCallIdMap();
        const a = getOrCreateVsCodeToolCallId( map, 'mistral-abc' );
        const b = getOrCreateVsCodeToolCallId( map, 'mistral-abc' );
        expect( a ).toBe( b );
    } );

    it( 'distinct mistral IDs get distinct vsCode IDs', () => {
        const map = createToolCallIdMap();
        const a = getOrCreateVsCodeToolCallId( map, 'mistral-aaa' );
        const b = getOrCreateVsCodeToolCallId( map, 'mistral-bbb' );
        expect( a ).not.toBe( b );
    } );

    it( 'registers bidirectional mapping', () => {
        const map = createToolCallIdMap();
        const vsCodeId = getOrCreateVsCodeToolCallId( map, 'mistral-xyz' );
        expect( getMistralToolCallId( map, vsCodeId ) ).toBe( 'mistral-xyz' );
    } );
} );

describe( 'getOrCreateMistralToolCallId', () => {
    it( 'creates new mistral ID for unknown vsCode ID', () => {
        const map = createToolCallIdMap();
        const id = getOrCreateMistralToolCallId( map, 'vs-123' );
        expect( id ).toMatch( /^[a-zA-Z0-9]{9}$/ );
    } );

    it( 'returns existing mistral ID on repeated call', () => {
        const map = createToolCallIdMap();
        const a = getOrCreateMistralToolCallId( map, 'vs-123' );
        const b = getOrCreateMistralToolCallId( map, 'vs-123' );
        expect( a ).toBe( b );
    } );
} );

describe( 'getMistralToolCallId', () => {
    it( 'returns undefined for unknown vsCode ID', () => {
        expect( getMistralToolCallId( createToolCallIdMap(), 'unknown' ) ).toBeUndefined();
    } );

    it( 'returns undefined for empty string', () => {
        expect( getMistralToolCallId( createToolCallIdMap(), '' ) ).toBeUndefined();
    } );
} );

describe( 'createToolCallIdMap — clear by recreation', () => {
    it( 'fresh map has no entries', () => {
        const map = createToolCallIdMap();
        getOrCreateVsCodeToolCallId( map, 'mistral-x' );
        const fresh = createToolCallIdMap();
        expect( getMistralToolCallId( fresh, 'any' ) ).toBeUndefined();
    } );
} );
