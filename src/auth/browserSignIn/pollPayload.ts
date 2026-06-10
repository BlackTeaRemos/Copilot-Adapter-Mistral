export interface PollPayload {
    status?: `pending` | `completed` | `expired` | `denied` | `error`;
    exchange_token?: string;
    message?: string;
    /** Server-requested wait before the next poll, parsed from Retry-After. */
    retryAfterMs?: number;
}
