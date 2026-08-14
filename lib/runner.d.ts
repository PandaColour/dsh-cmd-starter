/**
 * Claude-Code style one-shot runner over the official headless profile.
 *
 * Reads the `cmdStartup` service, resolves the session identity (fresh create,
 * exact `--resume`, or latest via `--continue`), runs one task to quiescence,
 * and prints either plain text or a JSON object carrying the session id.
 * @module dsh-cmd-starter
 */
import type { Context } from '@deepseek-ai/cordis';
import { CMD_STARTUP_SERVICE } from './startup.js';
/** Stable Cordis plugin name. */
export declare const name = "cmd-runner";
/** Core services required before the one-shot turn can start. */
export declare const inject: string[];
/** Process-facing effects of one run. */
interface HeadlessIo {
    stdout: {
        write(chunk: string): unknown;
    };
    stderr: {
        write(chunk: string): unknown;
    };
    exit(code: number): void;
}
/** The process streams the runner writes to; tests substitute captures. */
export declare const internals: {
    stdout: HeadlessIo['stdout'];
    stderr: HeadlessIo['stderr'];
};
/** Mount the one-shot direct driver. */
export declare function apply(ctx: Context): void;
export { CMD_STARTUP_SERVICE };
