import { vi } from 'vitest';
import type { IndexEntry } from '../codebaseIndex.js';

export function CreateFakeSearchIndex ( results: { entry: IndexEntry; score: number; }[], state: `ready` | `empty` = `ready` ) {
    return {
        search: vi.fn().mockResolvedValue( results ),
        load: vi.fn().mockResolvedValue( undefined ),
        getState: vi.fn().mockReturnValue( state ),
        build: vi.fn().mockResolvedValue( { total: 0, embedded: 0, reused: 0 } ),
    };
}
