/**
 * Claude-Code style one-shot runner over the official headless profile.
 *
 * Reads the `cmdStartup` service, resolves the session identity (fresh create,
 * exact `--resume`, or latest via `--continue`), runs one task to quiescence,
 * and prints either plain text or a JSON object carrying the session id.
 * @module dsh-cmd-starter
 */
import { randomUUID } from 'node:crypto';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { CMD_STARTUP_SERVICE } from './startup.js';
import { resolveAlias, writeAlias } from './aliases.js';
/** Stable Cordis plugin name. */
export const name = 'cmd-runner';
/** Core services required before the one-shot turn can start. */
export const inject = ['cmdStartup', 'agentDefaultModel', 'agents', 'sessions'];
/** The process streams the runner writes to; tests substitute captures. */
export const internals = {
    stdout: process.stdout,
    stderr: process.stderr,
};
/** Aggregate the last assistant text and turn outcome in one owned interval. */
function summarize(events, firstSeq) {
    let started = false;
    let text = '';
    let reason;
    for (const event of events) {
        if (event.seq < firstSeq)
            continue;
        if (event.type === 'turn/start') {
            started = true;
            continue;
        }
        if (!started)
            continue;
        if (event.type === 'assistant/message') {
            const joined = event.data.message.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('');
            if (joined !== '')
                text = joined;
        }
        if (event.type === 'turn/end')
            reason = event.data.reason;
    }
    return { text, reason };
}
/** Report an unexpected direct-driver failure and request a failing exit. */
function fail(io, error) {
    io.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`);
    io.exit(1);
}
/** Resolve the session identity: exact resume (id or alias) > latest continue > fresh create. */
async function resolveResumeSessionId(ctx, startup) {
    if (startup.resumeSessionId !== undefined)
        return SessionId(resolveAlias(startup.resumeSessionId));
    if (!startup.continueLatest)
        return undefined;
    const sessionQuery = ctx.get('sessionQuery');
    if (sessionQuery === undefined) {
        throw new Error('--continue needs a mounted sessionQuery service; mount @deepseek-ai/dsh-session-query-sqlite');
    }
    const records = await sessionQuery.listSessions();
    const latest = records[0];
    if (latest === undefined)
        throw new Error('--continue found no persisted session to resume');
    return latest.header.id;
}
/** Compose the effective model selection from the default plus CLI overrides. */
function resolveSelection(ctx, startup) {
    const base = ctx.get('agentDefaultModel')?.currentSelection();
    return {
        provider: startup.provider ?? base?.provider ?? '',
        model: startup.model ?? base?.model ?? '',
        ...startup.effort !== undefined
            ? { reasoningEffort: startup.effort }
            : base?.reasoningEffort !== undefined
                ? { reasoningEffort: base.reasoningEffort }
                : {},
    };
}
/** Run one task through a freshly created or resumed Agent and request exit. */
async function run(ctx, startup, io) {
    await ctx.get('loader')?.await();
    const agents = ctx.get('agents');
    const sessions = ctx.get('sessions');
    if (agents === undefined || sessions === undefined)
        return;
    const selection = resolveSelection(ctx, startup);
    const resumeSessionId = await resolveResumeSessionId(ctx, startup);
    const agentOptions = {
        provider: selection.provider,
        model: selection.model,
        ...startup.maxTokens === undefined ? {} : { maxTokens: startup.maxTokens },
    };
    const setup = (agentCtx) => {
        const selected = { current: selection, assembled: undefined };
        installModelSelection(agentCtx, selected);
        if (startup.appendPrompts.length > 0) {
            agentCtx.systemPrompt.section({
                name: 'cli-append-prompt',
                order: 1,
                text: startup.appendPrompts.join('\n\n'),
            });
        }
    };
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
        });
    await agent.whenIdle();
    const firstSeq = agent.session.seq;
    agent.followup(createUserMessage({
        content: [{ type: 'text', text: startup.task }],
        source: { kind: 'user' },
    }));
    await agent.whenIdle();
    await sessions.flush(agent.session);
    const outcome = summarize(agent.session.events, firstSeq);
    // Name the session under its durable alias before any output, so a JSON
    // consumer sees a sessionId that a later `--resume <name>` resolves.
    if (startup.name !== undefined) {
        writeAlias(startup.name, String(agent.session.id));
    }
    if (startup.outputFormat === 'json') {
        io.stdout.write(JSON.stringify({
            sessionId: String(agent.session.id),
            ...startup.name !== undefined ? { name: startup.name } : {},
            finalResponse: outcome.text,
            finishReason: outcome.reason?.kind ?? null,
            ...outcome.reason?.kind === 'error' ? { errorCode: outcome.reason.error.code } : {},
        }) + '\n');
    }
    else {
        io.stdout.write(outcome.text + '\n');
    }
    if (outcome.reason?.kind === 'error') {
        io.stderr.write(`dsh: ${outcome.reason.error.code}: ${outcome.reason.error.message}\n`);
    }
    io.exit(outcome.reason?.kind === 'completed' ? 0 : 1);
}
/** Mount the one-shot direct driver. */
export function apply(ctx) {
    const startup = ctx.get(CMD_STARTUP_SERVICE);
    if (startup === undefined)
        return;
    const exit = ctx.get('appExit');
    if (exit === undefined) {
        throw new Error('cmd-runner: the launcher must provide ctx.appExit before the tree mounts');
    }
    const io = { stdout: internals.stdout, stderr: internals.stderr, exit };
    void run(ctx, startup, io).catch((error) => { fail(io, error); });
}
export { CMD_STARTUP_SERVICE };
