import { LogOutputChannel } from 'vscode';
import { createMistralClient } from '../client/index.js';

export async function validateApiKey( apiKey: string, log: LogOutputChannel ): Promise<boolean> {
    try {
        const testClient = createMistralClient( apiKey, log );
        await testClient.models.list();
        return true;
    } catch( error ) {
        const statusCode = ( error as { statusCode?: unknown; } ).statusCode;
        if ( statusCode === 401 || statusCode === 403 ) {
            return false;
        }
        return true;
    }
}
