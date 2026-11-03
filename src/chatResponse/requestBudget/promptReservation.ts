export interface PromptReservation {
    readonly tokens: number;
    readonly source: `estimated prompt` | `selected input allowance`;
}
