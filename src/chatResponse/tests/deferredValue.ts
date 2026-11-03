export class DeferredValue<T> {
    public readonly promise: Promise<T>;
    private _resolve!: ( value: T ) => void;

    public constructor () {
        this.promise = new Promise<T>( resolve => {
            this._resolve = resolve;
        } );
    }

    public Resolve ( value: T ): void {
        this._resolve( value );
    }
}
