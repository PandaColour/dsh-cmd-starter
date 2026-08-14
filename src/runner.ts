/**
 * Claude-Code style one-shot runner over the official headless profile.
 *
 * Reads the `cmdStartup` service, resolves the session identity (fresh create,
 * exact `--resume`, or latest via `--continue`), runs one task to quiescence,
 * and prints either plain text or a JSON object carrying the session id.
 * @module dsh-cmd-starter
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { ModelSelection, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionRecord } from '@deepseek-ai/dsh-session-query'
// Empty type imports carry the loader Context merge for the settlement await
// and the sessionQuery Context merge for the --continue listing.
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-session-query'
import type { CmdStartupValues } from './startup.js'
import { CMD_STARTUP_SERVICE } from './startup.js'
import { resolveAlias, writeAlias } from './aliases.js'

/** Stable Cordis plugin name. */
export const name = 'cmd-runner'

/** Core services required before the one-shot turn can start. */
export const inject = ['cmdStartup', 'agentDefaultModel', 'agents', 'sessions']

/** Outcome of one owned run interval. */
interface RunOutcome {
  text: string
  reason: SessionEvent<'turn/end'>['data']['reason'] | undefined
}

/** Process-facing effects of one run. */
interface HeadlessIo {
  stdout: { write(chunk: string): unknown }
  stderr: { write(chunk: string): unknown }
  exit(code: number): void
}

/** The process streams the runner writes to; tests substitute captures. */
export const internals: { stdout: HeadlessIo['stdout']; stderr: HeadlessIo['stderr'] } = {
  stdout: process.stdout,
  stderr: process.stderr,
}

/** Aggregate the last assistant text and turn outcome in one owned interval. */
function summarize(events: readonly SessionEvent[], firstSeq: number): RunOutcome {
  let started = false
  let text = ''
  let reason: SessionEvent<'turn/end'>['data']['reason'] | undefined
  for (const event of events) {
    if (event.seq < firstSeq) continue
    if (event.type === 'turn/start') {
      started = true
      continue
    }
    if (!started) continue
    if (event.type === 'assistant/message') {
      const joined = event.data.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
      if (joined !== '') text = joined
    }
    if (event.type === 'turn/end') reason = event.data.reason
  }
  return { text, reason }
}

/** Report an unexpected direct-driver failure and request a failing exit. */
function fail(io: HeadlessIo, error: unknown): void {
  io.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`)
  io.exit(1)
}

/** Resolve the session identity: exact resume (id or alias) > latest continue > fresh create. */
async function resolveResumeSessionId(
  ctx: Context,
  startup: CmdStartupValues,
): Promise<SessionId | undefined> {
  if (startup.resumeSessionId !== undefined) return SessionId(resolveAlias(startup.resumeSessionId))
  if (!startup.continueLatest) return undefined
  const sessionQuery = ctx.get('sessionQuery')
  if (sessionQuery === undefined) {
    throw new Error('--continue needs a mounted sessionQuery service; mount @deepseek-ai/dsh-session-query-sqlite')
  }
  const records: SessionRecord[] = await sessionQuery.listSessions()
  const latest = records[0]
  if (latest === undefined) throw new Error('--continue found no persisted session to resume')
  return latest.header.id
}

/** Compose the effective model selection from the default plus CLI overrides. */
function resolveSelection(ctx: Context, startup: CmdStartupValues): ModelSelection {
  const base = ctx.get('agentDefaultModel')?.currentSelection()
  return {
    provider: startup.provider ?? base?.provider ?? '',
    model: startup.model ?? base?.model ?? '',
    ...startup.effort !== undefined
      ? { reasoningEffort: startup.effort as ReasoningEffortId }
      : base?.reasoningEffort !== undefined
        ? { reasoningEffort: base.reasoningEffort }
        : {},
  }
}

/** Run one task through a freshly created or resumed Agent and request exit. */
async function run(ctx: Context, startup: CmdStartupValues, io: HeadlessIo): Promise<void> {
  await ctx.get('loader')?.await()
  const agents = ctx.get('agents')
  const sessions = ctx.get('sessions')
  if (agents === undefined || sessions === undefined) return

  const selection = resolveSelection(ctx, startup)
  const resumeSessionId = await resolveResumeSessionId(ctx, startup)
  const agentOptions = {
    provider: selection.provider,
    model: selection.model,
    ...startup.maxTokens === undefined ? {} : { maxTokens: startup.maxTokens },
  }
  const setup = (agentCtx: Context): void => {
    const selected: ModelSelectionRef = { current: selection, assembled: undefined }
    installModelSelection(agentCtx, selected)
    if (startup.appendPrompts.length > 0) {
      agentCtx.systemPrompt.section({
        name: 'cli-append-prompt',
        order: 1,
        text: startup.appendPrompts.join('\n\n'),
      })
    }
  }

  const { agent } = resumeSessionId === undefined
    ? await agents.create({
      sessionId: SessionId(`session-${randomUUID()}`),
      meta: { cwd: process.cwd() },
      agentOptions,
      setup,
    })
    : await agents.resume({
      resumeSessionId,
      agentOptions,
      setup,
    })

  await agent.whenIdle()
  const firstSeq = agent.session.seq
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: startup.task }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()
  await sessions.flush(agent.session)
  const outcome = summarize(agent.session.events, firstSeq)

  // Name the session under its durable alias before any output, so a JSON
  // consumer sees a sessionId that a later `--resume <name>` resolves.
  if (startup.name !== undefined) {
    writeAlias(startup.name, String(agent.session.id))
  }

  if (startup.outputFormat === 'json') {
    io.stdout.write(JSON.stringify({
      sessionId: String(agent.session.id),
      ...startup.name !== undefined ? { name: startup.name } : {},
      finalResponse: outcome.text,
      finishReason: outcome.reason?.kind ?? null,
      ...outcome.reason?.kind === 'error' ? { errorCode: outcome.reason.error.code } : {},
    }) + '\n')
  } else {
    io.stdout.write(outcome.text + '\n')
  }
  if (outcome.reason?.kind === 'error') {
    io.stderr.write(`dsh: ${outcome.reason.error.code}: ${outcome.reason.error.message}\n`)
  }
  io.exit(outcome.reason?.kind === 'completed' ? 0 : 1)
}

/** Mount the one-shot direct driver. */
export function apply(ctx: Context): void {
  const startup = ctx.get(CMD_STARTUP_SERVICE) as CmdStartupValues | undefined
  if (startup === undefined) return
  const exit = ctx.get('appExit')
  if (exit === undefined) {
    throw new Error('cmd-runner: the launcher must provide ctx.appExit before the tree mounts')
  }
  const io: HeadlessIo = { stdout: internals.stdout, stderr: internals.stderr, exit }
  void run(ctx, startup, io).catch((error: unknown) => { fail(io, error) })
}

export { CMD_STARTUP_SERVICE }
