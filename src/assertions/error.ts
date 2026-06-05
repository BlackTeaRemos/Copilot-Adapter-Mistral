export type ErrorLike = {
    statusCode?: number;
    name?: string;
    message?: string;
};

export function isErrorLike ( val: unknown ): val is ErrorLike {
    return typeof val === 'object' && val !== null;
}

export function getStatusCode ( error: unknown ): number | undefined {
    if ( !isErrorLike( error ) ) { return undefined; }
    const code = ( error as Record<string, unknown> )[ 'statusCode' ];
    return typeof code === 'number' ? code : undefined;
}

export function getErrorName ( error: unknown ): string | undefined {
    if ( !isErrorLike( error ) ) { return undefined; }
    const name = ( error as Record<string, unknown> )[ 'name' ];
    return typeof name === 'string' ? name : undefined;
}

export function getErrorMessage ( error: unknown ): string | undefined {
    if ( !isErrorLike( error ) ) { return undefined; }
    const msg = ( error as Record<string, unknown> )[ 'message' ];
    return typeof msg === 'string' ? msg : undefined;
}
