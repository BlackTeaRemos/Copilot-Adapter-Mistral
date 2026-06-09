import { LogOutputChannel } from 'vscode';
import { BrowserOpener } from './browserOpener.js';
import { BrowserSignInStatus } from './browserSignInStatus.js';

export interface BrowserSignInDeps {
    log: LogOutputChannel;
    openBrowser: BrowserOpener;
    onStatus?: ( status: BrowserSignInStatus ) => void;
    onAttemptStarted?: ( signInUrl: string, expiresAt: Date ) => void;
    /** Abort signal so the caller (e.g. VSCode progress cancel) can stop polling. */
    signal?: AbortSignal;
    browserBaseUrl?: string;
    apiBaseUrl?: string;
    /** Injectable for tests. */
    sleep?: ( ms: number ) => Promise<void>;
    now?: () => number;
}
