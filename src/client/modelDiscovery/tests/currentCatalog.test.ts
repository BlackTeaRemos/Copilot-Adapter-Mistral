import { describe, expect, it } from 'vitest';
import { ModelDiscoveryFixture } from './modelDiscoveryFixture.js';

describe( `current public model provisioning`, () => {
    it( `provisions current defaults without the deprecated GLM 5.2 fallback`, async () => {
        const models = await new ModelDiscoveryFixture( [] ).Fetch();
        expect( models.map( model => {
            return model.id;
        } ) ).toEqual( [
            `mistral-large-4`, `mistral-medium-3-5`, `mistral-small-2603`, `zai-glm-5-3`, `zai-glm-5-3-flash`,
        ] );
        expect( models.find( model => {
            return model.id === `zai-glm-5-3`;
        } )?.maxOutputTokens ).toBe( 128000 );
    } );

    it( `preserves API naming, aliases, lifecycle metadata and context capacity`, async () => {
        const models = await new ModelDiscoveryFixture( [ {
            id: `mistral-medium-3-5`, type: `base`, name: `Mistral Medium 3.5`,
            maxContextLength: 262144, aliases: [ `mistral-medium-latest`, `mistral-vibe-cli-with-tools` ],
            deprecation: new Date( `2027-01-01T00:00:00Z` ), deprecationReplacementModel: `replacement`,
            capabilities: { completionChat: true, functionCalling: true, vision: true },
        } ] ).Fetch();
        const current = models.find( model => {
            return model.id === `mistral-medium-3-5`;
        } );
        expect( current?.name ).toBe( `Mistral Medium 3.5` );
        expect( current?.aliases ).toContain( `mistral-vibe-cli-with-tools` );
        expect( current?.maxContextWindowTokens ).toBe( 262144 );
        expect( current?.deprecationDate ).toBe( `2027-01-01T00:00:00.000Z` );
        expect( current?.deprecationReplacementModel ).toBe( `replacement` );
    } );

    it( `lets an API-declared public alias replace a provisioned card`, async () => {
        const models = await new ModelDiscoveryFixture( [ {
            id: `large-4-deployment`, type: `base`, name: `Mistral Large 4`,
            maxContextLength: 1048576, aliases: [ `mistral-large-4` ],
            capabilities: { completionChat: true, functionCalling: false, vision: false },
        } ] ).Fetch();
        expect( models.some( model => {
            return model.id === `mistral-large-4`;
        } ) ).toBe( false );
        expect( models.find( model => {
            return model.id === `large-4-deployment`;
        } ) ).toMatchObject( {
            catalogSource: `api`, maxContextWindowTokens: 1048576,
            toolCalling: false, supportsVision: false,
        } );
    } );

    it( `does not publish transcription-only cards as chat models`, async () => {
        const models = await new ModelDiscoveryFixture( [ {
            id: `voxtral-small-transcribe-3-0`, type: `base`, maxContextLength: 32768,
            capabilities: { completionChat: false, audioTranscription: true },
        } ] ).Fetch();
        expect( models.some( model => {
            return model.id === `voxtral-small-transcribe-3-0`;
        } ) ).toBe( false );
    } );

    it( `bounds an unknown Vibe output maximum by shared context rather than a 4096-token fallback`, async () => {
        const models = await new ModelDiscoveryFixture( [ {
            id: `mistral-vibe-cli-with-tools`, type: `base`, maxContextLength: 256000,
            capabilities: { completionChat: true, functionCalling: true },
        } ] ).Fetch();
        expect( models.find( model => {
            return model.id === `mistral-vibe-cli-with-tools`;
        } )?.outputLimitSource ).toBe( `context window` );
    } );
} );
