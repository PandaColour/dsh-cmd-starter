/**
 * Claude-Code style command-line intake for the headless profile.
 *
 * Parses the task positional plus scheduling flags, then publishes a single
 * `cmdStartup` service the runner row consumes. The launcher provides
 * `ctx.cmdlineArgs` (the invocation's inner arguments) and `ctx.appExit`
 * (bounded exit request); `parseCmdline` runs this command's action on a
 * successful parse.
 * @module dsh-cmd-starter/startup
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "cmd-startup";
/** Services required before the invocation can be parsed. */
export declare const inject: string[];
/** Service name the runner row injects. */
export declare const CMD_STARTUP_SERVICE = "cmdStartup";
/** What the runner reads from {@link CMD_STARTUP_SERVICE}. */
export interface CmdStartupValues {
    /** The task text this invocation asked for. */
    task: string;
    /** Extra system-prompt text appended for THIS run only (repeatable). */
    appendPrompts: string[];
    /** Resume this exact persisted session instead of creating a new one. */
    resumeSessionId?: string;
    /** Resume the most recently created session (ignored when `resumeSessionId` is set). */
    continueLatest: boolean;
    /** Output shape: plain text or a single JSON object on stdout. */
    outputFormat: 'text' | 'json';
    /** Override the provider route for this run. */
    provider?: string;
    /** Override the model id for this run. */
    model?: string;
    /** Per-request output-token cap for this run. */
    maxTokens?: number;
    /** Reasoning effort for this run (adapter-specific: off|high|max, …). */
    effort?: string;
}
/** Parse and publish the one-shot task plus scheduling flags as a Cordis service. */
export declare function apply(ctx: Context): void;
