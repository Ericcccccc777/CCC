<div align="center">

# CCC

**A Dynamic-Island-style overlay that helps you manage Claude Code CLI and Codex CLI sessions.**

Live model + context + usage at the top of your screen · one-click model switching · API provider support · phone mirror · sleep/wake recovery.

[![macOS](https://img.shields.io/badge/macOS-14%2B-black?logo=apple)](#download-mac-binary)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron%2030-47848F?logo=electron)](https://www.electronjs.org/)

[**⬇️ Download for macOS (Apple Silicon)**](releases/CCC-0.1.0-mac-arm64.dmg) · [**⬇️ Download for macOS (Intel)**](releases/CCC-0.1.0-mac-x64.dmg)

[English](#english) · [中文](#中文) · [한국어](#한국어)

</div>

---

<a id="english"></a>

## English

### What is CCC?

**CCC** is a desktop helper for developers who use **Claude Code CLI** or **Codex CLI** as their daily coding companion. It puts a small always-on-top "pill" at the top-center of your screen that shows, in real time:

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
| **Live session state** | Streaming · waiting · question · done — driven by Claude Code's own hooks |
| **Model picker** | One-click switch between Sonnet 4.6 / Opus 4.7 / Haiku 4.5 — sends `/model <alias>` into the active session |
| **Permission popups** | Bash / Edit / Read / Write tool requests pop a tiny **Yes / Always / No** prompt; **Always** remembers the choice for that session |
| **AskUserQuestion UI** | Structured questions render with clickable option buttons; textarea reply when no options |
| **API provider support** | Configure DeepSeek (or other Anthropic-compatible endpoints); spawn API-mode sessions that talk to a third-party endpoint via env injection |
| **Per-session cost** | API mode tracks input/output tokens + USD cost per session |
| **Balance polling** | Third-party providers show their account balance and 7-day rolling spend |
| **Codex CLI support** | Codex sessions launch alongside Claude sessions, grouped separately in the panel |
| **Phone mirror** | One-click QR code → load the active session's transcript on your phone via LAN |
| **Sleep/wake recovery** | macOS sleep does not kill CCC-managed sessions; on wake they reattach automatically |
| **i18n** | UI in English / 中文 / 한국어 (switch in Settings) |

### Download (mac binary)

**The pre-built unsigned `.dmg` files are inside [`releases/`](releases/)**:

- 🍎 [**Apple Silicon (M1/M2/M3/M4)** — `CCC-0.1.0-mac-arm64.dmg`](releases/CCC-0.1.0-mac-arm64.dmg) · ~91 MB
- 🍎 [**Intel Mac** — `CCC-0.1.0-mac-x64.dmg`](releases/CCC-0.1.0-mac-x64.dmg) · ~96 MB

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

- `CCC-0.1.0-arm64.dmg` (Apple Silicon)
- `CCC-0.1.0.dmg` (Intel)

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

### Contributing

PRs welcome. Run `pnpm lint && pnpm test` green before opening a PR. The project uses Conventional Commits (`feat | fix | refactor | test | ci | docs | chore`) with scopes `app | infra`.

### License

[Apache License 2.0](LICENSE). You're free to use, fork, embed, and commercialize — see `LICENSE` for details.

---

<a id="中文"></a>

## 中文

### CCC 是什么？

**CCC** 是一个为 **Claude Code CLI** 和 **Codex CLI** 用户设计的桌面辅助工具。它在你屏幕顶部中央常驻一个小"灵动岛"风格的悬浮条，实时显示：

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
| **实时会话状态** | streaming · waiting · question · done —— 直接挂 Claude Code 自己的 hooks |
| **模型切换器** | 一键在 Sonnet 4.6 / Opus 4.7 / Haiku 4.5 之间切换，自动给会话发送 `/model <alias>` |
| **权限弹窗** | Bash / Edit / Read / Write 等工具请求弹一个小 **Yes / Always / No** 框；**Always** 会记住该会话的选择 |
| **AskUserQuestion 选项 UI** | 结构化问题显示成可点击按钮；无选项时显示文本输入框 |
| **API 供应商支持** | 配置 DeepSeek（或其他 Anthropic 兼容端点）；通过环境变量注入启动 API 模式会话 |
| **逐会话成本** | API 模式实时追踪 input/output token + 美元成本 |
| **余额轮询** | 第三方供应商显示账户余额和 7 天累计支出 |
| **Codex CLI 支持** | Codex 会话和 Claude 会话并排管理，分组显示 |
| **手机镜像** | 一键 QR 码 → 手机通过局域网查看会话 transcript |
| **休眠唤醒恢复** | mac 合盖再开，CCC 管理的会话不会丢，醒来自动重新挂上 |
| **多语言** | 英语 / 中文 / 한국어（Settings 切换） |

### 下载（Mac 安装包）

**预编译的未签名 `.dmg` 在 [`releases/`](releases/) 目录里**：

- 🍎 [**Apple Silicon（M1/M2/M3/M4）** — `CCC-0.1.0-mac-arm64.dmg`](releases/CCC-0.1.0-mac-arm64.dmg) · 约 91 MB
- 🍎 [**Intel Mac** — `CCC-0.1.0-mac-x64.dmg`](releases/CCC-0.1.0-mac-x64.dmg) · 约 96 MB

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
- `CCC-0.1.0-arm64.dmg`（Apple Silicon）
- `CCC-0.1.0.dmg`（Intel）

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

### 贡献

欢迎 PR。提交前确保 `pnpm lint && pnpm test` 通过。项目用 Conventional Commits（`feat | fix | refactor | test | ci | docs | chore`），scope 用 `app | infra`。

### 许可证

[Apache License 2.0](LICENSE)。可自由使用、fork、嵌入、商用 —— 详见 `LICENSE`。

---

<a id="한국어"></a>

## 한국어

### CCC란?

**CCC** 는 **Claude Code CLI** 와 **Codex CLI** 사용자를 위한 데스크톱 도우미입니다. 화면 상단 중앙에 항상 떠 있는 "Dynamic Island" 스타일의 작은 알약을 띄워 다음 정보를 실시간으로 보여줍니다:

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
| **실시간 세션 상태** | streaming · waiting · question · done — Claude Code 자체 hooks 활용 |
| **모델 선택기** | Sonnet 4.6 / Opus 4.7 / Haiku 4.5 사이 원클릭 전환; 세션에 `/model <alias>` 자동 전송 |
| **권한 팝업** | Bash / Edit / Read / Write 툴 요청 시 작은 **Yes / Always / No** 프롬프트; **Always** 는 해당 세션에서 선택 기억 |
| **AskUserQuestion UI** | 구조화된 질문은 클릭 가능한 옵션 버튼으로; 옵션이 없으면 텍스트 입력 |
| **API 공급자 지원** | DeepSeek (또는 다른 Anthropic 호환 엔드포인트) 설정; env 주입으로 API 모드 세션 spawn |
| **세션별 비용** | API 모드는 input/output 토큰 + USD 비용 추적 |
| **잔액 폴링** | 서드파티 공급자의 계정 잔액 + 7일 롤링 지출 표시 |
| **Codex CLI 지원** | Codex 세션을 Claude 세션과 별도 그룹으로 패널에 표시 |
| **휴대폰 미러** | 원클릭 QR 코드 → LAN으로 휴대폰에서 활성 세션 transcript 로드 |
| **슬립/웨이크 복구** | macOS 슬립이 CCC 관리 세션을 죽이지 않음; 웨이크 시 자동 재연결 |
| **i18n** | 영어 / 中文 / 한국어 (Settings에서 전환) |

### 다운로드 (Mac 바이너리)

**미리 빌드된 미서명 `.dmg` 파일은 [`releases/`](releases/) 안에 있습니다**:

- 🍎 [**Apple Silicon (M1/M2/M3/M4)** — `CCC-0.1.0-mac-arm64.dmg`](releases/CCC-0.1.0-mac-arm64.dmg) · ~91 MB
- 🍎 [**Intel Mac** — `CCC-0.1.0-mac-x64.dmg`](releases/CCC-0.1.0-mac-x64.dmg) · ~96 MB

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
- `CCC-0.1.0-arm64.dmg` (Apple Silicon)
- `CCC-0.1.0.dmg` (Intel)

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

### 기여

PR 환영합니다. PR 열기 전 `pnpm lint && pnpm test` 가 통과해야 합니다. Conventional Commits 사용 (`feat | fix | refactor | test | ci | docs | chore`), 스코프는 `app | infra`.

### 라이선스

[Apache License 2.0](LICENSE). 자유로운 사용 / fork / 임베드 / 상용화 가능 — 상세는 `LICENSE` 참조.

---

<div align="center">

Built with ❤️ for the CLI vibe-coding community.

</div>
