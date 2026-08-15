/**
 * dsh-msgrail — host half.
 *
 * The feature is pure client UI: a narrow message rail docked at the left of
 * the chat, one thin bar per message YOU sent in the current conversation,
 * with hover previews and click-to-jump. This half exists only so the cordis
 * Loader entry is a valid plugin — client discovery scans the enabled Loader
 * entries for packages declaring `dsh.client` and serves their
 * `exports["./client"]` bundle to the browser, so a Loader row must exist for
 * the browser half to be discovered at all.
 *
 * No server behavior is required; keep this file as the minimal cordis
 * contract (`name` + `inject` + `apply`).
 */
const name = "dsh-msgrail";
const inject = [];

function apply() {
  /* nothing to do server-side */
}

export { apply, inject, name };
