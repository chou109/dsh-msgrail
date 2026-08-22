/**
 * dsh-msgrail — browser half (client bundle).
 *
 * A NARROW MESSAGE-RAIL between the sidebar and the messages — a vertical
 * stack of short horizontal bars, one bar per user/AI message of the current
 * conversation:
 *
 *   - no text in the rail: just thin bars, vertically centered, densely
 *     stacked (user bars and AI bars differ subtly by shade);
 *   - HOVER a bar → it grows longer/bolder and an attached preview card shows
 *     the full message (role + text + time); moving away hides it; CLICK → the
 *     conversation scrolls to that message;
 *   - the rail shows the WHOLE conversation history, not only the messages
 *     the conversation has loaded: it pages the full history itself
 *     (`session.history({ beforeSeq })`, the paginated session-log RPC) and
 *     keeps the tail in sync live (debounced tail refetch on session updates),
 *     so older messages appear in the index even before they are loaded into
 *     the chat window;
 *   - when the bars overflow the rail height the rail scrolls (scroll up for
 *     older messages), and the view pins to the latest as new messages arrive.
 *
 * Data path notes (rc.7/rc.8 web profile):
 *   - The paginated history RPC is still present on the Session class at
 *     runtime (`session.history({ beforeSeq, maxMessages })` → `{ result: {
 *     ok, value: { events, hasMore } } }`); it is type-`private` on
 *     `SessionFace`, so the bundle calls it defensively (`typeof
 *     session.history === "function"`).
 *   - If a future release drops that RPC, the bundle falls back to reading the
 *     conversation snapshot (`session.getSnapshot()` → the loaded window) and
 *     growing the window with `session.loadOlder()` until the snapshot reports
 *     `hasMore: false`. The fallback waits for the window to open before
 *     walking and re-runs the walk on live updates when the previous walk
 *     could not complete, so it never silently degrades to "only the loaded
 *     messages" the way the previous snapshot-only rewrite did.
 *
 * Grid track: the patched host layout (@deepseek-ai/dsh-client-ui-layout)
 * renders a `shell.history` slot between its sidebar and conversation columns
 * and sizes that track with `var(--dsh-history-width, 0px)`. This bundle's
 * stylesheet declares `:root { --dsh-history-width: 44px }` so the rail
 * appears on load; the loader's style-tag tracking removes it on unload.
 *
 * Jump keys: the conversation anchors chat rows with
 * `data-chat-anchor-key={conversationContextKey(definitionKind, id)}`; the
 * user definition is `input-message` (id = message id) and the assistant
 * definition is `assistant-step` (id = `<turn>:<step>`), so a bar's anchor key
 * can be computed from the raw history event data.
 *
 * Bundle contract: `window.__ModuleLoader__.load({ id, factory })` — factory
 * receives the shell's `require` (react, react/jsx-runtime and
 * @deepseek-ai/dsh-client-ui-primitives come from the shell's static module
 * table).
 */
