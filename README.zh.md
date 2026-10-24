# MsgRail（dsh-msgrail）— v2.0.0，适配 DeepSeek Harness 0.2.x

> **MsgRail（消息轨道）**——[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的全量消息轨道插件：在当前会话输入框下方的环境区，为你发送的每条消息显示一根细刻度。悬停看预览，点击跳转到对话中的对应位置。插件会自行分页加载**完整历史**，连聊天窗口还没加载的旧消息也会进入索引。
>
> English: [README.md](README.md)

---

## 当前状态：2.0.0（DSH 0.2.x）

| 项目 | 说明 |
|---|---|
| 插件 | `dsh-msgrail` 2.0.0 |
| 宿主 | DeepSeek Harness **0.2.1-rc.2**（桌面版或 `dsh web`） |
| 层级 | 纯客户端（Host 半只负责生成一条 Loader 记录） |
| 许可 | MIT |

### 相对 1.x 的变化

1.x 通过补丁修改 `@deepseek-ai/dsh-client-ui-layout`，在布局里加一条 `shell.history` 网格列。DSH 0.2 的客户端包全部改为动态 bundle，旧补丁不再适用。2.0 改用官方 slot API：

| 1.x | 2.0.0 |
|---|---|
| 补丁新增 `shell.history` 槽位 | `conversation.composer.dock`（可叠加、会话作用域） |
| 对话左侧的竖向轨道 | 输入框下方的横向刻度条 |
| 用 `sessions.current` 猜当前会话 | 槽位直接提供 `sessionId` |
| `session.history({beforeSeq})` RPC + 快照兜底 | `ctx.sessions.binding(id).eventSource` + `session.loadOlder()` |
| 点击依赖 `[data-chat-anchor-key]` | 在 `[data-conversation-scroll]` 内按比例跳转 |
| 依赖 `dsh-client-ui-primitives` | 不再引用 primitives，图标与样式全部内置 |

DSH 0.2 本身在对话右侧已有一条“回合导航轨”。MsgRail 与它定位不同：索引的是**整段历史里你发的消息**，而不是已加载窗口里的回合。

---

## 功能

- **全量历史索引**：切换会话后在后台分页读取完整持久化日志（`loadOlder()`），有上限保护；随后通过会话事件订阅保持尾部实时更新。
- **悬停预览**：显示角色、相对时间和最多六行正文，并自动限制在视口内。
- **点击跳转**：按该消息在历史中的位置比例滚动对话。注意这是**近似跳转**——0.2 不再向插件暴露每条消息的稳定 DOM 锚点。
- **实时、双语**：新消息即时出现；文案通过 `ctx.locale` 注册（中/英）。
- **主题一致**：只使用 `--dsw-alias-*` 主题变量。

## 安装

### 方式一：插件管理器（桌面版）

本包是标准 bundle（`dsh.bundle.patch` → `cordis.patch.yml`）。在插件管理器里选择“从文件夹安装”，指向本目录，然后启用 `dsh-msgrail`。

### 方式二：命令行

```bash
dsh plugin --profile <profile> add /absolute/path/to/dsh-msgrail
```

### 方式三：手动写入 profile patch

把包安装/链接进 profile 的 `node_modules`，再在 `cordis.patch.yml` 追加：

```yaml
- insert:
    - id: msgrail
      name: 'dsh-msgrail'
```

安装后刷新页面即可，不需要修改任何宿主文件。

## 验证

1. 打开一个至少包含一条你发送的消息的会话。
2. 输入框正下方出现一条细刻度带，右侧显示条数。
3. 悬停刻度 → 出现预览卡片；点击刻度 → 对话滚动。
4. 切换会话 → 刻度带按新会话重建。
5. 设置 → 通用 → 语言（中/英）切换后，预览文案随之更新。

## 已知限制

- **近似跳转**：0.2 的对话没有向插件暴露单条消息的稳定锚点，所以只能按比例定位。
- **分页上限**：首次遍历最多 80 页 `loadOlder()`；更长的会话保留最近约 80 页的索引。
- **纯客户端**：没有 Agent 工具、没有宿主路由、没有配置项。

## 卸载

在插件管理器中停用，或删除 `cordis.patch.yml` 里的 `insert` 块，然后刷新页面。

## 仓库结构

```
lib/index.js    Host 半：最小 Loader 记录（客户端发现需要它）
lib/client.js   浏览器 bundle：轨道组件、样式、文案、数据通路
package.json    dsh.bundle.patch + dsh.client 声明
cordis.patch.yml
```

## 开发

浏览器半是普通 JavaScript（ES5 兼容），使用
`window.__ModuleLoader__.load({ id, factory })` 协议，只依赖 `react` 和
`inject` 里声明的服务。语法检查：

```bash
node --check lib/client.js
```

## 许可证

MIT。
