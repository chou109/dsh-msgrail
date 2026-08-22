// Smoke test for the dsh-msgrail client bundle.
// Loads the REAL lib/client.js through a minimal browser shim, runs the factory,
// then exercises the injected session actions (fetchHistory envelope unwrap,
// guards, subscribe/loadOlder wiring) against fake session objects.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync("lib/client.js", "utf8");

let registration = null;
const window = {
  __ModuleLoader__: {
    load(reg) { registration = reg; },
  },
};
const fakeDoc = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, style: {}, textContent: "" }),
  head: { appendChild() {} },
};
const context = vm.createContext({
  window,
  console,
  Promise,
  Map,
  Set,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (f) => 0,
  cancelAnimationFrame: () => {},
  CSS: { escape: (s) => s },
  document: fakeDoc,
});
vm.runInContext(src, context);

if (!registration || registration.id !== "dsh-msgrail") throw new Error("registration missing");
const stubModules = {
  "react": {},
  "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
  "@deepseek-ai/dsh-client-ui-primitives": {},
};
const moduleExports = registration.factory((spec) => stubModules[spec] ?? {});

let failures = 0;
const check = (name, cond) => {
  console.log((cond ? "PASS" : "FAIL") + "  " + name);
  if (!cond) failures++;
};

// ---- build the injected actions via apply() ----
const localeCalls = [];
const slotsInjected = [];
const ctx = {
  effect(fn) { fn(); },
  locale: { register: (ns, dict) => { localeCalls.push([ns, dict]); } },
  slots: {
    inject(slot, fn) { slotsInjected.push([slot, fn]); },
    register(cfg) { return cfg; },
  },
  sessions: { binding: () => undefined },
};
moduleExports.apply(ctx);

check("apply registers locale dictionaries", localeCalls.length === 1 && localeCalls[0][0] === "dsh-msgrail");
check("apply injects into shell.history slot", slotsInjected.length === 1 && slotsInjected[0][0] === "shell.history");

const slotFn = slotsInjected[0][1];
const cfg = slotFn();
const actions = cfg.inject();
check("inject exposes all actions", ["subscribeSession", "loadOlder", "fetchHistory", "readRows"].every((k) => typeof actions[k] === "function"));

// ---- fake session: paginated history RPC, like the rc.8 runtime ----
const events = [];
for (let seq = 1; seq <= 120; seq++) {
  events.push({
    event: {
      seq,
      time: 1700000000000 + seq * 1000,
      type: "user/message",
      surfaceOp: "append",
      data: { id: `msg-${seq}`, source: { kind: "user" }, content: [{ type: "text", text: `msg ${seq}` }] },
    },
    view: undefined,
  });
}
// an injected-context event that must NOT become a row
events.splice(50, 0, {
  event: {
    seq: 55, time: 1, type: "user/message", surfaceOp: "append",
    data: { id: "ctx-55", source: { kind: "plugin", plugin: "time-context" }, content: [{ type: "text", text: "[时间] now" }] },
  },
  view: undefined,
});
const fakeSession = {
  history(call) {
    const pageSize = 50;
    const before = call.beforeSeq === undefined ? Infinity : call.beforeSeq;
    const page = events.filter((e) => e.event.seq < before).slice(-pageSize);
    const hasMore = page.length > 0 && page[0].event.seq > 1;
    return Promise.resolve({ result: { ok: true, value: { events: page, hasMore } } });
  },
  loadOlder() { return Promise.resolve(); },
  subscribe(fn) { this._fn = fn; return () => { this._fn = null; }; },
  getSnapshot() { return { chat: { nodes: { values: () => [] } }, hasMore: false, openState: "open" }; },
};

// ---- fetchHistory: envelope unwrap ----
let bound = { session: fakeSession };
ctx.sessions.binding = (id) => (id === "s1" ? bound : undefined);
actions.fetchHistory("s1", undefined).then((page) => {
  check("fetchHistory tail page returns {events, hasMore}", page !== null && Array.isArray(page.events) && typeof page.hasMore === "boolean");
  check("fetchHistory tail page is capped at maxMessages", page.events.length <= 50);
  const tailFirstSeq = page.events[0].event.seq;
  return actions.fetchHistory("s1", tailFirstSeq).then((older) => {
    check("fetchHistory beforeSeq page returns only older events", older !== null && older.events.length > 0 && older.events.every((e) => e.event.seq < tailFirstSeq));
    // walk pages to the head of the log and confirm hasMore flips false at seq 1
    const walk = (before) => actions.fetchHistory("s1", before).then((p) => {
      if (p.events[0].event.seq === 1) return p;
      return walk(p.events[0].event.seq);
    });
    return walk(older.events[0].event.seq).then((head) => {
      check("fetchHistory hasMore false at log head", head.hasMore === false && head.events[0].event.seq === 1);
      // guards
      bound = { session: { history: null, getSnapshot: fakeSession.getSnapshot } };
      return actions.fetchHistory("s1", undefined).then((r) => {
        check("fetchHistory guards missing history() -> null", r === null);
        bound = {};
        return actions.fetchHistory("s1", undefined).then((r2) => {
          check("fetchHistory guards missing session -> null", r2 === null);
        });
      });
    });
  });
}).then(() => {
  // ---- readRows: snapshot read + guards ----
  bound = { session: fakeSession };
  return actions.readRows("s1").then((snap) => {
    check("readRows returns rows/hasMore/openState", snap && Array.isArray(snap.rows) && typeof snap.hasMore === "boolean" && snap.openState === "open");
    bound = { session: { getSnapshot: () => ({ chat: { nodes: { values: () => [] } }, hasMore: true, openState: "loading" }) } };
    return actions.readRows("s1").then((snap2) => {
      check("readRows reports hasMore/openState from snapshot", snap2.hasMore === true && snap2.openState === "loading");
      bound = {};
      return actions.readRows("s1").then((snap3) => {
        check("readRows guards missing session", snap3.openState === "cold" && snap3.rows.length === 0);
      });
    });
  });
}).then(() => {
  // ---- subscribeSession + loadOlder wiring ----
  bound = { session: fakeSession };
  const un = actions.subscribeSession("s1", () => {});
  check("subscribeSession wires session.subscribe", typeof un === "function");
  return actions.loadOlder("s1").then((r) => check("loadOlder resolves", r === undefined));
}).then(() => {
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}).catch((err) => {
  console.error("TEST ERROR:", err);
  process.exit(1);
});
