# MsgRail（dsh-msgrail）— v2.0.0 for DeepSeek Harness 0.2.x

> **MsgRail** is a compact **full-history message rail** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): one thin tick per message **you** sent in the current conversation, docked in the ambient strip below the composer. Hover a tick to preview the message, click to jump into that part of the transcript. The rail indexes the whole history — messages the chat has not loaded yet included.
>
> **MsgRail（消息轨道）**——DeepSeek Harness 的全量消息轨道插件：在当前会话的输入框下方，为你发送的每条消息显示一根细刻度；悬停预览、点击跳转；插件自行分页加载完整历史，聊天窗口还没加载的旧消息也会出现在索引里。
>
> 中文文档见 [README.zh.md](README.zh.md)。

---

## Status: 2.0.0 (DSH 0.2.x)

| | |
|---|---|
| Plugin | `dsh-msgrail` 2.0.0 |
| Harness | DeepSeek Harness **0.2.1-rc.2** (Desktop or `dsh web`) |
| Layer | Client only (the Host half exists only to create a Loader row) |
| License | MIT |

### What changed from 1.x

1.x patched `@deepseek-ai/dsh-client-ui-layout` to add a `shell.history` grid column. DSH 0.2 builds every client package as a dynamic bundle, so that patch no longer applies. Version 2 registers through the documented slot API instead:

| 1.x | 2.0.0 |
|---|---|
| `shell.history` slot added by a layout patch | `conversation.composer.dock` (additive, session-scoped) |
| Vertical rail left of the chat | Horizontal tick strip below the composer |
| Current session guessed from `sessions.current` | `sessionId` supplied by the session-scoped slot |
| `session.history({beforeSeq})` RPC + snapshot fallback | `ctx.sessions.binding(id).eventSource` + `session.loadOlder()` |
| Click used `[data-chat-anchor-key]` | Proportional jump inside `[data-conversation-scroll]` |
| Imported `@deepseek-ai/dsh-client-ui-primitives` | No primitives import; local SVG/CSS only |

DSH 0.2 also ships its own turn rail on the right of the transcript. MsgRail is deliberately different: it indexes **user messages across the full history**, not turns in the loaded window.

---

## What it does

- **Full-history index.** On session switch the rail pages the entire durable log in the background (`loadOlder()`), bounded so a pathological log cannot stall the UI, then keeps the tail live through the session event subscription.
- **Hover preview.** Role, relative time and up to six lines of the message, clamped inside the viewport.
- **Click to jump.** Scrolls the transcript toward the message's position in the history. Jumping is *approximate*: DSH 0.2 removed the stable per-message DOM anchors, so the rail maps the tick's ordinal onto the transcript scroll range.
- **Live and localized.** New messages appear as the session grows; UI copy is registered through `ctx.locale` (zh + en).
- **Theme-native.** Uses `--dsw-alias-*` tokens only.

## Install

### 1. Plugin Manager (Desktop)

The package is a bundle (`dsh.bundle.patch` → `cordis.patch.yml`). Point the Plugin Manager's “install from folder” at this directory and enable `dsh-msgrail`.

### 2. CLI

```bash
dsh plugin --profile <profile> add /absolute/path/to/dsh-msgrail
```

### 3. Profile patch (manual)

Install/link the package into the profile's `node_modules`, then add to `cordis.patch.yml`:

```yaml
- insert:
    - id: msgrail
      name: 'dsh-msgrail'
```

Reload the page after installation. Nothing else is patched.

## Verify

1. Open a conversation with at least one message from you.
2. A thin strip with one tick per message appears directly below the composer; the count is shown at the right.
3. Hover a tick → preview card; click a tick → transcript scrolls.
4. Switch sessions → the strip rebuilds for the new session.
5. Settings → General → Locale switch (zh/en) updates the preview labels.

## Limitations

- **Approximate jumps.** Exact per-message scrolling needs a stable anchor that the 0.2 conversation no longer exposes to plugins.
- **Bounded paging.** The initial walk stops after 80 `loadOlder()` pages; a session longer than that keeps the newest ~80 pages indexed.
- **Client-only.** No agent tools, no host routes, no configuration.

## Uninstall

Remove the `msgrail` row (Plugin Manager → disable, or delete the `insert` block) and reload.

## Repository layout

```
lib/index.js    Host half: minimal Loader row (client discovery needs it)
lib/client.js   Browser bundle: rail component, styles, locale, data path
package.json    dsh.bundle.patch + dsh.client declaration
cordis.patch.yml
```

## Development

The browser half is plain ES5-compatible JavaScript using
`window.__ModuleLoader__.load({ id, factory })`. It requires only `react` and the
session/locale/slot services listed in `inject`. Syntax check with:

```bash
node --check lib/client.js
```

## License

MIT.
