// i18n strings for the harness visualization dashboard. Mirrors the pattern in
// HarnessWizard.tsx (Record<LangCode, …>). Korean falls back to English for the
// dashboard's labels (the app's primary audiences here are zh / en).
import type { LangCode } from '../i18n'

export interface DashStrings {
  // shell
  title:        string
  close:        string
  loading:      string
  notInstalled: string
  notInstalledHint: string
  // tabs
  tabOverview:     string
  tabInfo:         string
  tabConstitution: string
  tabWorkflow:     string
  tabTodo:         string
  tabHistory:      string
  // overview
  currentFocus:   string
  noActiveFeature: string
  stageOf:        string          // "Stage {n}/9"
  recentActivity: string
  noActivity:     string
  progressSummary: string
  // info
  techStack:      string
  primaryConcern: string
  teamSize:       string
  projectStage:   string
  description:    string
  identity:       string
  noInfo:         string
  // constitution
  noConstitution: string
  // workflow
  theNineStages:  string
  tplCustomized:  string
  theThreeLanes:  string
  liveProgress:   string
  lane:           string
  filesProgress:  string          // "{done}/{total} files"
  resumeHint:     string
  audits:         string
  decisions:      string
  noCheckpoints:  string
  // todolist
  todoDone:   string
  todoDoing:  string
  todoTodo:   string
  todoEmpty:  string
  todoEmptyHint: string
  itemsProgress: string           // "{done}/{total}"
  fnPlanned:    string
  fnInProgress: string
  fnDone:       string
  fnAbandoned:  string
  overall:      string
  // history
  noHistory:    string
  toolsUsed:    string            // "{n} tool calls"
  you:          string
  ai:           string
  // update CCC-MAGI (overview)
  updateTitle:      string
  updateMagi:       string
  updateChecking:   string
  updateUpToDate:   string
  updateDone:       string
  updateDirtyTitle: string
  updateDirtyBody:  string
  updateForce:      string
  updateForceHint:  string
  updateCommitTip:  string
  updateError:      string
  updateRetry:      string
  // memory page (replaces the old History tab)
  tabMemory:        string
  memSubMemory:     string
  memSubHistory:    string
  memMemoryNote:    string
  memHistoryNote:   string
  memWorking:       string
  memRecall:        string
  memSnapshots:     string
  memArchive:       string
  memConventions:   string
  memEmpty:         string
  memScratchpadEmpty: string
  sessResume:       string
  sessMessages:     string   // "{n} messages"
  sessEmpty:        string
  sessLoading:      string
  sessBack:         string
  // overview stats strip
  statTokens:       string
  statSessions:     string
  statMessages:     string
  statToolCalls:    string
  statDecisions:    string
  statTokensBreakdown: string   // "in {in} · out {out} · cache {cache}"
  statActiveRange:  string      // "{from} → {to}"
  // overview insight panels
  insightFeatures:  string
  insightAudits:    string
  insightTools:     string
  insightActivity:  string
  insightMemory:    string
  featDone:         string      // "{done}/{total} done"
  auditPass:        string
  auditConcerns:    string
  auditFail:        string
  auditWaived:      string
}

