import type { ContentDeltaState } from './content/contentDeltaState.js';
import type { ToolCallState } from './toolCalls/toolCallState.js';
import type { ToolCallIdMap, UsageStats } from '../types.js';

export interface StreamContext {
    contentState: ContentDeltaState;
    toolCallState: ToolCallState;
    map: ToolCallIdMap;
    usage: UsageStats;
    servedModel?: string;
    truncated?: boolean;
    finishReason?: string;
    failureReason?: string;
}
