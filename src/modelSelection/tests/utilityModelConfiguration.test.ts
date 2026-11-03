import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionContext, LogOutputChannel, WorkspaceConfiguration } from 'vscode';
import { window, workspace } from 'vscode';
import { PromptConfigureUtilityModels } from '../../extensionLifecycle/promptConfigureUtilityModels.js';
import { CreateSelectionModel } from './createSelectionModel.js';

describe( `utility model configuration with public aliases`, () => {
    afterEach( () => {
        vi.restoreAllMocks();
    } );

    it( `writes fetched canonical IDs into both existing VS Code utility slots`, async () => {
        const update = vi.fn().mockResolvedValue( undefined );
        vi.spyOn( workspace, `getConfiguration` ).mockReturnValue( {
            get: vi.fn().mockReturnValue( undefined ), update,
        } as unknown as WorkspaceConfiguration );
        vi.mocked( window.showInformationMessage ).mockResolvedValue( `Configure` as never );
        const context = {
            globalState: { get: vi.fn().mockReturnValue( false ), update: vi.fn().mockResolvedValue( undefined ) },
        } as unknown as ExtensionContext;
        const log = { info: vi.fn() } as unknown as LogOutputChannel;
        const provider = { fetchModels: vi.fn().mockResolvedValue( [
            CreateSelectionModel( `large-deployment`, { aliases: [ `mistral-large-4` ] } ),
            CreateSelectionModel( `small-deployment`, { aliases: [ `mistral-small-2603` ] } ),
        ] ) };
        await PromptConfigureUtilityModels( context, log, provider );
        expect( update ).toHaveBeenCalledWith( `utilityModel`, `mistral/large-deployment`, expect.any( Number ) );
        expect( update ).toHaveBeenCalledWith( `utilitySmallModel`, `mistral/small-deployment`, expect.any( Number ) );
    } );
} );
