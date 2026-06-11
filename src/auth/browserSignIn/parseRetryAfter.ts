/**
 * Parse a Retry-After header (delta-seconds or HTTP-date) into milliseconds.
 * Returns undefined when absent or unparseable so callers fall back to the
 * default poll interval.
 */
export function parseRetryAfter ( response: Response, now: () => number ): number | undefined {
    const header = response.headers?.get?.( `retry-after` );
    if ( !header ) {
        return undefined;
    }
    const seconds = Number( header );
    if ( Number.isFinite( seconds ) ) {
        return seconds > 0 ? seconds * 1000 : undefined;
    }
    const dateMs = Date.parse( header );
    if ( Number.isNaN( dateMs ) ) {
        return undefined;
    }
    const delta = dateMs - now();
    return delta > 0 ? delta : undefined;
}
