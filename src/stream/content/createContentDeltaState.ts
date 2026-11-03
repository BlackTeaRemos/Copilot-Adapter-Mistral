import type { ContentDeltaState } from './contentDeltaState.js';

export function createContentDeltaState (): ContentDeltaState {
    return { thinkDepth: 0, pendingText: `` };
}
