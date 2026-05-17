import type { CodingRule, CodingRuleCategory, ProjectType } from './harness-types'

interface BuiltinRuleDef {
  id:        string
  title:     string
  text:      string
  source:    'builtin-default' | 'builtin-optional'
  category?: CodingRuleCategory
}

// ── Default rules — universal, always-on ─────────────────────────────────────

const DEFAULT_RULES: ReadonlyArray<BuiltinRuleDef> = [
  {
    id: 'think-first',
    title: '想清楚再写',
    text: '改动超过 20 行或动到 2+ 文件时，先用一句话说清思路并得到用户确认，再动键盘。不要边想边写。',
    source: 'builtin-default',
  },
  {
    id: 'simple-over-clever',
    title: '能简单就不要复杂',
    text: '三行重复也比一个早期抽象好。设计模式 / 通用框架 / 配置层不要预防性地引入；只在需求明确出现 3 次以上才考虑抽象。',
    source: 'builtin-default',
  },
  {
    id: 'surgical-changes',
    title: '精准改动',
    text: '只改任务直接相关的代码。看到不顺眼的命名 / 格式 / 旧代码不要顺手重构。"While I am in here..." 是禁用措辞。',
    source: 'builtin-default',
  },
  {
    id: 'stay-on-target',
    title: '始终盯住目标内容',
    text: '用户说什么做什么。不要扩张范围、不要主动加功能、不要替用户决定"应该顺便做的事"。',
    source: 'builtin-default',
  },
  {
    id: 'ask-when-ambiguous',
    title: '任务有歧义就问',
    text: '任何有 2 个以上合理解释的判断（命名、库选择、是否加 fallback、是否加 feature flag、是否 commit）都停下来问。不要替用户做决定。',
    source: 'builtin-default',
  },
  {
    id: 'no-defensive-impossible',
    title: '不为不可能发生的情况加防御',
    text: '内部代码相信类型系统；只在系统边界（HTTP 入参、用户输入、外部 API、文件 IO）做校验。不写永远走不到的 try/catch 和 null check。',
    source: 'builtin-default',
  },
  {
    id: 'no-explanatory-comments',
    title: '不写解释性注释',
    text: '命名说明 what。注释只在 why 非显而易见时写：隐藏约束、subtle 不变量、特定 bug 的 workaround。不引用任务编号、不写"used by X"。',
    source: 'builtin-default',
  },
  {
    id: 'delete-dont-comment-out',
    title: '删除胜于注释掉',
    text: '不要的代码直接删，不留 `// removed` / `// TODO: remove later`。Git 记得历史。',
    source: 'builtin-default',
  },
  {
    id: 'no-bypass-on-failure',
    title: '失败不要绕过',
    text: '不用 `--no-verify`、不 skip 测试、不注释掉报红的代码、不修改测试断言来"修复"。失败是问题，根因是答案。',
    source: 'builtin-default',
  },
  {
    id: 'self-check-before-done',
    title: '改动后先自检再宣告完成',
    text: '跑 lint、跑 test、对 UI 改动手动验证 happy path。"Tests pass" ≠ "feature works"。报告里明确说哪些验证了、哪些没。',
    source: 'builtin-default',
  },
  {
    id: 'tests-green-before-commit',
    title: '测试必须先绿再提交',
    text: '红即修。CI 红是 bug 不是配置问题。绝不通过修改测试 / 删 assertion 来掩盖失败。',
    source: 'builtin-default',
  },
  {
    id: 'one-logical-change-per-commit',
    title: '一个 commit 一件事',
    text: '不打包无关改动。Refactor 单独 commit，bug fix 单独 commit。drive-by 重命名 / 格式化不要混在功能 commit 里。',
    source: 'builtin-default',
  },
  {
    id: 'confirm-before-irreversible',
    title: '不可逆操作先确认',
    text: '删文件 / 删分支 / push --force / 删数据库表 / 改 CI 配置 / 发外部消息 之前先和用户确认，即使之前授权过类似操作。',
    source: 'builtin-default',
  },
]

// ── Optional rules — opt-in by category ──────────────────────────────────────

