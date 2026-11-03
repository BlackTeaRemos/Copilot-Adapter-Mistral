import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspace } from 'vscode';
import type { WorkspaceConfiguration } from 'vscode';
import { ReadGlobalTokenSetting } from '../readGlobalTokenSetting.js';
import { ReadCompletionTokenOverride } from '../readCompletionTokenOverride.js';

describe( `output setting resolution`, () => {
    afterEach( () => {
        vi.restoreAllMocks();
    } );

    it( `identifies an inherited extension default separately from an explicit workspace setting`, () => {
        const inspected: { defaultValue: number; workspaceValue?: number } = { defaultValue: 4096 };
        vi.spyOn( workspace, `getConfiguration` ).mockReturnValue( {
            get: () => {
                return inspected.workspaceValue ?? inspected.defaultValue;
            },
            inspect: () => {
                return inspected;
            },
        } as unknown as WorkspaceConfiguration );
        expect( ReadGlobalTokenSetting() ).toEqual( { value: undefined, origin: `automatic maximum` } );
        inspected.workspaceValue = 65536;
        expect( ReadGlobalTokenSetting() ).toEqual( { value: 65536, origin: `workspace setting` } );
    } );

    it( `keeps an explicit 4096 value and distinguishes the setting origin`, () => {
        vi.spyOn( workspace, `getConfiguration` ).mockReturnValue( {
            get: () => {
                return 4096;
            },
            inspect: () => {
                return { defaultValue: 4096, globalValue: 4096 };
            },
        } as unknown as WorkspaceConfiguration );
        expect( ReadGlobalTokenSetting() ).toEqual( { value: 4096, origin: `user setting` } );
    } );

    it( `accepts wire-format tokens without interpreting input context as output`, () => {
        expect( ReadCompletionTokenOverride( { max_tokens: 65536, contextSize: 258048 } ) ).toBe( 65536 );
        expect( ReadCompletionTokenOverride( { contextSize: 258048 } ) ).toBeUndefined();
        expect( ReadCompletionTokenOverride( { maxTokens: 8192, max_tokens: 65536 } ) ).toBe( 8192 );
        expect( ReadCompletionTokenOverride( { maxTokens: null, max_tokens: 65536 } ) ).toBeNull();
    } );
} );
