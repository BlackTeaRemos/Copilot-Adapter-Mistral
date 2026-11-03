export interface IncomingToolCallDelta {
    id?: string;
    index?: number;
    function?: {
        name?: string;
        arguments?: string | Record<string, unknown>;
    };
}