const OPTIONAL_RULES: ReadonlyArray<BuiltinRuleDef> = [
  // Discipline
  { id: 'no-banned-phrasings', title: '禁用隐藏决策的措辞', text: '出现"I will just / while I am in here / for future flexibility / to be safe"等措辞时停下来问。这些都是没经授权扩展范围的信号。', source: 'builtin-optional', category: 'discipline' },
  { id: 'approval-scope-strict', title: '用户授权范围 = 字面意义', text: '一个 "yes" 给一个动作，不等于给后续动作。每个独立决策点都要单独确认。', source: 'builtin-optional', category: 'discipline' },
  { id: 'surface-uncertainty', title: '不确定就明说', text: '不要假装知道。说"我不确定 X 是不是 Y，要不要先测一下"比直接错强。', source: 'builtin-optional', category: 'discipline' },

  // TypeScript
  { id: 'strict-typescript', title: 'strict mode + 禁用 any', text: '`tsconfig.json` 启用 strict: true。用 `unknown` + type guard 替代 `any`。', source: 'builtin-optional', category: 'typescript' },
  { id: 'explicit-return-types', title: '导出函数显式返回类型', text: '所有 `export function` / 类的 public 方法显式声明返回类型，防止跨包推断破坏。', source: 'builtin-optional', category: 'typescript' },
  { id: 'readonly-arrays', title: '常量数组用 readonly', text: '用 `ReadonlyArray<T>` 或 `as const` 标记不可变数组。', source: 'builtin-optional', category: 'typescript' },
  { id: 'prefer-interface-for-objects', title: 'object shape 用 interface', text: 'object shape 用 `interface`，union / alias 用 `type`。', source: 'builtin-optional', category: 'typescript' },
  { id: 'no-non-null-assertion', title: '禁用非空断言 !', text: '不用 `value!` 强制非空。用类型守卫或显式 `if (value)` 替代。', source: 'builtin-optional', category: 'typescript' },

  // React
  { id: 'function-components-only', title: '只用函数组件', text: '不写 class 组件，一律 function components + hooks。', source: 'builtin-optional', category: 'react' },
  { id: 'props-interface-above-component', title: 'props interface 紧贴组件', text: '组件 props 的 interface 定义在组件函数正上方，同文件。', source: 'builtin-optional', category: 'react' },
  { id: 'hooks-order', title: 'hooks 顺序固定', text: '组件内 hooks 顺序：state → ref → derived (useMemo) → effect → callback → return。', source: 'builtin-optional', category: 'react' },
  { id: 'aria-label-icons', title: '纯图标按钮必须 aria-label', text: '所有只有图标没有可见文字的按钮必须有 `aria-label`。可访问性硬要求。', source: 'builtin-optional', category: 'react' },
  { id: 'no-inline-style-except-dynamic', title: '静态样式用 CSS 类', text: '`style={{...}}` 只用于 computed / 动态值（如 `style={{ width: pct + "%" }}`）。静态样式都进 CSS。', source: 'builtin-optional', category: 'react' },
  { id: 'one-component-per-file', title: '一个文件一个组件', text: '文件名 PascalCase 匹配组件名。内部 helper 组件可以同文件，但只导出主组件。', source: 'builtin-optional', category: 'react' },

  // CSS
  { id: 'bem-naming', title: 'BEM 命名风格', text: 'CSS 类名用 BEM：`.block`、`.block__element`、`.block--modifier`。', source: 'builtin-optional', category: 'css' },
  { id: 'single-stylesheet', title: '单一全局 stylesheet', text: '不分割 per-component CSS 直到主样式文件超过 1000 行。', source: 'builtin-optional', category: 'css' },
  { id: 'no-css-in-js', title: '不引入 CSS-in-JS', text: '不用 styled-components / emotion / CSS Modules，除非项目本来就用。', source: 'builtin-optional', category: 'css' },

  // Testing
  { id: 'paired-test-class', title: '每个导出 class 配测试类', text: 'OOP 测试模式：每个导出 class `Foo` 有对应 `FooTests` 测试类，`static run()` 调 describe。', source: 'builtin-optional', category: 'testing' },
  { id: 'descriptive-assertions', title: '断言带具体参数', text: '用 `toHaveBeenCalledWith(args)` 而不是裸 `toHaveBeenCalled()`。', source: 'builtin-optional', category: 'testing' },
  { id: 'no-snapshot-tests', title: '禁止 snapshot 测试', text: 'snapshot 测试鼓励不读 diff、容易把 bug 当成"快照已更新"绿掉。断言具体行为。', source: 'builtin-optional', category: 'testing' },
  { id: 'no-internal-mocks', title: '只在进程边界 mock', text: '不 mock 内部模块。只 mock HTTP / 文件系统 / Electron API 这种真正的外部边界。', source: 'builtin-optional', category: 'testing' },
  { id: 'bug-fix-with-failing-test', title: 'bug fix 配回归测', text: 'bug fix PR 必须先有一个能复现 bug 的红测，然后 fix 让它变绿。同一个 diff。', source: 'builtin-optional', category: 'testing' },
  { id: 'no-merged-skip', title: 'it.skip 不准合入 main', text: '`it.skip` / `describe.skip` 不能进 main。临时 skip 必须有 issue 链接 + 24h 过期 TODO。', source: 'builtin-optional', category: 'testing' },
  { id: 'manual-test-ui-changes', title: 'UI 改动必须手动验证', text: 'Vitest 覆盖不到动画、时序、鼠标事件、真实网络。任何 UI 改动必须在跑起来的应用里点过 happy path 再宣告完成。', source: 'builtin-optional', category: 'testing' },

  // Git
  { id: 'conventional-commits', title: 'Conventional Commits', text: 'commit 格式：`type(scope): subject`。types: feat / fix / refactor / test / ci / docs / chore。', source: 'builtin-optional', category: 'git' },
  { id: 'imperative-commit-subject', title: 'subject 用祈使句', text: '"add"/"fix" 不是 "added"/"fixed"。≤ 72 字符。', source: 'builtin-optional', category: 'git' },
  { id: 'commit-body-explains-why', title: 'commit body 说 why 不说 what', text: 'diff 已经告诉读者 what。body 解释 why。', source: 'builtin-optional', category: 'git' },
  { id: 'no-amend-pushed', title: '不 amend 已 push 的 commit', text: '改写共享历史会破坏团队。需要修就建新 commit。', source: 'builtin-optional', category: 'git' },
  { id: 'no-force-push-main', title: '不 force-push 到 main / master', text: '保护分支永远不允许 force push。', source: 'builtin-optional', category: 'git' },
  { id: 'no-add-all', title: '不 git add -A / .', text: 'stage 文件按名字加，避免误带 .env / 大二进制 / 临时文件。', source: 'builtin-optional', category: 'git' },
  { id: 'show-diff-before-push', title: 'push / PR 前先给用户看 diff', text: '推之前显示 staged diff，拿到确认再推。不要自动 push。', source: 'builtin-optional', category: 'git' },

  // Security
  { id: 'parameterize-sql', title: 'SQL 必须参数化', text: '不用字符串拼接构造 SQL。用预编译参数或 ORM。', source: 'builtin-optional', category: 'security' },
  { id: 'validate-boundary-input', title: '系统边界输入必须校验 schema', text: 'HTTP 请求体、用户输入、外部 API 返回、文件 IO — 进系统第一步先 schema 校验。', source: 'builtin-optional', category: 'security' },
  { id: 'no-secrets-in-code', title: '不 commit 密钥', text: '不 commit `.env` / API key / token / 证书。即使用户要求也先警告。', source: 'builtin-optional', category: 'security' },
  { id: 'no-pii-in-logs', title: '日志不输出 PII', text: '日志不打邮箱 / 手机 / 真名 / 地址 / 信用卡 等。', source: 'builtin-optional', category: 'security' },

  // Architecture
  { id: 'class-business-fn-ui', title: '业务用 class、UI 用 function', text: 'Server / Manager / Calculator 用 class（OOP，可测）；React 组件用函数。', source: 'builtin-optional', category: 'architecture' },
  { id: 'no-feature-flags-for-temp', title: '临时性的不要 feature flag', text: '能直接改就直接改。feature flag 留给真正需要灰度的功能。', source: 'builtin-optional', category: 'architecture' },
  { id: 'no-backwards-compat-shims', title: '内部接口不留兼容层', text: '改内部接口时直接改所有调用方，不留 deprecated 通道 / re-export 旧名字。', source: 'builtin-optional', category: 'architecture' },
  { id: 'no-barrel-files', title: '不写桶文件', text: '不写纯 re-export 的 `index.ts`，除非目录确实导出 5+ 符号。', source: 'builtin-optional', category: 'architecture' },

  // Performance
  { id: 'no-premature-optimization', title: '没测过就不做性能优化', text: '先 profile / benchmark，再优化。不要凭直觉重构性能。', source: 'builtin-optional', category: 'performance' },
  { id: 'lazy-load-heavy-deps', title: '大依赖懒加载', text: '只在需要时 dynamic import 大库（PDF / 富文本编辑器 / 大图表库）。', source: 'builtin-optional', category: 'performance' },
  { id: 'avoid-n-plus-one', title: '检查 N+1 查询', text: '循环里不要单条查 DB / API。用 batch / join / IN clause。', source: 'builtin-optional', category: 'performance' },

  // Documentation
  { id: 'readme-has-setup-run-test', title: 'README 三段式', text: 'README 必须含 Setup（安装）/ Run（启动）/ Test（测试）三段。', source: 'builtin-optional', category: 'documentation' },
  { id: 'claude-md-up-to-date', title: 'CLAUDE.md 与代码同步', text: '改完代码同步更新 CLAUDE.md。文档漂移 = bug。', source: 'builtin-optional', category: 'documentation' },
]

