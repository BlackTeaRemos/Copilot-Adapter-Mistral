export function toJsonObject( parsed: unknown ): Record<string, unknown> {
    return ( parsed !== null && typeof parsed === `object` && !Array.isArray( parsed ) )
        ? ( parsed as Record<string, unknown> )
        : { value: parsed };
}
