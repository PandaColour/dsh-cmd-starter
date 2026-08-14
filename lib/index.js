/**
 * dsh-cmd-starter main entry: the Claude-Code style headless runner plugin.
 * The bundle patch (`cordis.patch.yml`) points the `headless-runner` row at
 * this package, so the runner plugin itself is the package root export.
 */
export { name, inject, apply, internals } from './runner.js';
export { CMD_STARTUP_SERVICE } from './startup.js';
