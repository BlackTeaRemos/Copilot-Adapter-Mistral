export type BrowserSignInErrorCode =
    | `start_failed`
    | `poll_failed`
    | `unknown_state`
    | `exchange_failed`
    | `missing_api_key`
    | `missing_exchange_token`
    | `expired`
    | `denied`
    | `provider_error`
    | `timed_out`
    | `open_browser_failed`
    | `invalid_url`;