export const BUILTIN_RULES: ReadonlyArray<BuiltinRuleDef> = [...DEFAULT_RULES, ...OPTIONAL_RULES]

// ── projectType → recommended optional categories ────────────────────────────

const PROJECT_TYPE_CATEGORIES: Record<ProjectType, ReadonlyArray<CodingRuleCategory>> = {
  'web-app':  ['discipline', 'react', 'css', 'testing', 'git', 'security'],
  'mobile':   ['discipline', 'react', 'testing', 'git', 'security'],
  'cli':      ['discipline', 'typescript', 'testing', 'git'],
  'library':  ['discipline', 'typescript', 'testing', 'git', 'documentation'],
  'data':     ['discipline', 'testing', 'git', 'security', 'performance'],
  'desktop':  ['discipline', 'react', 'testing', 'git'],
  'service':  ['discipline', 'typescript', 'testing', 'git', 'security', 'performance'],
  'other':    ['discipline', 'testing', 'git'],
}

export function recommendedOptionalRuleIds(projectType: ProjectType): ReadonlyArray<string> {
  const cats = PROJECT_TYPE_CATEGORIES[projectType]
  return OPTIONAL_RULES
    .filter(r => r.category && cats.includes(r.category))
    .map(r => r.id)
}

// ── Build initial rule set for a new harness ─────────────────────────────────

