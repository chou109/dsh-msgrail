// patch-layout.mjs — adds the dsh-msgrail column to the host layout.
//
// Patches @deepseek-ai/dsh-client-ui-layout so AppFrame renders an extra
// `shell.history` grid column between the sidebar and the conversation:
//   - the grid track is sized with var(--dsh-history-width, 0px) (the
//     dsh-msgrail stylesheet sets it to 44px; an uninstalled plugin
//     costs no space);
//   - a `shell.history` child slot (single, root scope) is declared;
//   - a wrapper <div class="dsh-layout-historyCol"> renders the slot between
//     the sidebar column and the center column.
//
// Idempotent: a file that already carries the patch marker is left untouched.
//
// Usage:
//   node patch-layout.mjs [path-to-dsh-client-ui-layout/lib/client.js]
//
// Target resolution: an explicit path argument wins; otherwise the layout
// bundle is resolved from $DSH_HOME (falling back to ~/.dsh):
//   $DSH_HOME/profiles/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js
// No machine-specific path is hard-coded.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function resolveLayoutTarget() {
  if (process.argv[2]) return process.argv[2];
  const home =
    process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ""
      ? process.env.DSH_HOME
      : join(homedir(), ".dsh");
  const candidates = [
    join(home, "profiles", "node_modules", "@deepseek-ai", "dsh-client-ui-layout", "lib", "client.js"),
    join(home, "node_modules", "@deepseek-ai", "dsh-client-ui-layout", "lib", "client.js")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

const target = resolveLayoutTarget();
if (!existsSync(target)) {
  console.error(
    "layout bundle not found at: " +
      target +
      "\nSet DSH_HOME (or use the default ~/.dsh) so the script can find " +
      "@deepseek-ai/dsh-client-ui-layout, or pass the explicit path:\n" +
      "  node patch-layout.mjs <path-to-dsh-client-ui-layout/lib/client.js>"
  );
  process.exit(1);
}

// The idempotency marker matches what the patched host layout actually contains
// (it predates this package's rename), so it intentionally stays "dsh-session-history".
const MARKER = "dsh-session-history (patched)";
const T = "\t"; // the compiled layout bundle uses tab indentation

let src;
try {
  src = readFileSync(target, "utf8");
} catch (e) {
  console.error("cannot read", target, e.message);
  process.exit(1);
}
if (src.includes(MARKER)) {
  console.log("already patched:", target);
  process.exit(0);
}

const edits = [
  [
    // Grid: sidebar | history (var) | center | details. Indentation: 4 tabs.
    `${T}${T}${T}${T}style: { gridTemplateColumns: \`\${cols.sidebar}px minmax(0, 1fr) \${cols.details}px\` },`,
    `${T}${T}${T}${T}style: { gridTemplateColumns: \`\${cols.sidebar}px var(--dsh-history-width, 0px) minmax(0, 1fr) \${cols.details}px\` },`,
  ],
  [
    // Insert the history column between the sidebar column and the center. Indentation: 5/6/7 tabs.
    `${T}${T}${T}${T}${T}(0, react_jsx_runtime.jsx)("div", {
${T}${T}${T}${T}${T}${T}className: AppFrame_module_css_default.sidebarCol,
${T}${T}${T}${T}${T}${T}children: renderSlot("sidebar", {
${T}${T}${T}${T}${T}${T}${T}collapsed: sidebarCollapsed,
${T}${T}${T}${T}${T}${T}${T}width: cols.sidebar
${T}${T}${T}${T}${T}${T}})
${T}${T}${T}${T}${T}}),`,
    `${T}${T}${T}${T}${T}(0, react_jsx_runtime.jsx)("div", {
${T}${T}${T}${T}${T}${T}className: AppFrame_module_css_default.sidebarCol,
${T}${T}${T}${T}${T}${T}children: renderSlot("sidebar", {
${T}${T}${T}${T}${T}${T}${T}collapsed: sidebarCollapsed,
${T}${T}${T}${T}${T}${T}${T}width: cols.sidebar
${T}${T}${T}${T}${T}${T}})
${T}${T}${T}${T}${T}}),
${T}${T}${T}${T}${T}// dsh-msgrail (patched): optional left column between the sidebar
${T}${T}${T}${T}${T}// and the messages; track width comes from --dsh-history-width (set by the
${T}${T}${T}${T}${T}// plugin's stylesheet, default 0px so an uninstalled plugin costs no space).
${T}${T}${T}${T}${T}(0, react_jsx_runtime.jsx)("div", {
${T}${T}${T}${T}${T}${T}className: "dsh-layout-historyCol",
${T}${T}${T}${T}${T}${T}style: { overflow: "hidden" },
${T}${T}${T}${T}${T}${T}children: renderSlot("shell.history", {})
${T}${T}${T}${T}${T}}),`,
  ],
  [
    // Declare the shell.history child slot. Indentation: 5/6/7 tabs.
    `${T}${T}${T}${T}${T}children: {
${T}${T}${T}${T}${T}${T}"sidebar": {
${T}${T}${T}${T}${T}${T}${T}kind: "single",
${T}${T}${T}${T}${T}${T}${T}scope: "root"
${T}${T}${T}${T}${T}${T}},
${T}${T}${T}${T}${T}${T}"conversation": {`,
    `${T}${T}${T}${T}${T}children: {
${T}${T}${T}${T}${T}${T}"sidebar": {
${T}${T}${T}${T}${T}${T}${T}kind: "single",
${T}${T}${T}${T}${T}${T}${T}scope: "root"
${T}${T}${T}${T}${T}${T}},
${T}${T}${T}${T}${T}${T}"shell.history": {
${T}${T}${T}${T}${T}${T}${T}kind: "single",
${T}${T}${T}${T}${T}${T}${T}scope: "root"
${T}${T}${T}${T}${T}${T}},
${T}${T}${T}${T}${T}${T}"conversation": {`,
  ],
];

let applied = 0;
for (const [oldStr, newStr] of edits) {
  if (!src.includes(oldStr)) {
    console.error(
      "PATCH ANCHOR NOT FOUND — this harness version differs; skipping this edit.\n---\n" +
        oldStr.slice(0, 120) +
        "\n---"
    );
    continue;
  }
  src = src.replace(oldStr, newStr);
  applied += 1;
}
if (applied < edits.length) {
  console.error(`partial patch (${applied}/${edits.length} edits) — original left in place.`);
  process.exit(1);
}
writeFileSync(target, src);
console.log("patched OK:", target);
