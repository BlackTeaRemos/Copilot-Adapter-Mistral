import type { Mistral } from '@mistralai/mistralai';
import { vi } from 'vitest';
import { fetchModels } from '../../fetchModels.js';
import type { MistralModel } from '../../../types.js';

export class ModelDiscoveryFixture {
    public readonly log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    public readonly list = vi.fn();

    public constructor ( cards: unknown[] ) {
        this.list.mockResolvedValue( { data: cards } );
    }

    public Fetch (): Promise<MistralModel[]> {
        return fetchModels( { models: { list: this.list } } as unknown as Mistral, this.log );
    }
}
