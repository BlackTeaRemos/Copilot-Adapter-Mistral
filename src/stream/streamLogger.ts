export interface StreamLogger {
    trace ( message: string ): void;
    debug ( message: string ): void;
    info ( message: string ): void;
    warn ( message: string ): void;
}
