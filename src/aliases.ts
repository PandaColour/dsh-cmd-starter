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

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

const ALIAS_FILE = dshHomePath('cmd-starter', 'aliases.json')

/** Read the whole name → sessionId map; an absent or unreadable file is empty. */
export function readAliases(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(ALIAS_FILE, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

/** Insert or overwrite one alias durably. */
export function writeAlias(name: string, sessionId: string): void {
  const aliases = readAliases()
  aliases[name] = sessionId
  mkdirSync(dirname(ALIAS_FILE), { recursive: true })
  const tmp = `${ALIAS_FILE}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(aliases, null, 2) + '\n', 'utf8')
  renameSync(tmp, ALIAS_FILE)
}

/** Resolve a `--resume` value: an alias maps to its session id, anything else passes through. */
export function resolveAlias(value: string): string {
  return readAliases()[value] ?? value
}
