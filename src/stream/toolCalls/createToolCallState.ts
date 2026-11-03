import type { ToolCallState } from './toolCallState.js';

export function createToolCallState (): ToolCallState {
    return { buffers: new Map(), emitted: new Set(), idsByIndex: new Map() };
}
