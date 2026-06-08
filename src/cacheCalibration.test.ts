import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenizerCalibration } from './cacheCalibration.js';

function makeCtx ( stored: Record<string, unknown> = {} ) {
    const store: Record<string, unknown> = { 'mistral.tokenizerCalibration.v1': stored };
    return {
        globalState: {
            get: vi.fn( ( key: string, def: unknown ) => store[ key ] ?? def ),
            update: vi.fn( ( key: string, val: unknown ) => { store[ key ] = val; return Promise.resolve(); } ),
        },
        _store: store,
    } as any;
}

describe( 'TokenizerCalibration', () => {
    let ctx: any;
    let cal: TokenizerCalibration;

    beforeEach( () => {
        ctx = makeCtx();
        cal = new TokenizerCalibration( ctx );
    } );

    it( 'starts with zero samples and no scale', () => {
        expect( cal.sampleCount( 'm' ) ).toBe( 0 );
        expect( cal.scale( 'm' ) ).toBeUndefined();
        expect( cal.confidenceLevel( 'm' ) ).toBe( 0 );
    } );

    it( 'ignores non-positive samples', () => {
        cal.record( 'm', 0, 100 );
        cal.record( 'm', 100, 0 );
        cal.record( 'm', -5, 100 );
        expect( cal.sampleCount( 'm' ) ).toBe( 0 );
    } );

    it( 'tracks a running mean of the token ratio', () => {
        // ratio is constant 1.2 → mean converges to 1.2.
        for ( let i = 0; i < 30; i++ ) { cal.record( 'm', 120, 100 ); }
        expect( cal.sampleCount( 'm' ) ).toBe( 30 );
        expect( cal.scale( 'm' ) ).toBeCloseTo( 1.2, 5 );
    } );

    it( 'withholds the scale until confidence passes the threshold', () => {
        cal.record( 'm', 120, 100 );
        // One sample → confidence below MIN_CONF, scale hidden.
        expect( cal.scale( 'm' ) ).toBeUndefined();
        expect( cal.confidenceLevel( 'm' ) ).toBeGreaterThan( 0 );
    } );

    it( 'persists each recorded sample to globalState', () => {
        cal.record( 'm', 120, 100 );
        expect( ctx.globalState.update ).toHaveBeenCalled();
        const saved = ctx._store[ 'mistral.tokenizerCalibration.v1' ];
        expect( saved.m.n ).toBe( 1 );
    } );

    it( 'rehydrates prior samples from globalState', () => {
        cal.record( 'm', 120, 100 );
        const reloaded = new TokenizerCalibration( ctx );
        expect( reloaded.sampleCount( 'm' ) ).toBe( 1 );
    } );

    it( 'keeps per-model state independent', () => {
        for ( let i = 0; i < 5; i++ ) { cal.record( 'a', 120, 100 ); }
        expect( cal.sampleCount( 'a' ) ).toBe( 5 );
        expect( cal.sampleCount( 'b' ) ).toBe( 0 );
    } );
} );