window.__ModuleLoader__.load({
	id: "dsh-msgrail",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var jsxRuntime = require("react/jsx-runtime");
		var primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		//#region styles
		var css = [
			":root{--dsh-history-width:44px}",
			".dsh-his-rail{box-sizing:border-box;width:100%;height:100%;flex-direction:column;padding:10px 4px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);display:flex;overflow-y:auto}",
			/* The bar stack is vertically centered via auto margins: with free space the
			* group sits in the middle of the rail; when the bars overflow the rail height
			* the margins collapse to 0 and the rail scrolls (older messages reachable). */
			".dsh-his-bars{flex-direction:column;align-items:center;gap:7px;margin:auto 0;display:flex}",
			/* Faint bars: opacity lightens them in both themes; hover/selected step up. */
			".dsh-his-bar{flex:none;height:3px;width:20px;border:none;border-radius:1px;padding:0;cursor:pointer;background:var(--dsw-alias-label-caption);opacity:.4;transition:width .12s var(--ds-ease-in-out),background .12s var(--ds-ease-in-out),opacity .12s var(--ds-ease-in-out)}",
			".dsh-his-bar:hover{background:var(--dsw-alias-label-tertiary);opacity:.85}",
			".dsh-his-bar[data-kind=user]{background:var(--dsw-alias-label-tertiary);opacity:.45}",
			".dsh-his-bar[data-kind=user]:hover{background:var(--dsw-alias-label-secondary);opacity:.9}",
			".dsh-his-bar[data-selected]{width:34px;background:var(--dsw-alias-label-primary);opacity:1}",
			".dsh-his-preview{z-index:40;box-sizing:border-box;width:240px;max-width:calc(100vw - 24px);border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv2);border-radius:10px;flex-direction:column;padding:10px 12px;font-family:inherit;display:flex;position:fixed}",
			".dsh-his-previewMeta{display:flex;align-items:center;gap:8px;margin-bottom:6px}",
			".dsh-his-previewRole{color:var(--dsw-alias-label-secondary);flex:none;font-size:11px;font-weight:600;line-height:14px}",
			".dsh-his-previewTime{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:14px}",
			".dsh-his-previewText{color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;max-height:180px;font-size:12px;line-height:17px;overflow-y:auto}"
		].join("");
		var tagId = "dsh-msgrail/message-rail.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-msgrail";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var C = {
			rail: "dsh-his-rail",
			bars: "dsh-his-bars",
			bar: "dsh-his-bar",
			preview: "dsh-his-preview",
			previewMeta: "dsh-his-previewMeta",
			previewRole: "dsh-his-previewRole",
			previewTime: "dsh-his-previewTime",
			previewText: "dsh-his-previewText"
		};
		//#endregion

		//#region locales
		var NS = "dsh-msgrail";
		var zh = {
			"role.user": "我",
			"role.assistant": "助手",
			"time.justNow": "刚刚",
			"time.minutesAgo": "{n} 分钟前",
			"time.hoursAgo": "{n} 小时前",
			"time.daysAgo": "{n} 天前"
		};
		var en = {
			"role.user": "You",
			"role.assistant": "AI",
			"time.justNow": "just now",
			"time.minutesAgo": "{n}m ago",
			"time.hoursAgo": "{n}h ago",
			"time.daysAgo": "{n}d ago"
		};
		//#endregion

		//#region helpers
		var jsx = jsxRuntime.jsx;
		var jsxs = jsxRuntime.jsxs;

		function relativeTime(ts, now, t) {
			var diff = now - ts;
			if (diff < 60 * 1000) return t("time.justNow");
			var minutes = Math.floor(diff / (60 * 1000));
			if (minutes < 60) return t("time.minutesAgo", { n: minutes });
			var hours = Math.floor(minutes / 60);
			if (hours < 24) return t("time.hoursAgo", { n: hours });
			var days = Math.floor(hours / 24);
			if (days < 30) return t("time.daysAgo", { n: days });
			return new Date(ts).toLocaleDateString();
		}

		/** Blocks auto-injected by other plugins (e.g. the paste-image hint
		*  "[系统提示：…图片附件…vision_chat…]") are noise for the preview: skip them. */
		function isNoiseText(text) {
			return /^\[(用户粘贴的图片|图片附件|系统提示：当前模型无法直接查看图片)/.test(text);
		}

		function blockText(blocks) {
			if (!Array.isArray(blocks)) return "";
			var parts = [];
			for (var i = 0; i < blocks.length; i++) {
				var block = blocks[i];
				if (block === null || typeof block !== "object") continue;
				if (typeof block.text === "string") {
					if (block.text.trim() === "" || isNoiseText(block.text)) continue;
					parts.push(block.text);
				} else {
					parts.push("[" + String(block.kind || block.type || "内容") + "]");
				}
			}
			return parts.join(" ").replace(/\s+/g, " ").trim();
		}

		/** Replicate the conversation's chat-node key: `${kind.length}:${kind}${id}`. */
		function conversationKey(kind, id) {
			return kind.length + ":" + kind + id;
		}

		/** One rail row from a raw history event — ONLY the user's own messages.
		*  A bar appears only for `user/message` events that are append-surface AND
		*  originated from the user (`source.kind === "user"`). Assistant replies,
		*  steering, context injections (workspace instructions / system reminders)
		*  and command rows all carry a different surfaceOp or source kind and are
		*  skipped — the same discriminators the conversation UI uses. */
		function rowFromEvent(event) {
			if (event === null || event === void 0) return null;
			if (event.type !== "user/message") return null;
			if (event.surfaceOp !== "append") return null;
			var d = event.data || {};
			var source = d.source;
			if (source === null || source === void 0 || source.kind !== "user") return null;
			return {
				key: conversationKey("input-message", String(d.id)),
				kind: "user",
				seq: event.seq,
				time: event.time,
				text: blockText(d.content)
			};
		}

		/** Map one raw history PAGE (entries carry `{ event, view }`) to rail rows. */
		function rowsFromEvents(events) {
			var out = [];
			if (!Array.isArray(events)) return out;
			for (var i = 0; i < events.length; i++) {
				var entry = events[i];
				var row = rowFromEvent(entry === null || entry === void 0 ? void 0 : entry.event);
				if (row !== null) out.push(row);
			}
			return out;
		}

		/** One rail row from the conversation snapshot — ONLY the user's own
		*  messages (fallback data path). The chat view publishes an
		*  `input-message` node per user/message event; user-sent rows carry
		*  `kind === "user"` (steering and context injections are
		*  "steering"/"context" and skipped). The node key IS the conversation's
		*  chat-anchor key, so bars can scroll to their message directly. */
		function rowsFromSnapshot(snapshot) {
			if (snapshot === null || snapshot === void 0) return [];
			var nodes = snapshot.chat && snapshot.chat.nodes;
			if (nodes === void 0 || typeof nodes.values !== "function") return [];
			var rows = [];
			var all = nodes.values();
			for (var i = 0; i < all.length; i++) {
				var node = all[i];
				if (node === null || node === void 0 || node.kind !== "user") continue;
				var data = node.data || {};
				rows.push({
					key: node.key,
					kind: "user",
					seq: typeof node.anchorSeq === "number" ? node.anchorSeq : 0,
					time: typeof data.time === "number" ? data.time : void 0,
					text: blockText(data.content)
				});
			}
			rows.sort(function (a, b) { return a.seq - b.seq; });
			return rows;
		}

		/** Merge rows by seq (later wins, e.g. a streamed assistant message replaced by its final). */
		function mergeRows(current, incoming) {
			var bySeq = /* @__PURE__ */ new Map();
			if (Array.isArray(current)) for (var i = 0; i < current.length; i++) bySeq.set(current[i].seq, current[i]);
			if (Array.isArray(incoming)) for (var j = 0; j < incoming.length; j++) bySeq.set(incoming[j].seq, incoming[j]);
			var out = Array.from(bySeq.values());
			out.sort(function (a, b) { return a.seq - b.seq; });
			return out;
		}

		/** Scroll the conversation to the DOM row that carries the given chat-node key.
		*  Returns whether the anchor was found (and scrolled). */
		function scrollToKey(key) {
			var escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(key) : key;
			var scroller = document.querySelector("[data-conversation-scroll]");
			var row = null;
			if (scroller !== null) row = scroller.querySelector('[data-chat-anchor-key="' + escaped + '"]');
			if (row === null) row = document.querySelector('[data-chat-anchor-key="' + escaped + '"]');
			if (row !== null && typeof row.scrollIntoView === "function") {
				row.scrollIntoView({ behavior: "smooth", block: "center" });
				return true;
			}
			return false;
		}
		//#endregion

		//#region component
		/**
		 * The narrow message rail. Props: the global hook `useSessions` (current
		 * session), the locale `t`, and injected actions wired to the client
		 * root ctx (subscribe to a session, fetch a history page, read the
		 * snapshot, load an older page).
		 */
		function MessageRail(props) {
			var useSessions = props.useSessions;
			var subscribeSession = props.subscribeSession;
			var fetchHistory = props.fetchHistory;
			var readRows = props.readRows;
			var loadOlder = props.loadOlder;
			var t = props.t;

			// Subscribe to the CURRENT session id specifically, so switching sessions
			// in the sidebar re-renders this rail even when the list snapshot is stable.
			var currentId = useSessions(function (s) { return s.current; });

			var rowsState = react.useState(null);
			var messageRows = rowsState[0];
			var setMessageRows = rowsState[1];
			var hoverState = react.useState(null);
			var hoverKey = hoverState[0];
			var setHoverKey = hoverState[1];
			var anchorState = react.useState(null);
			var anchor = anchorState[0]; // the hovered bar's full rect (for placement math)
			var setAnchor = anchorState[1];
			var posState = react.useState(null);
			var pos = posState[0]; // clamped {left, top} for the preview card
			var setPos = posState[1];

			var railRef = react.useRef(null);
			var prevLenRef = react.useRef(-1);
			var tailTimerRef = react.useRef(null);
			var previewRef = react.useRef(null);
			// True when the last full walk could not complete because the session
			// window was never open (fallback path only) — live updates then re-run
			// the full walk instead of just merging the loaded window.
			var fullWalkStalledRef = react.useRef(false);

			// PREFERRED: page the FULL session log via the paginated history RPC.
			// Independent of the conversation's loaded window — older messages
			// appear in the index even before the chat has loaded them. Resolves
			// null when the RPC face is absent or errored → caller falls back.
			var loadFullRowsRpc = function (sessionId) {
				var pages = [];
				var beforeSeq = void 0;
				var guard = 0;
				var step = function () {
					if (guard++ > 300) return Promise.resolve(pages);
					return fetchHistory(sessionId, beforeSeq).then(function (page) {
						if (page === null) return null;
						var events = page.events || [];
						if (events.length === 0) return pages;
						pages.unshift(events);
						if (!page.hasMore) return pages;
						beforeSeq = events[0].event.seq;
						return step();
					});
				};
				return step().then(function (result) {
					if (result === null) return null;
					var all = [];
					for (var p = 0; p < result.length; p++) all = all.concat(rowsFromEvents(result[p]));
					return mergeRows(null, all);
				});
			};

			// FALLBACK (no session.history RPC): read the conversation snapshot
			// and grow the loaded window via session.loadOlder() while the snapshot
			// reports more. Waits for the window to open first, and reports
			// `stalled: true` when it finished without the window ever being open,
			// so the live handler re-runs the walk once the session opens.
			var loadFullRowsSnapshot = function (sessionId) {
				var guard = 0;
				var waitGuard = 0;
				var openSeen = false;
				var finish = function (page) {
					if (page === null) return { rows: [], stalled: false };
					return { rows: page.rows, stalled: !(openSeen || page.openState === "open") };
				};
				var step = function () {
					if (guard++ > 50) return readRows(sessionId).then(finish);
					return readRows(sessionId).then(function (page) {
						if (page === null) return finish(null);
						if (page.openState !== "open") {
							if (waitGuard++ >= 40) return finish(page);
							return new Promise(function (resolve) {
								setTimeout(function () { resolve(step()); }, 60);
							});
						}
						openSeen = true;
						if (!page.hasMore || page.rows.length >= 250) return finish(page);
						return loadOlder(sessionId).then(step);
					});
				};
				return step();
			};

			/** Full walk for one session → { rows, stalled }. */
			var loadFullRows = function (sessionId) {
				return loadFullRowsRpc(sessionId).then(function (rows) {
					if (rows !== null) return { rows: rows, stalled: false };
					return loadFullRowsSnapshot(sessionId);
				});
			};

			// Live tail: re-read the tail page (RPC) or the current window
			// (snapshot fallback) and merge (covers new + updated recent messages).
			var refreshTail = function (sessionId, previous) {
				return fetchHistory(sessionId, void 0).then(function (page) {
					if (page !== null) return mergeRows(previous, rowsFromEvents(page.events));
					return readRows(sessionId).then(function (snap) {
						return snap === null ? previous : mergeRows(previous, snap.rows);
					});
				});
			};

			var scrollToBottomIf = function (rows, previousLen, force) {
				var rail = railRef.current;
				var nearBottom = rail === null ? true : rail.scrollHeight - rail.scrollTop - rail.clientHeight < 24;
				var grew = previousLen >= 0 && rows.length > previousLen;
				if (grew || nearBottom || force) {
					requestAnimationFrame(function () {
						var el = railRef.current;
						if (el !== null) el.scrollTop = el.scrollHeight;
					});
				}
			};

			react.useEffect(function () {
				// Switching sessions must not show the previous session's bars: clear
				// immediately, then fetch the new session's full history.
				setMessageRows(null);
				if (currentId === void 0) {
					setMessageRows([]);
					return;
				}
				var disposed = false;
				var rebuild = function () {
					loadFullRows(currentId).then(function (result) {
						if (disposed) return;
						fullWalkStalledRef.current = result.stalled;
						setMessageRows(result.rows);
						prevLenRef.current = result.rows.length;
						scrollToBottomIf(result.rows, -1, true);
					});
				};
				rebuild();
				// Live updates: debounced tail refetch merged into the full list.
				var onLive = function () {
					if (tailTimerRef.current !== null) clearTimeout(tailTimerRef.current);
					tailTimerRef.current = setTimeout(function () {
						tailTimerRef.current = null;
						// Fallback-only recovery: the last full walk could not finish
						// because the window was not open yet — re-run it now that the
						// snapshot moved (it is open by now, or the next event re-runs).
						if (fullWalkStalledRef.current) {
							loadFullRows(currentId).then(function (result) {
								if (disposed) return;
								fullWalkStalledRef.current = result.stalled;
								setMessageRows(result.rows);
								prevLenRef.current = result.rows.length;
								scrollToBottomIf(result.rows, -1, false);
							});
							return;
						}
						setMessageRows(function (previous) {
							var rows = previous === null ? [] : previous;
							refreshTail(currentId, rows).then(function (next) {
								if (disposed) return;
								prevLenRef.current = rows.length;
								setMessageRows(next);
								scrollToBottomIf(next, rows.length, false);
							});
							return previous;
						});
					}, 250);
				};
				var unsubscribe = subscribeSession(currentId, onLive);
				return function () {
					disposed = true;
					if (tailTimerRef.current !== null) {
						clearTimeout(tailTimerRef.current);
						tailTimerRef.current = null;
					}
					unsubscribe();
				};
			}, [currentId]);

			// Hovering a bar shows its preview; moving away hides it; clicking jumps.
			var hoverBar = function (row, event) {
				setHoverKey(row.key);
				setAnchor(event.currentTarget.getBoundingClientRect());
			};
			var leaveBar = function () {
				setHoverKey(null);
				setAnchor(null);
				setPos(null);
			};
			var clickBar = function (row) {
				// If the message is not yet inside the conversation's loaded window
				// (no DOM anchor), load older pages until it is, then scroll to it.
				if (scrollToKey(row.key)) return;
				var tries = 0;
				var attempt = function () {
					if (scrollToKey(row.key)) return;
					if (tries >= 60 || currentId === void 0) return;
					tries++;
					loadOlder(currentId).then(function () {
						requestAnimationFrame(attempt);
					});
				};
				attempt();
			};

			// Adaptive preview placement: render the card (hidden), measure it, then
			// clamp it inside the viewport — prefer right of the bar, flip to the left
			// when it would overflow, and shift up when it would overflow the bottom.
			react.useEffect(function () {
				if (anchor === null || hoverKey === null) return;
				var raf = requestAnimationFrame(function () {
					var card = previewRef.current;
					if (card === null) return;
					var rect = anchor;
					var cardRect = card.getBoundingClientRect();
					var vw = window.innerWidth;
					var vh = window.innerHeight;
					var gap = 8;
					var left = rect.right + gap;
					if (left + cardRect.width > vw - gap) {
						left = rect.left - gap - cardRect.width;
						if (left < gap) left = gap;
					}
					var top = rect.top;
					if (top + cardRect.height > vh - gap) {
						top = vh - gap - cardRect.height;
						if (top < gap) top = gap;
					}
					setPos({ left: Math.round(left), top: Math.round(top) });
				});
				return function () {
					if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
				};
			}, [anchor, hoverKey]);

			var hoveredRow = null;
			if (hoverKey !== null && messageRows !== null) {
				for (var i = 0; i < messageRows.length; i++) {
					if (messageRows[i].key === hoverKey) { hoveredRow = messageRows[i]; break; }
				}
			}

			return jsxs("div", {
				ref: railRef,
				className: C.rail,
				"data-history-rail": true,
				children: [
					jsx("div", {
						className: C.bars,
						children: messageRows !== null && messageRows.map(function (row) {
							var selected = hoverKey === row.key;
							return jsx("button", {
								type: "button",
								key: row.key,
								className: C.bar,
								"data-kind": row.kind,
								"data-selected": selected ? "" : void 0,
								"aria-label": row.kind === "user" ? t("role.user") : t("role.assistant"),
								onMouseEnter: function (event) { hoverBar(row, event); },
								onMouseLeave: leaveBar,
								onClick: function () { clickBar(row); },
								children: null
							});
						})
					}),
					anchor !== null && hoveredRow !== null && jsx("div", {
						ref: previewRef,
						className: C.preview,
						style: pos === null
							? { left: (anchor.right + 8) + "px", top: anchor.top + "px", visibility: "hidden" }
							: { left: pos.left + "px", top: pos.top + "px" },
						role: "tooltip",
						children: [
							jsxs("div", {
								className: C.previewMeta,
								children: [
									jsx("span", {
										className: C.previewRole,
										children: hoveredRow.kind === "user" ? t("role.user") : t("role.assistant")
									}),
									typeof hoveredRow.time === "number" && jsx("span", {
										className: C.previewTime,
										children: relativeTime(hoveredRow.time, Date.now(), t)
									})
								]
							}),
							jsx("div", {
								className: C.previewText,
								children: hoveredRow.text !== "" ? hoveredRow.text : (hoveredRow.kind === "user" ? t("role.user") : t("role.assistant"))
							})
						]
					})
				]
			});
		}
		//#endregion

		//#region entry
		var inject = ["slots", "sessions", "workspaces", "locale"];

		/**
		 * Register the message rail into the host layout's `shell.history` slot
		 * (declared by the patched dsh-client-ui-layout). Injected actions close
		 * over the client root ctx.
		 * @param {object} ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(function () {
				return ctx.locale.register(NS, { zh: zh, en: en });
			}, "dsh-msgrail: dictionaries");
			ctx.slots.inject("shell.history", function () {
				return ctx.slots.register({
					name: "shell.history",
					id: "dsh-msgrail",
					locale: NS,
					inject: function () {
						return {
							subscribeSession: function (sessionId, fn) {
								var session = ctx.sessions.binding(sessionId)?.session;
								return session === void 0 ? function () {} : session.subscribe(fn);
							},
							loadOlder: function (sessionId) {
								var session = ctx.sessions.binding(sessionId)?.session;
								if (session === void 0) return Promise.resolve();
								return Promise.resolve(session.loadOlder());
							},
							// Paginated session-log RPC (primary). `session.history`
							// is type-private on the session face but present at runtime
							// in rc.7/rc.8; guarded so a future release degrades to the
							// snapshot fallback instead of throwing.
							fetchHistory: function (sessionId, beforeSeq) {
								var session = ctx.sessions.binding(sessionId)?.session;
								if (session === void 0 || typeof session.history !== "function") {
									return Promise.resolve(null);
								}
								return session.history(
									beforeSeq === void 0 ? { maxMessages: 200 } : { beforeSeq: beforeSeq, maxMessages: 200 }
								).then(function (envelope) {
									if (envelope === null || envelope === void 0) return null;
									var result = envelope.result;
									if (result === null || result === void 0 || !result.ok) return null;
									return result.value;
								});
							},
							// Conversation-snapshot read (fallback data path).
							readRows: function (sessionId) {
								var session = ctx.sessions.binding(sessionId)?.session;
								if (session === void 0 || typeof session.getSnapshot !== "function") {
									return Promise.resolve({ rows: [], hasMore: false, openState: "cold" });
								}
								var snapshot = session.getSnapshot();
								return Promise.resolve({
									rows: rowsFromSnapshot(snapshot),
									hasMore: snapshot.hasMore === true,
									openState: snapshot.openState
								});
							}
						};
					}
				}, MessageRail);
			});
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
