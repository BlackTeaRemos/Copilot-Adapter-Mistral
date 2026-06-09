export const DEFAULT_BROWSER_AUTH_BASE_URL = `https://console.mistral.ai`;
export const DEFAULT_BROWSER_AUTH_API_BASE_URL = `https://console.mistral.ai/api`;

export const POLL_INTERVAL_MS = 3000;
export const MAX_CONSECUTIVE_POLL_FAILURES = 3;
/** Backoff base for transient poll failures; grows 1.5s, 3s, … and is capped. */
export const POLL_BACKOFF_BASE_MS = 1500;
export const POLL_BACKOFF_MAX_MS = 10_000;
/** Allow for client/server clock skew when judging expiry. */
export const CLOCK_SKEW_TOLERANCE_MS = 5000;
export const HTTP_GONE = 410;
export const HTTP_TOO_MANY_REQUESTS = 429;
