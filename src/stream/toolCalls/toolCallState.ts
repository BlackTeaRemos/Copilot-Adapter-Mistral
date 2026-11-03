import type { ToolCallBuffer } from '../../types.js';

export interface ToolCallState {
    buffers: Map<string, ToolCallBuffer>;
    emitted: Set<string>;
    idsByIndex: Map<number, string>;
}
