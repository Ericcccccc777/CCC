<div align="center">

# CLI Coding Cockpit

**A Dynamic-Island-style macOS overlay for Claude Code CLI, Codex CLI, and DeepSeek API sessions — drag-to-reposition, live status, permission popups, model switching.**

Live model + context + usage at the top of your screen · drag-to-reposition · one-click model switching · API provider support · phone mirror · sleep/wake recovery.

[![macOS](https://img.shields.io/badge/macOS-14%2B-black?logo=apple)](#download-mac-binary)
[![Version](https://img.shields.io/badge/version-0.1.1--beta-orange)](#whats-new-in-011)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron%2030-47848F?logo=electron)](https://www.electronjs.org/)

[**⬇️ Download for macOS (Apple Silicon)**](releases/CCC-0.1.1-mac-arm64.dmg) · [**⬇️ Download for macOS (Intel)**](releases/CCC-0.1.1-mac-x64.dmg)

[English](#english) · [中文](#中文) · [한국어](#한국어)

<sub>*Formerly known as **Claude Code Controller**.*</sub>

</div>

---

<a id="english"></a>

## English

### What is CCC?

**CLI Coding Cockpit** (CCC for short) is a desktop helper for developers who use **Claude Code CLI**, **Codex CLI**, or any third-party API provider as their daily coding companion. It puts a small always-on-top "pill" at the top-center of your screen that shows, in real time:

- **Active model** (Sonnet / Opus / Haiku / DeepSeek / Codex)
- **Context window usage %**
- **5-hour and 7-day rolling rate-limit usage**
- **Live lifecycle state**: streaming · waiting · question pending · done
- **Permission popups** for tool use (Bash / Edit / Read / etc.) — answer Yes / Always / No from the overlay
- **AskUserQuestion popups** — Claude's structured questions render with clickable options
- **Per-session token + USD cost** for API-mode sessions
- **Balance + weekly spend** for third-party providers like DeepSeek

If you've ever switched terminals 50 times a day to check "is Claude still working?" — that's the problem CCC solves.

### Who is this for?

CCC is built for the **CLI-curious vibe-coder** — developers who want to use Claude Code / Codex CLI but find the terminal feedback loop too sparse:

- 🟢 **Beginners** who can't tell if Claude is thinking or stuck
- 🟢 **Power users** managing 3+ CLI sessions in parallel and losing track
- 🟢 **Teams** that want shared visibility into AI usage and cost without each member writing wrapper scripts
- 🔮 **Enterprise** (roadmap) — fleet dashboards, team-wide model policies, audit logs

### Features at a glance

| Area | What it does |
|---|---|
| **Always-on-top pill** | Floating overlay at top-center of primary display; click-through except over CCC chrome |
| **Drag-to-reposition** | Long-press the pill → drag to one of three snap zones: **top-left circle** (corner mode), **top-center thin strip** (auto-hide mode), or **top-center pill** (default position). Hover over the strip to peek; click the circle to expand |
| **Live session state** | Streaming · waiting · question · done — driven by Claude Code's own hooks for Claude sessions and the rollout-JSONL watcher for Codex sessions |
| **Model picker** | One-click switch between Sonnet 4.6 / Opus 4.7 / Haiku 4.5 — sends `/model <alias>` into the active session |
| **Permission popups (actually gate the tool)** | Bash / Edit / Read / Write tool requests pop a tiny **Yes / Always / No** prompt. CCC's hook writes a `permissionDecision` JSON to stdout so Claude Code honors the user's choice — Deny actually denies, Allow runs the tool exactly once, **Always** remembers per-session. Parallel tool calls queue up and the user answers each one |
| **AskUserQuestion UI** | Structured questions render with clickable option buttons; textarea reply when no options |
| **Per-mode popup behavior** | In hide / corner modes, informational popups (done / message) auto-suppress to avoid pill takeover. Actionable popups (permission with Yes/No/Always) always render so the user can respond. Corner mode adds a click-to-dismiss "我知道了" affordance |
| **API provider support** | Configure DeepSeek (or other Anthropic-compatible endpoints); spawn API-mode sessions that talk to a third-party endpoint via env injection |
| **Per-session cost** | API mode tracks input/output tokens + USD cost per session |
| **Balance polling** | Third-party providers show their account balance and 7-day rolling spend |
| **Codex CLI support** | Codex sessions launch alongside Claude sessions, grouped separately. Streaming / done state now tracked via the Codex rollout-JSONL watcher |
| **Phone mirror** | One-click QR code → load the active session's transcript on your phone via LAN |
| **Sleep/wake recovery** | macOS sleep does not kill CCC-managed sessions; on wake they reattach automatically |
| **i18n** | UI in English / 中文 / 한국어 (switch in Settings) |

### What's new in 0.1.1

This release closes most of the in-the-wild rough edges discovered after the 0.1.0 cut:

- **🎯 Permission popups actually gate the tool now.** Earlier, clicking "No" silently let Claude run the tool anyway because the hook only communicated via exit code. The hook now writes the explicit `{hookSpecificOutput:{permissionDecision}}` JSON to stdout per current Claude Code protocol — Yes / No / Always are authoritative.
- **🧱 Parallel permission queue.** When Claude makes parallel tool calls in one turn, multiple permission requests arrive together. They now queue inside CCC and surface one at a time so each can be answered individually. The server-side hook timeout extends to **120 s** so the queue has wall-clock room to clear.
- **🖱️ Drag the pill to three positions.** Long-press → drag to top-left (shrinks to a circle), top-center thin strip (auto-hides; hover the very top of the screen to peek), or top-center pill (default). The pill follows the cursor at the grab offset; drop outside any zone reverts.
- **🧊 Single full-width overlay window.** All non-drag modes now share one transparent BrowserWindow at workArea-width — eliminates the "white background around the corner circle" and resize-flicker artifacts that small transparent windows hit on macOS.
- **🔁 Codex CLI session monitoring.** Codex sessions now flip the pill icon to **streaming** / **done** automatically, driven by a tail watcher over Codex's rollout JSONL.
- **🧹 Corner-mode polish.** "Session complete" auto-hides after 3 s; in corner mode, clicking the circle while a permission banner / popup is showing dismisses it (single "I got it" affordance, doesn't re-arm until the next state change).
- **🚪 Quit confirmation.** Settings → Quit asks before tearing down all sessions.

If you ran 0.1.0 and saw "deny doesn't deny", "popup disappears with no effect", or "the corner circle has a white halo" — this build fixes those.

### Download (mac binary)

**The pre-built unsigned `.dmg` files are inside [`releases/`](releases/)**:

- 🍎 [**Apple Silicon (M1/M2/M3/M4)** — `CCC-0.1.1-mac-arm64.dmg`](releases/CCC-0.1.1-mac-arm64.dmg) · ~91 MB
- 🍎 [**Intel Mac** — `CCC-0.1.1-mac-x64.dmg`](releases/CCC-0.1.1-mac-x64.dmg) · ~96 MB

> ⚠️ **The DMG is unsigned.** macOS Gatekeeper will say *"Apple cannot verify CCC is free of malware"* on first launch. To run it:
> 1. Double-click the `.dmg`, drag `CCC.app` into `Applications`
> 2. **Right-click** the app in Finder → **Open** → confirm in the dialog
> 3. After that one-time bypass, normal double-click works
>
> Or, faster, run this once in Terminal:
> ```bash
> xattr -cr "/Applications/CCC.app"
> ```

After launch, CCC will ask for **Accessibility permission** (macOS Settings → Privacy & Security → Accessibility). Grant it — without this, model switching and message replies silently fail.

### Build from source (the保姆级 walkthrough)

If you'd rather build it yourself (or you're not on macOS), here's the full step-by-step. **No prior Electron experience required.**

#### 1. Prerequisites

Install these tools first. On macOS the easiest path is [Homebrew](https://brew.sh):

```bash
# Node 20+ (Node 22 also works)
brew install node@20

# pnpm 9+ (CCC uses pnpm, not npm)
npm install -g pnpm@9
```

Check versions:

```bash
node --version    # should print v20.x or v22.x
pnpm --version    # should print 9.x or 10.x
```

You also need at least one of:
- **Claude Code CLI** — install from https://docs.claude.com/claude-code
- **Codex CLI** — install from https://github.com/openai/codex

CCC detects whichever you have installed; you don't need both.

#### 2. Clone and install

```bash
git clone https://github.com/<YOUR-GITHUB-USERNAME>/ccc.git
cd ccc
pnpm install
```

The install will download Electron (~100 MB) and dev dependencies. First run takes 1–3 minutes.

#### 3. Run in dev mode

```bash
pnpm dev
```

A floating pill appears at the top-center of your primary monitor. Click it to expand and add your first session.

#### 4. Build your own DMG (optional)

```bash
pnpm package
```

Output goes into `packages/app/dist/`:

- `CCC-0.1.1-arm64.dmg` (Apple Silicon)
- `CCC-0.1.1.dmg` (Intel)

#### 5. Run tests + type-check (optional)

```bash
pnpm lint     # tsc --noEmit type check
pnpm test     # Vitest unit + component tests
```

### Configuring an API provider (DeepSeek as example)

CCC supports any **Anthropic-compatible** third-party API endpoint. DeepSeek is wired in by default. **You must provide your own key — CCC does not ship with any credentials.**

1. Click the pill to expand
2. Click the ⚙️ Settings icon (top-right of the expanded panel)
3. In the **API Providers** section, click **+ Add DeepSeek**
4. Paste your DeepSeek key (get one at https://platform.deepseek.com)
5. Click **Test** → wait for "Connected"
6. Click **Save** — the key is stored encrypted via Electron `safeStorage` (macOS Keychain on macOS)
7. Open the model picker — `DeepSeek v4-flash` and `DeepSeek v4-pro` chips appear next to the Claude models
8. Click one → CCC offers to either **Restart** the current session in API mode or **Open a new** session

API mode sessions show their token consumption + USD cost on the pill in real time.

### What's NOT in this version

A few things are intentionally out of the public release:

- ❌ **Harness Wizard** — a closed-source feature for scaffolding `CLAUDE.md` rule files; kept private as a future Pro tier
- ❌ **Bundled API keys** — you must bring your own provider credentials
- ❌ **Auto-update** — for now, re-download the DMG manually on each release
- ❌ **Code signing / notarization** — see the Gatekeeper note above

### Roadmap

- 🛣️ **Cloud sync** for session history and team dashboards
- 🛣️ **Windows binaries** (the code already supports Windows via the `PlatformAdapter` abstraction; the public binary is macOS-only at v0.1.0)
- 🛣️ **More provider integrations** (Together AI, Groq, OpenRouter)
- 🛣️ **Enterprise tier** with team policy + audit log

### ⚠️ Beta / Testing Release — Read Before Use

**CCC 0.1.1 is a beta build.** It works in our daily use but is **not yet feature-complete** and **will have bugs**.

- 🐞 **Bugs exist.** Especially around edge cases (rapid parallel tool calls, multi-monitor setups, certain Claude Code CLI version combinations, network hiccups during DeepSeek polling). If something breaks, please file an issue with the steps + your macOS + Claude Code version.
- 🔍 **Always double-check the CLI output.** CCC shows status icons (streaming / waiting / done) and surfaces tool permissions as popups — but the **terminal is still the source of truth**. Before trusting a "Session complete" indicator or clicking "Allow" on a permission popup, glance at the actual CLI output to confirm what Claude is doing.
- 🛡️ **You own every permission decision.** When you click "Yes" / "Always" on a Bash / Edit / Read popup, the underlying tool runs against your real filesystem with your real credentials. CCC is just the surface — the consequences are yours. Treat "Always" especially carefully.
- 💸 **API mode token costs are CCC's best estimate.** Cost/balance numbers come from your provider's API and CCC's pricing table — they're indicative, not billing-grade. Trust your provider's dashboard for the real number.
- 🚫 **Not signed / notarized** on macOS — first launch needs the Gatekeeper bypass above.
- 🪟 **No verified Windows build yet.** Code paths exist via `PlatformAdapter` but every shipped commit has only been manually verified on macOS. Windows users should build from source and report what works.

By using CCC you accept that it's an unfinished tool and that you remain responsible for verifying any AI-driven action it surfaces.

### Contributing

PRs welcome. Run `pnpm lint && pnpm test` green before opening a PR. The project uses Conventional Commits (`feat | fix | refactor | test | ci | docs | chore`) with scopes `app | infra`.

### License

[Apache License 2.0](LICENSE). You're free to use, fork, embed, and commercialize — see `LICENSE` for details.

---

<a id="中文"></a>

## 中文

### CCC 是什么？

**CLI Coding Cockpit**（简称 **CCC**）是一个为 **Claude Code CLI**、**Codex CLI** 以及任何第三方 API provider 用户设计的桌面辅助工具。它在你屏幕顶部中央常驻一个小"灵动岛"风格的悬浮条，实时显示：

- **当前模型**（Sonnet / Opus / Haiku / DeepSeek / Codex）
- **上下文窗口使用百分比**
- **5 小时 / 7 天滚动用量**
- **会话生命周期状态**：正在响应 · 等待输入 · 有问题 · 完成
- **工具权限弹窗**（Bash / Edit / Read 等）—— 在悬浮条上直接 Yes / Always / No
- **AskUserQuestion 结构化提问** —— Claude 抛出的选择题以可点击选项形式呈现
- **API 模式下的逐会话 token + 美元成本**
- **第三方供应商（如 DeepSeek）的余额 + 7 天累计支出**

如果你每天都要在 5 个终端窗口之间反复切换确认"Claude 还在跑吗？"——CCC 就是为这件事设计的。

### 谁会用上 CCC？

CCC 面向**对 CLI vibe coding 还没完全熟练**的开发者——你想用 Claude Code / Codex 但终端的反馈太稀疏：

- 🟢 **新手**——分不清 Claude 是在思考还是卡住了
- 🟢 **熟练用户**——同时跑 3+ 个 CLI 会话容易乱
- 🟢 **团队**——想统一看 AI 用量和成本，不想每个人都写一遍 wrapper 脚本
- 🔮 **企业用户**（规划中）——团队仪表盘、跨成员模型策略、审计日志

### 核心功能一览

| 功能 | 说明 |
|---|---|
| **常驻顶部悬浮条** | 显示器顶部中央常驻 always-on-top；除 CCC 自身区域外鼠标穿透 |
| **拖动换位置** | 长按悬浮条 → 拖到三个 snap 框之一：**左上圆形**（角落模式）、**顶部中间细条**（自动隐藏模式，鼠标移到屏幕顶部探出）、或**顶部中间胶囊**（默认位置）。点圆圈展开 |
| **实时会话状态** | streaming · waiting · question · done —— Claude 会话挂 Claude Code 的 hooks，Codex 会话挂 rollout-JSONL 监听器 |
| **模型切换器** | 一键在 Sonnet 4.6 / Opus 4.7 / Haiku 4.5 之间切换，自动给会话发送 `/model <alias>` |
| **权限弹窗（真正能拦截工具）** | Bash / Edit / Read / Write 等工具请求弹一个小 **Yes / Always / No** 框。CCC 的 hook 会向 stdout 写 `permissionDecision` JSON，Claude Code 会真正按用户选择执行——拒绝就是拒绝，允许就只跑这一次，**Always** 在本会话内记住。并行工具调用会排队，用户逐个回答 |
| **AskUserQuestion 选项 UI** | 结构化问题显示成可点击按钮；无选项时显示文本输入框 |
| **按模式区分的 popup 行为** | 隐藏 / 角落模式下，纯信息类 popup（done / message）自动隐藏不打扰；可操作的 popup（带 Yes/No/Always 的权限）任何模式都显示。角落模式增加点圆圈"我知道了"的 dismiss 行为 |
| **API 供应商支持** | 配置 DeepSeek（或其他 Anthropic 兼容端点）；通过环境变量注入启动 API 模式会话 |
| **逐会话成本** | API 模式实时追踪 input/output token + 美元成本 |
| **余额轮询** | 第三方供应商显示账户余额和 7 天累计支出 |
| **Codex CLI 支持** | Codex 会话和 Claude 会话并排管理，分组显示。streaming / done 状态现在通过 rollout-JSONL 监听器自动追踪 |
| **手机镜像** | 一键 QR 码 → 手机通过局域网查看会话 transcript |
| **休眠唤醒恢复** | mac 合盖再开，CCC 管理的会话不会丢，醒来自动重新挂上 |
| **多语言** | 英语 / 中文 / 한국어（Settings 切换） |

### 0.1.1 新增

这次发版主要修了 0.1.0 后用户发现的一系列粗糙细节：

- **🎯 权限按钮真的有用了**。之前点 "No" 工具仍然会跑，因为 hook 只用 exit code 跟 Claude Code 沟通。现在 hook 会按当前 Claude Code 协议向 stdout 写 `{hookSpecificOutput:{permissionDecision}}` JSON——Yes / No / Always 真正有权威。
- **🧱 并行权限队列**。Claude 在一个 turn 里发多个并行工具调用时，多个 permission 同时到达。现在它们会在 CCC 内排队，逐个 popup，用户分别决定。配套把 server 端 hook 超时从 30 秒延长到 **120 秒**，给队列足够的真实时间去清。
- **🖱️ 拖动到三个位置**。长按 → 拖到左上（缩成圆圈）、顶部中间细条（自动隐藏，鼠标贴到屏幕顶部探出）、或顶部中间胶囊（默认）。胶囊会跟着光标，拖出任何 snap 框外松手会还原。
- **🧊 单个全宽透明窗口**。所有非拖动模式现在共享一个 workArea 宽度的透明 BrowserWindow——消除了之前小透明窗口在 macOS 上的"角落圆圈周围白底"和切模式时闪烁的问题。
- **🔁 Codex CLI 会话监控**。Codex 会话现在也会让悬浮条图标自动变 **streaming** / **done**，靠监听 Codex 的 rollout JSONL 实现。
- **🧹 角落模式细节打磨**。"Session complete" 3 秒自动收起；角落模式下，权限 banner / popup 显示时点圆圈可以一键 dismiss（"我知道了"，状态变化前不会再弹）。
- **🚪 退出确认**。Settings → Quit 在拆掉所有会话前先问一下。

如果你 0.1.0 上遇到过"拒绝不生效"、"popup 一闪就没了"、或"角落圆圈周围有白色光晕"——这个版本都修了。

### 下载（Mac 安装包）

**预编译的未签名 `.dmg` 在 [`releases/`](releases/) 目录里**：

- 🍎 [**Apple Silicon（M1/M2/M3/M4）** — `CCC-0.1.1-mac-arm64.dmg`](releases/CCC-0.1.1-mac-arm64.dmg) · 约 91 MB
- 🍎 [**Intel Mac** — `CCC-0.1.1-mac-x64.dmg`](releases/CCC-0.1.1-mac-x64.dmg) · 约 96 MB

> ⚠️ **DMG 未做代码签名。** macOS Gatekeeper 首次启动会弹"Apple 无法验证 CCC 不含恶意软件"。解锁方法：
> 1. 双击 `.dmg`，把 `CCC.app` 拖进 `Applications`
> 2. 在访达里**右键**应用 → **打开** → 在对话框点确认
> 3. 之后双击即可正常启动
>
> 或者更快：终端跑一次：
> ```bash
> xattr -cr "/Applications/CCC.app"
> ```

启动后 CCC 会请求**辅助功能权限**（系统设置 → 隐私与安全性 → 辅助功能）。一定要授权——没有它，模型切换和回复消息会静默失败。

### 从源码构建（保姆级教程）

如果你想自己 build（或者不在 mac 上），下面是完整步骤。**不需要 Electron 经验。**

#### 1. 准备环境

先装这些工具。mac 上最简单的路径是 [Homebrew](https://brew.sh)：

```bash
# Node 20+ （Node 22 也可以）
brew install node@20

# pnpm 9+ （CCC 用 pnpm，不是 npm）
npm install -g pnpm@9
```

验证版本：

```bash
node --version    # 应该是 v20.x 或 v22.x
pnpm --version    # 应该是 9.x 或 10.x
```

同时你需要装下面任一 CLI：
- **Claude Code CLI** —— 安装指南 https://docs.claude.com/claude-code
- **Codex CLI** —— 安装指南 https://github.com/openai/codex

CCC 装哪个用哪个；不需要两个都装。

#### 2. 克隆 + 安装依赖

```bash
git clone https://github.com/<你的-GitHub-用户名>/ccc.git
cd ccc
pnpm install
```

首次安装会下载 Electron（约 100 MB）和开发依赖，需要 1–3 分钟。

#### 3. 开发模式启动

```bash
pnpm dev
```

主显示器顶部中央会出现悬浮条。点击展开，添加你的第一个会话。

#### 4. 自己打 DMG（可选）

```bash
pnpm package
```

输出在 `packages/app/dist/`：
- `CCC-0.1.1-arm64.dmg`（Apple Silicon）
- `CCC-0.1.1.dmg`（Intel）

#### 5. 跑测试 + 类型检查（可选）

```bash
pnpm lint     # tsc --noEmit 类型检查
pnpm test     # Vitest 单元测试 + 组件测试
```

### 配置 API 供应商（以 DeepSeek 为例）

CCC 支持任何**与 Anthropic API 兼容**的第三方端点，DeepSeek 默认接入。**你需要自己提供 API key —— CCC 不附带任何账号信息。**

1. 点击悬浮条展开
2. 点击 ⚙️ Settings（展开面板右上角）
3. 在 **API Providers** 区域点 **+ Add DeepSeek**
4. 粘贴你的 DeepSeek key（在 https://platform.deepseek.com 申请）
5. 点 **Test** → 等"Connected"
6. 点 **Save** —— key 通过 Electron `safeStorage` 加密保存（mac 上用钥匙串）
7. 打开模型选择器 —— `DeepSeek v4-flash` 和 `DeepSeek v4-pro` 会出现在 Claude 模型旁边
8. 点击其中一个 → CCC 询问是 **Restart** 当前会话还是 **Open a new** 全新会话

API 模式的会话会在悬浮条上实时显示 token 消耗和美元成本。

### 这个版本里**没有**什么

公开版有意删除了一些内容：

- ❌ **Harness Wizard** —— 用于自动生成 `CLAUDE.md` 规则文件的功能，未来作为 Pro 版预留
- ❌ **预置 API key** —— 必须自己提供供应商凭证
- ❌ **自动更新** —— 暂时需要每次发版手动重新下载
- ❌ **代码签名 / 公证** —— 见上面 Gatekeeper 说明

### 路线图

- 🛣️ **云端同步**会话历史和团队仪表盘
- 🛣️ **Windows 版本**（代码已经通过 `PlatformAdapter` 抽象层支持 Windows，公开 v0.1.0 暂时只放 macOS 包）
- 🛣️ **更多 API 供应商接入**（Together AI、Groq、OpenRouter 等）
- 🛣️ **企业版** —— 团队策略 + 审计日志

### ⚠️ Beta / 测试版本 —— 使用前请阅读

**CCC 0.1.1 是 beta 测试版。** 日常能用，但**还没做到功能完备**，**一定会有 bug**。

- 🐞 **bug 还在**。尤其是边缘 case（密集并行工具调用、多显示器配置、某些 Claude Code CLI 版本组合、DeepSeek 轮询时的网络抖动）。坏了请提 issue，附上重现步骤 + macOS 版本 + Claude Code 版本。
- 🔍 **永远 double-check CLI 输出**。CCC 显示状态图标（streaming / waiting / done）和工具权限弹窗——但**终端才是 source of truth**。在相信"Session complete"或点"允许"前，扫一眼实际的 CLI 输出，确认 Claude 实际在做什么。
- 🛡️ **每个权限决定都是你的责任**。当你点 "Yes" / "Always" 时，对应的工具会用你的真实凭证在你的真实文件系统上跑。CCC 只是入口——后果由你承担。**Always** 尤其要谨慎。
- 💸 **API 模式的 token 成本是 CCC 的估算**。成本/余额数字来自供应商 API + CCC 内置的定价表，是参考值，不是账单级别。真实数字以供应商的官方账单为准。
- 🚫 **macOS 上未签名 / 公证** —— 首次启动需要做上面的 Gatekeeper 绕过。
- 🪟 **目前没有验证过的 Windows 版本**。`PlatformAdapter` 抽象层里代码路径存在，但每个发版 commit 只在 macOS 上手动验证过。Windows 用户请从源码 build 并报告兼容性。

使用 CCC 即表示你接受它是一个未完成的工具，并且你对它呈现的任何 AI 驱动的操作仍然负有验证责任。

### 贡献

欢迎 PR。提交前确保 `pnpm lint && pnpm test` 通过。项目用 Conventional Commits（`feat | fix | refactor | test | ci | docs | chore`），scope 用 `app | infra`。

### 许可证

[Apache License 2.0](LICENSE)。可自由使用、fork、嵌入、商用 —— 详见 `LICENSE`。

---

<a id="한국어"></a>

## 한국어

### CCC란?

**CLI Coding Cockpit** (줄여서 **CCC**)는 **Claude Code CLI**, **Codex CLI**, 또는 모든 서드파티 API 공급자를 데일리 코딩 도구로 사용하는 개발자를 위한 데스크톱 도우미입니다. 화면 상단 중앙에 항상 떠 있는 "Dynamic Island" 스타일의 작은 알약을 띄워 다음 정보를 실시간으로 보여줍니다:

- **현재 모델** (Sonnet / Opus / Haiku / DeepSeek / Codex)
- **컨텍스트 윈도우 사용률 %**
- **5시간 / 7일 롤링 사용량**
- **세션 라이프사이클 상태**: 응답 중 · 입력 대기 · 질문 · 완료
- **툴 권한 팝업** (Bash / Edit / Read 등) — 오버레이에서 Yes / Always / No 응답
- **AskUserQuestion 팝업** — Claude의 구조화된 질문이 클릭 가능한 옵션 버튼으로 렌더링
- **API 모드 세션별 토큰 + USD 비용**
- **DeepSeek 같은 서드파티 공급자의 잔액 + 7일 누적 지출**

하루에 50번씩 "Claude 아직 작업 중인가?" 확인하러 터미널을 왔다 갔다 한 적이 있다면 — CCC가 그 문제를 해결합니다.

### 누구를 위한 도구인가요?

CCC는 **CLI vibe coding 에 아직 완전히 익숙하지 않은** 개발자를 위해 만들어졌습니다 — Claude Code / Codex CLI를 쓰고 싶지만 터미널 피드백이 너무 부족하다고 느끼는 분들:

- 🟢 **초보자** — Claude가 생각 중인지 멈춘 건지 구분이 안 될 때
- 🟢 **파워 유저** — 3+ CLI 세션을 동시에 돌리다 길을 잃을 때
- 🟢 **팀** — 각자 wrapper 스크립트를 짜지 않고 AI 사용량 / 비용을 공유 가시화
- 🔮 **엔터프라이즈** (로드맵) — 플릿 대시보드, 팀 단위 모델 정책, 감사 로그

### 주요 기능

| 영역 | 설명 |
|---|---|
| **항상 위에 떠 있는 알약** | 주 모니터 상단 중앙; CCC chrome 위에서만 클릭 캡처, 그 외는 클릭 통과 |
| **드래그로 위치 이동** | 알약 길게 누르기 → 세 개의 스냅 존 중 하나로 드래그: **좌측 상단 원** (코너 모드), **상단 중앙 얇은 띠** (자동 숨김 모드, 화면 상단에 마우스 올리면 살짝 나타남), 또는 **상단 중앙 알약** (기본 위치). 원 클릭으로 확장 |
| **실시간 세션 상태** | streaming · waiting · question · done — Claude 세션은 Claude Code hooks, Codex 세션은 rollout-JSONL 와처가 구동 |
| **모델 선택기** | Sonnet 4.6 / Opus 4.7 / Haiku 4.5 사이 원클릭 전환; 세션에 `/model <alias>` 자동 전송 |
| **권한 팝업 (실제로 툴을 차단)** | Bash / Edit / Read / Write 툴 요청 시 작은 **Yes / Always / No** 프롬프트. CCC 의 hook 이 stdout 에 `permissionDecision` JSON 을 써서 Claude Code 가 사용자 선택을 진짜로 존중함 — Deny 는 진짜로 차단, Allow 는 정확히 한 번만 실행, **Always** 는 세션 내에서 기억. 병렬 툴 호출은 큐에 쌓여 사용자가 각각 응답 |
| **AskUserQuestion UI** | 구조화된 질문은 클릭 가능한 옵션 버튼으로; 옵션이 없으면 텍스트 입력 |
| **모드별 팝업 동작** | 숨김 / 코너 모드에서는 정보 전용 팝업 (done / message) 이 자동 숨김 처리. 작동 가능한 팝업 (Yes/No/Always 의 권한) 은 모든 모드에서 표시. 코너 모드는 클릭 dismiss "我知道了" 동작 추가 |
| **API 공급자 지원** | DeepSeek (또는 다른 Anthropic 호환 엔드포인트) 설정; env 주입으로 API 모드 세션 spawn |
| **세션별 비용** | API 모드는 input/output 토큰 + USD 비용 추적 |
| **잔액 폴링** | 서드파티 공급자의 계정 잔액 + 7일 롤링 지출 표시 |
| **Codex CLI 지원** | Codex 세션을 Claude 세션과 별도 그룹으로 패널에 표시. streaming / done 상태도 Codex rollout-JSONL 와처로 자동 추적 |
| **휴대폰 미러** | 원클릭 QR 코드 → LAN으로 휴대폰에서 활성 세션 transcript 로드 |
| **슬립/웨이크 복구** | macOS 슬립이 CCC 관리 세션을 죽이지 않음; 웨이크 시 자동 재연결 |
| **i18n** | 영어 / 中文 / 한국어 (Settings에서 전환) |

### 0.1.1 변경 사항

이번 릴리스는 0.1.0 이후 발견된 거친 부분들을 대부분 다듬었습니다:

- **🎯 권한 팝업이 이제 진짜로 툴을 차단합니다**. 이전에는 "No"를 눌러도 hook이 exit code 로만 소통해서 Claude가 어쨌든 툴을 실행했습니다. 이제 hook 이 현재 Claude Code 프로토콜에 따라 `{hookSpecificOutput:{permissionDecision}}` JSON 을 stdout 에 명시적으로 씁니다 — Yes / No / Always 가 권위 있게 됩니다.
- **🧱 병렬 권한 큐**. Claude가 한 turn 에서 병렬 툴 호출을 할 때 여러 권한 요청이 함께 도착합니다. 이제 CCC 내에서 큐에 쌓이고 하나씩 표시되어 각각 응답할 수 있습니다. 서버측 hook 타임아웃을 **120초**로 연장해서 큐 처리 시간을 확보했습니다.
- **🖱️ 세 위치로 알약 드래그**. 길게 누르기 → 좌상단 (원으로 축소), 상단 중앙 얇은 띠 (자동 숨김; 화면 최상단 hover 로 살짝 나타남), 또는 상단 중앙 알약 (기본). 알약은 그랩 오프셋으로 커서를 따라가며 어떤 존 밖에 떨어뜨리면 원래대로 돌아갑니다.
- **🧊 단일 풀 너비 오버레이 윈도우**. 모든 비드래그 모드가 이제 workArea 너비의 투명 BrowserWindow 하나를 공유 — macOS에서 작은 투명 윈도우가 겪던 "코너 원 주변 흰 배경"과 리사이즈 깜빡임 아티팩트 제거.
- **🔁 Codex CLI 세션 모니터링**. Codex 세션도 이제 알약 아이콘을 **streaming** / **done** 으로 자동 전환 — Codex의 rollout JSONL을 tail watcher로 추적.
- **🧹 코너 모드 다듬기**. "Session complete" 가 3초 후 자동 숨김; 코너 모드에서 권한 banner / popup 표시 중 원을 클릭하면 dismiss (한 번의 "I got it" 동작, 다음 상태 변화 전까지 재무장 안 됨).
- **🚪 종료 확인**. Settings → Quit 가 모든 세션을 정리하기 전에 확인을 묻습니다.

0.1.0 에서 "deny 가 deny 안 함", "팝업이 효과 없이 사라짐", "코너 원에 흰색 halo" 를 봤다면 — 이 빌드가 그것들을 수정합니다.

### 다운로드 (Mac 바이너리)

**미리 빌드된 미서명 `.dmg` 파일은 [`releases/`](releases/) 안에 있습니다**:

- 🍎 [**Apple Silicon (M1/M2/M3/M4)** — `CCC-0.1.1-mac-arm64.dmg`](releases/CCC-0.1.1-mac-arm64.dmg) · ~91 MB
- 🍎 [**Intel Mac** — `CCC-0.1.1-mac-x64.dmg`](releases/CCC-0.1.1-mac-x64.dmg) · ~96 MB

> ⚠️ **DMG는 코드 서명이 되어 있지 않습니다.** macOS Gatekeeper가 첫 실행 시 *"CCC가 악성 소프트웨어인지 Apple이 확인할 수 없습니다"* 라고 표시합니다. 실행하려면:
> 1. `.dmg` 더블클릭, `CCC.app` 을 `Applications` 로 드래그
> 2. Finder 에서 앱을 **우클릭** → **열기** → 대화상자에서 확인
> 3. 한 번 우회한 후에는 일반 더블클릭으로 실행 가능
>
> 더 빠른 방법, 터미널에서 한 번 실행:
> ```bash
> xattr -cr "/Applications/CCC.app"
> ```

실행 후 CCC가 **손쉬운 사용 (Accessibility) 권한**을 요청합니다 (시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용). 반드시 허용하세요 — 이 권한이 없으면 모델 전환과 메시지 회신이 조용히 실패합니다.

### 소스에서 빌드하기 (단계별 가이드)

직접 빌드하고 싶거나 macOS가 아니라면 아래 전체 단계입니다. **Electron 경험 없어도 됩니다.**

#### 1. 사전 준비

이 도구들을 먼저 설치하세요. macOS에서는 [Homebrew](https://brew.sh) 가 가장 쉽습니다:

```bash
# Node 20+ (Node 22도 가능)
brew install node@20

# pnpm 9+ (CCC는 npm 대신 pnpm 사용)
npm install -g pnpm@9
```

버전 확인:

```bash
node --version    # v20.x 또는 v22.x
pnpm --version    # 9.x 또는 10.x
```

추가로 다음 중 하나는 필요합니다:
- **Claude Code CLI** — 설치 가이드 https://docs.claude.com/claude-code
- **Codex CLI** — 설치 가이드 https://github.com/openai/codex

CCC는 설치된 것을 감지합니다; 둘 다 설치할 필요는 없습니다.

#### 2. Clone + 의존성 설치

```bash
git clone https://github.com/<당신의-GitHub-아이디>/ccc.git
cd ccc
pnpm install
```

첫 설치는 Electron(~100 MB)과 개발 의존성을 다운로드하므로 1–3분 걸립니다.

#### 3. 개발 모드 실행

```bash
pnpm dev
```

주 모니터 상단 중앙에 떠 있는 알약이 나타납니다. 클릭하여 확장하고 첫 세션을 추가하세요.

#### 4. 자신만의 DMG 빌드 (선택)

```bash
pnpm package
```

출력 위치: `packages/app/dist/`
- `CCC-0.1.1-arm64.dmg` (Apple Silicon)
- `CCC-0.1.1.dmg` (Intel)

#### 5. 테스트 + 타입체크 실행 (선택)

```bash
pnpm lint     # tsc --noEmit 타입 체크
pnpm test     # Vitest 유닛 + 컴포넌트 테스트
```

### API 공급자 설정 (DeepSeek 예시)

CCC는 **Anthropic 호환** 서드파티 API 엔드포인트를 지원합니다. DeepSeek은 기본 통합되어 있습니다. **자신의 키를 제공해야 합니다 — CCC는 어떤 자격 증명도 동봉하지 않습니다.**

1. 알약을 클릭하여 확장
2. ⚙️ Settings 아이콘 클릭 (확장 패널 우상단)
3. **API Providers** 섹션에서 **+ Add DeepSeek** 클릭
4. DeepSeek 키 붙여넣기 (https://platform.deepseek.com 에서 발급)
5. **Test** 클릭 → "Connected" 대기
6. **Save** 클릭 — Electron `safeStorage` 로 암호화 저장됨 (macOS 키체인)
7. 모델 선택기 열기 — Claude 모델 옆에 `DeepSeek v4-flash` 와 `DeepSeek v4-pro` 칩 표시
8. 클릭 → CCC가 현재 세션을 **Restart** 할지 **Open a new** 신규 세션을 열지 묻습니다

API 모드 세션은 알약에 토큰 소비 + USD 비용을 실시간 표시합니다.

### 이 버전에 **없는** 것

공개 릴리스에서 의도적으로 제외된 부분:

- ❌ **Harness Wizard** — `CLAUDE.md` 룰 파일을 자동 생성하는 비공개 기능; 향후 Pro 티어용으로 비공개 유지
- ❌ **번들된 API 키** — 자신의 공급자 자격 증명 사용 필수
- ❌ **자동 업데이트** — 현재는 릴리스마다 DMG 재다운로드 필요
- ❌ **코드 서명 / 공증** — 위 Gatekeeper 안내 참조

### 로드맵

- 🛣️ **클라우드 동기화** — 세션 히스토리와 팀 대시보드
- 🛣️ **Windows 바이너리** (`PlatformAdapter` 추상화로 코드는 이미 Windows 지원; 공개 v0.1.0은 macOS 전용)
- 🛣️ **더 많은 공급자 통합** (Together AI, Groq, OpenRouter)
- 🛣️ **엔터프라이즈 티어** — 팀 정책 + 감사 로그

### ⚠️ 베타 / 테스트 릴리스 — 사용 전 필독

**CCC 0.1.1은 베타 빌드입니다.** 일상 사용은 가능하지만 **아직 기능 완성 단계가 아니며** **버그가 있습니다**.

- 🐞 **버그가 존재합니다**. 특히 엣지 케이스 (다수 병렬 툴 호출, 멀티 모니터 환경, 특정 Claude Code CLI 버전 조합, DeepSeek 폴링 중 네트워크 끊김). 문제가 발생하면 재현 단계 + macOS 버전 + Claude Code 버전과 함께 이슈를 등록해주세요.
- 🔍 **항상 CLI 출력을 다시 확인하세요**. CCC는 상태 아이콘 (streaming / waiting / done) 과 툴 권한 팝업을 표시합니다 — 하지만 **터미널이 진실의 원천**입니다. "Session complete" 표시를 신뢰하거나 권한 팝업에서 "Allow"를 누르기 전에 실제 CLI 출력을 확인하세요.
- 🛡️ **모든 권한 결정은 사용자의 책임입니다**. Bash / Edit / Read 팝업에서 "Yes" / "Always" 를 누르면 실제 파일 시스템에서 실제 자격 증명으로 툴이 실행됩니다. CCC는 표면 일 뿐 — 결과는 당신의 것입니다. **Always** 는 특히 신중히 사용하세요.
- 💸 **API 모드 토큰 비용은 CCC의 추정치**입니다. 비용/잔액 숫자는 공급자 API와 CCC의 가격표에서 나옵니다 — 참고용이지 청구 단계의 정확도가 아닙니다. 실제 숫자는 공급자 대시보드를 신뢰하세요.
- 🚫 **macOS에서 서명 / 공증되지 않음** — 첫 실행 시 위 Gatekeeper 우회가 필요합니다.
- 🪟 **아직 검증된 Windows 빌드 없음**. `PlatformAdapter` 추상화를 통해 코드 경로는 존재하지만 모든 릴리스 커밋은 macOS에서만 수동 검증되었습니다. Windows 사용자는 소스에서 빌드하고 동작 여부를 보고해주세요.

CCC 사용 시, 이것이 미완성 도구이며 표시하는 모든 AI 기반 작업에 대한 검증 책임이 사용자에게 남아있음을 받아들이는 것입니다.

### 기여

PR 환영합니다. PR 열기 전 `pnpm lint && pnpm test` 가 통과해야 합니다. Conventional Commits 사용 (`feat | fix | refactor | test | ci | docs | chore`), 스코프는 `app | infra`.

### 라이선스

[Apache License 2.0](LICENSE). 자유로운 사용 / fork / 임베드 / 상용화 가능 — 상세는 `LICENSE` 참조.

---

<div align="center">

Built with ❤️ for the CLI vibe-coding community.

</div>
