export function FindPendingTagLength ( text: string, tag: string ): number {
    const maximumPrefixLength = Math.min( text.length, tag.length - 1 );
    for ( let prefixLength = maximumPrefixLength; prefixLength > 0; prefixLength-- ) {
        if ( text.endsWith( tag.slice( 0, prefixLength ) ) ) {
            return prefixLength;
        }
    }
    return 0;
}