export function defaultRuleSet(projectType: ProjectType): CodingRule[] {
  const recommendedIds = new Set(recommendedOptionalRuleIds(projectType))
  return BUILTIN_RULES.map(def => ({
    id:       def.id,
    title:    def.title,
    text:     def.text,
    source:   def.source,
    category: def.category,
    enabled:  def.source === 'builtin-default' || recommendedIds.has(def.id),
  }))
}

// ── Default Definition of Done by projectType ────────────────────────────────

const DOD_TEMPLATES: Record<ProjectType, ReadonlyArray<string>> = {
  'web-app':  ['lint 绿', 'test 绿', '手动 happy path 跑通', 'PR 描述含 test plan'],
  'mobile':   ['lint 绿', 'test 绿', '在真机跑过一次', 'PR 描述含 test plan'],
  'cli':      ['lint 绿', 'test 绿', '在 README 列出的所有 OS 上跑过 --help'],
  'library':  ['lint 绿', 'test 绿', 'API 变更同步更新 README / changelog', '版本号按 semver 调整'],
  'data':     ['lint 绿', 'test 绿', '在小样本数据上 dry-run 验证输出 schema'],
  'desktop':  ['lint 绿', 'test 绿', '在跑起来的 app 里点过', 'installer 能装能卸'],
  'service':  ['lint 绿', 'test 绿', '本地 docker compose 起来跑通', 'OpenAPI / proto 同步更新'],
  'other':    ['lint 绿', 'test 绿'],
}

export function defaultDoD(projectType: ProjectType): string[] {
  return [...DOD_TEMPLATES[projectType]]
}
