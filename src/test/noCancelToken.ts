import type { CancellationToken } from 'vscode';
import { vi } from 'vitest';

export const NO_CANCEL_TOKEN: CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: vi.fn().mockReturnValue( { dispose: vi.fn() } ),
};