const EN: DashStrings = {
  title: 'Project Console',
  close: 'Close',
  loading: 'Reading project state…',
  notInstalled: 'CCC-MAGI is not installed in this project',
  notInstalledHint: 'Install the harness first, then the console will show this project’s state here.',
  tabOverview: 'Overview',
  tabInfo: 'Project',
  tabConstitution: 'Constitution',
  tabWorkflow: 'Workflow',
  tabTodo: 'Todolist',
  tabHistory: 'AI History',
  currentFocus: 'Current focus',
  noActiveFeature: 'No feature in progress',
  stageOf: 'Stage {n}/9',
  recentActivity: 'Recent activity',
  noActivity: 'No recorded decisions yet.',
  progressSummary: 'Progress',
  techStack: 'Tech stack',
  primaryConcern: 'Primary concern',
  teamSize: 'Team size',
  projectStage: 'Stage',
  description: 'Description',
  identity: 'Project identity',
  noInfo: 'No project info found.',
  noConstitution: 'No constitution.md found.',
  theNineStages: 'The 9 workflow stages',
  tplCustomized: 'customized',
  theThreeLanes: 'Three lanes',
  liveProgress: 'Active features',
  lane: 'Lane',
  filesProgress: '{done}/{total} files',
  resumeHint: 'Next',
  audits: 'Audits',
  decisions: 'Decisions',
  noCheckpoints: 'No active features. Start one and its progress shows here.',
  todoDone: 'Done',
  todoDoing: 'In progress',
  todoTodo: 'Planned',
  todoEmpty: 'No todolist yet',
  todoEmptyHint: 'Start a feature and the work gets recorded here automatically.',
  itemsProgress: '{done}/{total}',
  fnPlanned: 'planned',
  fnInProgress: 'in progress',
  fnDone: 'done',
  fnAbandoned: 'abandoned',
  overall: 'Overall',
  noHistory: 'No AI conversation history for this project yet.',
  toolsUsed: '{n} tool call(s)',
  you: 'You',
  ai: 'MAGI',
  updateTitle:      'Harness',
  updateMagi:       'Update CCC-MAGI',
  updateChecking:   'Checking and updating…',
  updateUpToDate:   'Already up to date.',
  updateDone:       'Updated to the latest. The update changed project files — remember to commit them in git.',
  updateDirtyTitle: 'Can’t update safely',
  updateDirtyBody:  'Your workspace has uncommitted changes (often left by the last update, or your own edits). CCC-MAGI needs a clean tree so its updates don’t mix with your changes.',
  updateForce:      'Force update',
  updateForceHint:  'Updates anyway. Your edited constitution.md / CLAUDE.md / AGENTS.md are backed up first, then replaced with the latest templates.',
  updateCommitTip:  'Or run “git commit” in the terminal first, then update again.',
  updateError:      'Update failed',
  updateRetry:      'Retry',
  tabMemory:        'Memory',
  memSubMemory:     'Memory',
  memSubHistory:    'History',
  memMemoryNote:    'CCC-MAGI’s distilled memory — summaries, not raw chat.',
  memHistoryNote:   'Claude Code sessions for this workspace — the same list as /resume.',
  memWorking:       'Working memory',
  memRecall:        'Recall',
  memSnapshots:     'Session snapshots',
  memArchive:       'Archive',
  memConventions:   'Conventions',
  memEmpty:         'No memory entries yet.',
  memScratchpadEmpty: 'No working memory yet.',
  sessResume:       'Resume this session',
  sessMessages:     '{n} messages',
  sessEmpty:        'No sessions recorded for this workspace yet.',
  sessLoading:      'Loading…',
  sessBack:         '← Back to sessions',
  statTokens:       'Tokens used',
  statSessions:     'Sessions',
  statMessages:     'Messages',
  statToolCalls:    'Tool calls',
  statDecisions:    'Decisions',
  statTokensBreakdown: 'in {in} · out {out} · cache {cache}',
  statActiveRange:  '{from} → {to}',
  insightFeatures:  'Feature completion',
  insightAudits:    'Workflow health',
  insightTools:     'Top tools',
  insightActivity:  'Activity (14d)',
  insightMemory:    'Memory footprint',
  featDone:         '{done}/{total} done',
  auditPass:        'Pass',
  auditConcerns:    'Concerns',
  auditFail:        'Fail',
  auditWaived:      'Waived',
}

