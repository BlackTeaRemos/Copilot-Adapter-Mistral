export function formatModelName ( id: string ): string {
    return id
        .split( `-` )
        .filter( word => {
            return !/^\d{4}$/.test( word ) && word.toLowerCase() !== `latest`;
        } )
        .map( word => {
            return word.charAt( 0 ).toUpperCase() + word.slice( 1 );
        } )
        .join( ` ` );
}
