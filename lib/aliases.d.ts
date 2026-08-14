/**
 * Durable name → sessionId alias mapping for `--name` / `--resume <name>`.
 *
 * Stored as one JSON file under the harness home (`$DSH_HOME/cmd-starter/aliases.json`).
 * Written atomically (temp file + rename) so a crash never leaves a torn file.
 * Headless runs are one-shot processes, so a read-modify-write race is
 * acceptable for this starter; a heavier deployment can swap this module for
 * the `@deepseek-ai/dsh-storage-domain` KV form without changing callers.
 * @module dsh-cmd-starter/aliases
 */
/** Read the whole name → sessionId map; an absent or unreadable file is empty. */
export declare function readAliases(): Record<string, string>;
/** Insert or overwrite one alias durably. */
export declare function writeAlias(name: string, sessionId: string): void;
/** Resolve a `--resume` value: an alias maps to its session id, anything else passes through. */
export declare function resolveAlias(value: string): string;
