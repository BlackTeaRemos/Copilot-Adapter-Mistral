export function ReadModelConfiguration ( options: unknown ): Record<string, unknown> | undefined {
    return ( options as { modelConfiguration?: Record<string, unknown> } ).modelConfiguration;
}
