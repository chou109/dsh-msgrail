/**
 * dsh-msgrail — browser half (client bundle), DSH 0.2.x.
 *
 * A compact FULL-HISTORY MESSAGE RAIL for the current conversation: one thin
 * tick per message YOU sent, docked in the ambient strip below the composer
 * (`conversation.composer.dock`). Hover a tick for an attached preview (role +
 * text + time); click to jump to that message's region of the transcript.
 *
 * Why here: DSH 0.2 removed the patched `shell.history` track that the 1.x
 * rail occupied, and the new conversation shell owns its own turn rail. The
 * additive session-scoped dock is the seat the shell allocates for ambient
 * conversation widgets, and it also supplies `sessionId` directly, so the rail
 * no longer has to guess the current session.
 *
 * Data path (0.2.x): `ctx.sessions.binding(sessionId).eventSource` is an
 * `ObservableSnapshot<SessionEventWindow>` over the loaded window;
 * `session.loadOlder()` grows that window. The rail pages the WHOLE history
 * itself (bounded) so old messages appear in the index before the chat has
 * loaded them, then keeps the tail live through the same subscription.
 */
window.__ModuleLoader__.load({
	id: "dsh-msgrail",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var h = react.createElement;

		//#region locale
		var NS = "dsh-msgrail";
		var zh = {
			"rail.label": "消息索引",
			"rail.empty": "当前会话还没有你发送的消息",
			"role.user": "你",
			"time.justNow": "刚刚",
			"time.minutesAgo": "{n} 分钟前",
			"time.hoursAgo": "{n} 小时前",
			"time.daysAgo": "{n} 天前",
			"action.jump": "跳转到这条消息",
			"action.jumpApprox": "跳转到这条消息附近"
		};
		var en = {
			"rail.label": "Message index",
			"rail.empty": "No message of yours in this conversation yet",
			"role.user": "You",
			"time.justNow": "just now",
			"time.minutesAgo": "{n} min ago",
			"time.hoursAgo": "{n} h ago",
			"time.daysAgo": "{n} d ago",
			"action.jump": "Jump to this message",
			"action.jumpApprox": "Jump near this message"
		};
		//#endregion

		//#region styles
		var css = [
			".dsh-mg-root{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;min-height:16px;padding:2px 2px 0;color:var(--dsw-alias-label-tertiary)}",
			".dsh-mg-grip{flex:none;width:14px;height:2px;border-radius:1px;background:var(--dsw-alias-label-tertiary);opacity:.45}",
			".dsh-mg-scroll{flex:1;min-width:0;display:flex;align-items:center;gap:4px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;padding:4px 2px}",
			".dsh-mg-scroll::-webkit-scrollbar{display:none}",
			".dsh-mg-tick{flex:none;box-sizing:border-box;width:9px;height:3px;border:0;border-radius:1px;padding:0;background:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));opacity:.45;cursor:pointer;transition:width .12s ease,background .12s ease,opacity .12s ease}",
			".dsh-mg-tick:hover{opacity:.95;background:var(--dsw-alias-label-secondary);width:14px}",
			".dsh-mg-tick[data-selected]{width:16px;opacity:1;background:var(--dsw-alias-label-primary)}",
			".dsh-mg-count{flex:none;font-size:11px;line-height:14px;font-variant-numeric:tabular-nums;opacity:.75}",
			".dsh-mg-empty{flex:1;font-size:11px;line-height:14px;text-align:center;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".dsh-mg-preview{z-index:60;box-sizing:border-box;position:fixed;width:250px;max-width:calc(100vw - 24px);max-height:220px;overflow:hidden;padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv2);font-family:inherit;display:flex;flex-direction:column;gap:5px}",
			".dsh-mg-meta{display:flex;align-items:center;gap:8px}",
			".dsh-mg-role{flex:none;font-size:11px;line-height:14px;font-weight:600;color:var(--dsw-alias-label-secondary)}",
			".dsh-mg-time{font-size:11px;line-height:14px;color:var(--dsw-alias-label-tertiary)}",
			".dsh-mg-text{font-size:12px;line-height:18px;word-break:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical}"
		].join("");
		var cssTagId = "dsh-msgrail/rail.css";
		//#endregion

		//#region helpers
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
				} else if (block.type === "image") {
					parts.push("[图片]");
				} else if (block.type === "file") {
					parts.push("[文件]");
				}
			}
			return parts.join(" ").replace(/\s+/g, " ").trim();
		}

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

		/** Only the user's own appended messages become ticks. */
		function rowFromEvent(event) {
			if (event === null || event === void 0) return null;
			if (event.type !== "user/message") return null;
			if (event.surfaceOp !== "append") return null;
			var data = event.data || {};
			var source = data.source;
			if (source === null || source === void 0 || source.kind !== "user") return null;
			return {
				id: String(data.id),
				seq: event.seq,
				time: event.time,
				text: blockText(data.content)
			};
		}

		function rowsFromEntries(entries) {
			var out = [];
			if (!Array.isArray(entries)) return out;
			for (var i = 0; i < entries.length; i++) {
				var entry = entries[i];
				if (entry === null || entry === void 0) continue;
				if (entry.type !== "event") continue;
				var row = rowFromEvent(entry.event);
				if (row !== null) out.push(row);
			}
			return out;
		}

		function mergeRows(current, incoming) {
			var byId = new Map();
			if (Array.isArray(current)) for (var i = 0; i < current.length; i++) byId.set(current[i].id, current[i]);
			if (Array.isArray(incoming)) for (var j = 0; j < incoming.length; j++) byId.set(incoming[j].id, incoming[j]);
			var out = Array.from(byId.values());
			out.sort(function (a, b) { return a.seq - b.seq; });
			return out;
		}

		/** The transcript scrollport the shell renders; used only to scroll, never to measure placement. */
		function transcriptScroller() {
			return document.querySelector("[data-conversation-scroll]");
		}

		function scrollToFraction(fraction) {
			var scroller = transcriptScroller();
			if (scroller === null) return false;
			var max = scroller.scrollHeight - scroller.clientHeight;
			if (!(max > 0)) return false;
			var top = Math.max(0, Math.min(max, fraction * max));
			if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top: top, behavior: "smooth" });
			else scroller.scrollTop = top;
			return true;
		}
		//#endregion

		//#region component
		/**
		 * Horizontal full-history rail. Props: `sessionId` (session scope), the
		 * localized `t`, and injected history accessors closing over the client
		 * root ctx.
		 */
		function MessageRail(props) {
			var sessionId = props.sessionId;
			var t = props.t;
			var readWindow = props.readWindow;
			var loadOlder = props.loadOlder;
			var subscribe = props.subscribe;

			var rowsState = react.useState([]);
			var rows = rowsState[0];
			var setRows = rowsState[1];
			var hoverState = react.useState(null);
			var hoverId = hoverState[0];
			var setHoverId = hoverState[1];
			var anchorState = react.useState(null);
			var anchor = anchorState[0];
			var setAnchor = anchorState[1];
			var posState = react.useState(null);
			var pos = posState[0];
			var setPos = posState[1];
			var busyState = react.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];

			var scrollRef = react.useRef(null);
			var previewRef = react.useRef(null);
			var timerRef = react.useRef(null);
			var pinnedRef = react.useRef(true);

			var pinToEnd = function (force) {
				if (!force && !pinnedRef.current) return;
				requestAnimationFrame(function () {
					var el = scrollRef.current;
					if (el !== null) el.scrollLeft = el.scrollWidth;
				});
			};

			react.useEffect(function () {
				setRows([]);
				setHoverId(null);
				if (!sessionId) return;
				var disposed = false;

				var mergeWindow = function (previous) {
					var page = readWindow(sessionId);
					if (page === null) return { rows: previous, hasMore: false };
					return { rows: mergeRows(previous, page.rows), hasMore: page.hasMore };
				};

				// Grow the loaded window until the complete history is indexed
				// (bounded so a pathological log cannot stall the UI).
				var walk = async function () {
					var state = mergeWindow([]);
					var guard = 0;
					var seen = state.rows.length;
					while (!disposed && state.hasMore && guard++ < 80) {
						await loadOlder(sessionId);
						if (disposed) return;
						var next = mergeWindow(state.rows);
						state = next;
						if (!next.hasMore) break;
						if (next.rows.length === seen) {
							await new Promise(function (resolve) { setTimeout(resolve, 40); });
						}
						seen = next.rows.length;
					}
					if (disposed) return;
					setRows(state.rows);
					pinToEnd(true);
				};

				var onLive = function () {
					if (timerRef.current !== null) clearTimeout(timerRef.current);
					timerRef.current = setTimeout(function () {
						timerRef.current = null;
						if (disposed) return;
						setRows(function (previous) {
							var page = readWindow(sessionId);
							return page === null ? previous : mergeRows(previous, page.rows);
						});
						pinToEnd(false);
					}, 220);
				};

				walk();
				var unsubscribe = subscribe(sessionId, onLive);
				return function () {
					disposed = true;
					if (timerRef.current !== null) {
						clearTimeout(timerRef.current);
						timerRef.current = null;
					}
					unsubscribe();
				};
			}, [sessionId]);

			react.useEffect(function () {
				pinToEnd(false);
			}, [rows.length]);

			react.useEffect(function () {
				if (anchor === null || hoverId === null) return;
				var raf = requestAnimationFrame(function () {
					var card = previewRef.current;
					if (card === null) return;
					var rect = anchor;
					var cardRect = card.getBoundingClientRect();
					var vw = window.innerWidth;
					var vh = window.innerHeight;
					var gap = 10;
					var left = rect.left + rect.width / 2 - cardRect.width / 2;
					if (left + cardRect.width > vw - gap) left = vw - gap - cardRect.width;
					if (left < gap) left = gap;
					var top = rect.top - gap - cardRect.height;
					if (top < gap) top = rect.bottom + gap;
					if (top + cardRect.height > vh - gap) top = vh - gap - cardRect.height;
					setPos({ left: Math.round(left), top: Math.round(top) });
				});
				return function () {
					if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
				};
			}, [anchor, hoverId]);

			var hovered = null;
			for (var i = 0; i < rows.length; i++) {
				if (rows[i].id === hoverId) { hovered = rows[i]; break; }
			}

			var onClick = function (row, index) {
				if (busy) return;
				setBusy(true);
				var fraction = rows.length <= 1 ? 1 : (index + 0.5) / rows.length;
				var attempt = function (remaining) {
					if (scrollToFraction(fraction) || remaining <= 0) {
						setBusy(false);
						return;
					}
					loadOlder(sessionId).then(function () {
						requestAnimationFrame(function () { attempt(remaining - 1); });
					}).catch(function () { setBusy(false); });
				};
				// Jumping far back needs the transcript to actually hold the rows.
				if (fraction < 0.98) attempt(12);
				else { scrollToFraction(1); setBusy(false); }
			};

			var ticks = rows.map(function (row, index) {
				var selected = hoverId === row.id;
				return h("button", {
					key: row.id,
					type: "button",
					className: "dsh-mg-tick",
					"data-selected": selected ? "" : void 0,
					"aria-label": row.text !== "" ? row.text.slice(0, 80) : t("role.user"),
					title: t("action.jump"),
					onMouseEnter: function (event) {
						setHoverId(row.id);
						setAnchor(event.currentTarget.getBoundingClientRect());
					},
					onMouseLeave: function () {
						setHoverId(null);
						setAnchor(null);
						setPos(null);
					},
					onFocus: function (event) {
						setHoverId(row.id);
						setAnchor(event.currentTarget.getBoundingClientRect());
					},
					onBlur: function () {
						setHoverId(null);
						setAnchor(null);
						setPos(null);
					},
					onClick: function () { onClick(row, index); },
				});
			});

			var children = [
				h("div", { className: "dsh-mg-grip", key: "grip", "aria-hidden": true }),
				rows.length === 0
					? h("div", { className: "dsh-mg-empty", key: "empty" }, t("rail.empty"))
					: h("div", { className: "dsh-mg-scroll", key: "scroll", ref: scrollRef, role: "list", "aria-label": t("rail.label") }, ticks),
			];
			if (rows.length > 0) children.push(h("div", { className: "dsh-mg-count", key: "count", "aria-hidden": true }, String(rows.length)));

			var rail = h("div", { className: "dsh-mg-root", "data-msgrail-rail": true, "aria-busy": busy ? "true" : void 0 }, children);
			if (anchor === null || hovered === null) return rail;

			return h(react.Fragment, null, rail, h("div", {
				ref: previewRef,
				className: "dsh-mg-preview",
				role: "tooltip",
				style: pos === null
					? { left: anchor.left + "px", top: anchor.top + "px", visibility: "hidden" }
					: { left: pos.left + "px", top: pos.top + "px" },
			}, [
				h("div", { className: "dsh-mg-meta", key: "meta" }, [
					h("span", { className: "dsh-mg-role", key: "role" }, t("role.user")),
					typeof hovered.time === "number"
						? h("span", { className: "dsh-mg-time", key: "time" }, relativeTime(hovered.time, Date.now(), t))
						: null,
				]),
				h("div", { className: "dsh-mg-text", key: "text" }, hovered.text !== "" ? hovered.text : t("role.user")),
			]));
		}
		//#endregion

		//#region entry
		var inject = ["slots", "sessions", "locale"];

		function apply(ctx) {
			ctx.effect(function () {
				if (typeof document === "undefined") return function () {};
				if (document.querySelector("style[data-plugin-css=" + JSON.stringify(cssTagId) + "]") !== null) return function () {};
				var tag = document.createElement("style");
				tag.dataset.plugin = "dsh-msgrail";
				tag.dataset.pluginCss = cssTagId;
				tag.textContent = css;
				document.head.appendChild(tag);
				return function () { tag.remove(); };
			}, "dsh-msgrail: styles");

			ctx.effect(function () {
				return ctx.locale.register(NS, { zh: zh, en: en });
			}, "dsh-msgrail: dictionaries");

			var withBinding = function (sessionId, operation, fallback) {
				var binding = ctx.sessions.binding(sessionId);
				if (binding === void 0) return fallback;
				try { return operation(binding); } catch (error) { return fallback; }
			};

			ctx.slots.inject("conversation.composer.dock", function () {
				return ctx.slots.register({
					name: "conversation.composer.dock",
					id: "dsh-msgrail",
					order: 5,
					locale: NS,
					inject: function () {
						return {
							readWindow: function (sessionId) {
								return withBinding(sessionId, function (binding) {
									var eventWindow = binding.eventSource.getSnapshot();
									return { rows: rowsFromEntries(eventWindow.entries), hasMore: eventWindow.hasMore === true };
								}, null);
							},
							loadOlder: function (sessionId) {
								return withBinding(sessionId, function (binding) {
									return Promise.resolve(binding.session.loadOlder()).catch(function () {});
								}, Promise.resolve());
							},
							subscribe: function (sessionId, listener) {
								return withBinding(sessionId, function (binding) {
									return binding.eventSource.subscribe(listener);
								}, function () {});
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
