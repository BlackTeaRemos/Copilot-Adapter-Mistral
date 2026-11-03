import type { Mistral } from '@mistralai/mistralai';
import { describe, expect, it, vi } from 'vitest';
import { fetchModels } from '../../client/fetchModels.js';
import { getChatModelInfo } from '../../conversion/modelInformation/getChatModelInfo.js';

describe( `discovered context metadata`, () => {
    it( `reserves output inside the API context window and exposes native selections`, async () => {
        const client = {
            models: { list: vi.fn().mockResolvedValue( { data: [ {
                id: `mistral-large-latest`, type: `base`, name: `Mistral Large`,
                maxContextLength: 128000,
                capabilities: { completionChat: true, functionCalling: true },
            } ] } ) },
        } as unknown as Mistral;
        const log = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
        const models = await fetchModels( client, log );
        const model = models.find( candidate => {
            return candidate.id === `mistral-large-latest`;
        } );
        expect( model ).toBeDefined();
        if ( !model ) {
            throw new Error( `Expected the discovered model` );
        }
        expect( model.maxContextWindowTokens ).toBe( 128000 );
        expect( model.maxInputTokens ).toBe( 123904 );
        expect( model.maxOutputTokens ).toBe( 127999 );
        const information = getChatModelInfo( model );
        expect( information.configurationSchema?.properties.contextSize.enum ).toEqual( [ 8192, 16384, 32768, 65536, 123904 ] );
        expect( models.some( candidate => {
            return candidate.id === `zai-glm-5-3`;
        } ) ).toBe( true );
    } );
} );
