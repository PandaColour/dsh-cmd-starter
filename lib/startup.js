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
import { Command } from 'commander';
import { parseCmdline } from '@deepseek-ai/dsh-cmdline';
/** Stable Cordis plugin name. */
export const name = 'cmd-startup';
/** Services required before the invocation can be parsed. */
export const inject = ['cmdlineArgs'];
/** Service name the runner row injects. */
export const CMD_STARTUP_SERVICE = 'cmdStartup';
/** Repeatable single-value collector for `--append-prompt`. */
const collect = (value, previous = []) => [...previous, value];
function cmdCommand() {
    return new Command()
        .name('dsh --profile <name>')
        .description('Answer one task in headless mode, print the result, and exit. Claude-Code style scheduling flags follow.')
        .helpOption('-h, --help', 'show this help')
        .argument('[task...]', 'the task text; multiple words are joined by spaces')
        .option('--append-prompt <text>', 'append extra system-prompt text for THIS run only (repeatable)', collect)
        .option('--resume <sessionId>', 'resume an existing session instead of creating a new one')
        .option('-c, --continue', 'resume the most recently created session')
        .option('--output-format <format>', 'stdout shape: text (default) or json', /^(text|json)$/, 'text')
        .option('--provider <name>', 'override the provider route for this run')
        .option('--model <name>', 'override the model id for this run')
        .option('--max-tokens <n>', 'per-request output-token cap', value => {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1)
            throw new Error('--max-tokens needs a positive integer');
        return n;
    })
        .option('--effort <level>', 'reasoning effort for this run (adapter-specific)')
        .addHelpText('after', `
Examples:
  dsh --profile headless "run the tests"                      answer one task and exit
  dsh --profile headless --append-prompt "be terse" "task"    append a per-run system-prompt note
  dsh --profile headless --resume <id> "continue"             resume a persisted session
  dsh --profile headless -c "continue"                        resume the latest session
  dsh --profile headless --output-format json "task"          emit JSON incl. sessionId
`);
}
/** Parse and publish the one-shot task plus scheduling flags as a Cordis service. */
export function apply(ctx) {
    const program = cmdCommand();
    program.action(() => {
        const task = program.args.join(' ');
        if (task.trim() === '')
            program.error('error: a task is required, for example: dsh --profile headless "run the tests"');
        const opts = program.opts();
        if (opts.resume !== undefined && opts.continue === true) {
            program.error('error: --resume and --continue are mutually exclusive');
        }
        ctx.provide(CMD_STARTUP_SERVICE, {
            task,
            appendPrompts: opts.appendPrompt ?? [],
            resumeSessionId: opts.resume,
            continueLatest: opts.continue === true,
            outputFormat: opts.outputFormat,
            provider: opts.provider,
            model: opts.model,
            maxTokens: opts.maxTokens,
            effort: opts.effort,
        });
    });
    parseCmdline(ctx, program);
}
