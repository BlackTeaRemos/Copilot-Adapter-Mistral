import { PollStatus } from './pollStatus.js';

export interface PollPayload {
    status?: PollStatus;
    exchange_token?: string;
    message?: string;
    /** Server-requested wait before the next poll, parsed from Retry-After. */
    retryAfterMs?: number;
}