const ZH: DashStrings = {
  title: '项目控制台',
  close: '关闭',
  loading: '正在读取项目状态…',
  notInstalled: '此项目尚未安装 CCC-MAGI',
  notInstalledHint: '先安装 harness，控制台就会在这里展示这个项目的状态。',
  tabOverview: '总览',
  tabInfo: '简介',
  tabConstitution: '宪法',
  tabWorkflow: '工作流',
  tabTodo: '待办',
  tabHistory: '对话史',
  currentFocus: '当前焦点',
  noActiveFeature: '当前没有进行中的功能',
  stageOf: '第 {n}/9 阶段',
  recentActivity: '最近动态',
  noActivity: '暂无决策记录。',
  progressSummary: '进度',
  techStack: '技术栈',
  primaryConcern: '主要关注',
  teamSize: '团队规模',
  projectStage: '阶段',
  description: '简介',
  identity: '项目身份',
  noInfo: '没有找到项目信息。',
  noConstitution: '没有找到 constitution.md。',
  theNineStages: '工作流 9 个阶段',
  tplCustomized: '已定制',
  theThreeLanes: '三条通道',
  liveProgress: '进行中的功能',
  lane: '通道',
  filesProgress: '{done}/{total} 个文件',
  resumeHint: '下一步',
  audits: '审计',
  decisions: '决策',
  noCheckpoints: '当前没有进行中的功能。开始一个，进度会显示在这里。',
  todoDone: '已完成',
  todoDoing: '进行中',
  todoTodo: '待办',
  todoEmpty: '暂无待办',
  todoEmptyHint: '开始一个功能后，工作会自动记录在这里。',
  itemsProgress: '{done}/{total}',
  fnPlanned: '计划中',
  fnInProgress: '进行中',
  fnDone: '已完成',
  fnAbandoned: '已放弃',
  overall: '总计',
  noHistory: '这个项目暂时没有 AI 对话记录。',
  toolsUsed: '{n} 次工具调用',
  you: '你',
  ai: 'MAGI',
  updateTitle:      'Harness 维护',
  updateMagi:       '更新 CCC-MAGI',
  updateChecking:   '正在检查并更新…',
  updateUpToDate:   '已是最新版本。',
  updateDone:       '已更新到最新。更新修改了项目文件，记得在 git 里提交这些改动。',
  updateDirtyTitle: '无法安全更新',
  updateDirtyBody:  '工作区有未提交改动（常常是上次更新留下的，或你自己的修改）。CCC-MAGI 需要干净的工作区，以免把更新和你的改动混在一起。',
  updateForce:      '强制更新',
  updateForceHint:  '直接覆盖更新。你改过的 constitution.md / CLAUDE.md / AGENTS.md 会先备份，再用最新模板覆盖。',
  updateCommitTip:  '或在终端先运行 “git commit” 提交改动，再更新。',
  updateError:      '更新失败',
  updateRetry:      '重试',
  tabMemory:        '记忆',
  memSubMemory:     '记忆',
  memSubHistory:    '历史记录',
  memMemoryNote:    'CCC-MAGI 的分层蒸馏记忆——摘要,不是逐条原始对话。',
  memHistoryNote:   '该工作区的 Claude Code 会话记录,等同于 /resume 的列表。',
  memWorking:       '工作记忆',
  memRecall:        '召回记忆',
  memSnapshots:     '会话快照',
  memArchive:       '归档',
  memConventions:   '约定',
  memEmpty:         '暂无记忆记录。',
  memScratchpadEmpty: '暂无工作记忆。',
  sessResume:       '回到这个会话',
  sessMessages:     '{n} 条消息',
  sessEmpty:        '该工作区暂无会话记录。',
  sessLoading:      '加载中…',
  sessBack:         '← 返回会话列表',
  statTokens:       '已用 Tokens',
  statSessions:     '会话数',
  statMessages:     '消息数',
  statToolCalls:    '工具调用',
  statDecisions:    '决策数',
  statTokensBreakdown: '入 {in} · 出 {out} · 缓存 {cache}',
  statActiveRange:  '{from} → {to}',
  insightFeatures:  '功能完成度',
  insightAudits:    '工作流健康度',
  insightTools:     '常用工具',
  insightActivity:  '活跃度(14 天)',
  insightMemory:    '记忆足迹',
  featDone:         '已完成 {done}/{total}',
  auditPass:        '通过',
  auditConcerns:    '存疑',
  auditFail:        '未通过',
  auditWaived:      '豁免',
}

const STR: Record<LangCode, DashStrings> = { en: EN, zh: ZH, ko: EN }

export function getStrings(lang: LangCode): DashStrings {
  return STR[lang] ?? EN
}

export function fmt(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}
