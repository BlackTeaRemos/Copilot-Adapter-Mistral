import type { ExtensionContext } from 'vscode';
import { describe, expect, it, vi } from 'vitest';
import { TokenizerCalibration } from '../../cacheCalibration.js';

describe( `calibration persistence identifiers`, () => {
    it( `preserves a model named __proto__ without changing the stored object's prototype`, () => {
        const update = vi.fn().mockResolvedValue( undefined );
        const context = {
            globalState: { get: vi.fn().mockReturnValue( {} ), update },
        } as unknown as ExtensionContext;
        const calibration = new TokenizerCalibration( context );
        calibration.record( `__proto__`, 120, 100 );
        const stored = update.mock.calls[ 0 ][ 1 ];
        expect( Object.hasOwn( stored, `__proto__` ) ).toBe( true );
        expect( Object.getPrototypeOf( stored ) ).toBe( Object.prototype );
        expect( JSON.parse( JSON.stringify( stored ) )[ `__proto__` ].n ).toBe( 1 );
    } );
} );
