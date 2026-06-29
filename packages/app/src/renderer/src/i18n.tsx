import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

export type LangCode = 'en' | 'zh' | 'ko'

export interface Translations {
  // Pill states
  statusIdle:      string
  statusStreaming: string
  statusWaiting:  string
  statusDone:     string
  // Island expanded
  weeklyUsage:    string
  sessions:       string
  apiSessions:    string
  newSession:     string
  stopAll:        string
  settings:       string
  // Quit-app button (Settings row, third button) + confirm popup
  quitApp:               string
  quitConfirmTitle:      string
  quitConfirmBody:       string
  quitConfirmBodyN:      (count: number) => string
  quitConfirmAction:     string
  quitConfirmCancel:     string
  // Settings panel
  language:       string
  // Settings → API zone
  api:                  string
  apiAddDeepseek:       string
  apiNone:              string
  apiKey:               string
  apiKeyPlaceholder:    string
  apiSave:              string
  apiCancel:            string
  apiEdit:              string
  apiRemove:            string
  apiTest:              string
  apiTesting:           string
  apiTestOk:            string
  apiTestEmptyKey:      string
  apiVaultUnavailable:  string
  apiKeyMasked:         string
  apiSavedNoTest:       string
  apiSwitchTitle:           string
  apiSwitchHistoryWarning:  string
  apiSwitchRestart:         string
  apiSwitchRestarting:      string
  apiSwitchOpenNew:         string
  apiSwitchPickerLabel:     string
  contextThresholdTitle:    string
  contextThresholdHint:     string
  contextCompact:           string
  contextHandoff:           string
  contextDismiss:           string
  // API session-row stats (Chunk E — balance + per-session usage)
  balance:    string
  thisWeek:   string
  // CLI settings carousel
  cli:           string
  claudeCodeCli: string
  cliStatus:    string
  cliDefault:   string
  claudeCliNotInstalled: string
  claudeCliLoggedIn:     string
  claudeCliNotLoggedIn:  string
  claudeCliAccount:      string
  claudeCliAnthropicAccount: string
  claudeCliVersion:      string
  claudeCliDetected:     string
  claudeCliStillNotDetected: string
  claudeCliDetectFailed: string
  // Codex CLI — settings panel + model picker + sessions
  codexCli:              string
  codexCliNotInstalled:  string
  codexCliInstallHint:   string
  codexCliDetectAgain:   string
  codexCliDetecting:     string
  codexCliDetected:      string
  codexCliStillNotDetected: string
  codexCliModel:         string
  codexCliPickerLabel:   string
  codexSessions:         string
  codexSwitchTitle:      string
  codexSwitchHint:       string
  codexReasoningEffort:  string
  codexEffortLow:        string
  codexEffortMedium:     string
  codexEffortHigh:       string
  codexEffortXhigh:      string
  effortMax:             string
  codexCliDetectFailed:  string
  newSessionEngineTitle: string
  newSessionEngineHint:  string
  newSessionClaudeHint:  string
  newSessionCodexHint:   string
  newSessionPermLabel:   string
  newSessionPermNormal:  string
  newSessionPermFull:    string
  newSessionPermFullHint: string
  codexProcessState:     string
  backgroundEnded:       string
  recoverCapabilityFull: string
  recoverCapabilityBestEffort: string
  recoverCapabilityBasic: string
  recoverExternal:       string
  // Pill ring / button hover hints (Chunk E follow-up — replaces native
  // title= tooltips that get clipped under the top-of-screen pill).
  contextHover:   string
  usage5hHover:   string
  sessionHover:   string
  resetsIn:       string
  harnessTooltip: string
  // macOS Accessibility banner (only shown when permission missing on darwin)
  accessibilityBannerTitle: string
  accessibilityBannerHint:  string
  accessibilityBannerBtn:   string
  // Corner-shrunk overlay text-bar (only shown when state == waiting or done
  // and overlayMode == 'corner-shrunk'; doesn't replace the popup, which
  // still surfaces the full question on click).
  overlayCornerQuestion: string
  overlayCornerDone:     string
  // Drop-zone labels shown during long-press drag.
  overlayDropCorner:     string
  overlayDropHide:       string
  overlayDropDefault:    string
  // Notifications
  responseComplete:   string
  claudeIsAsking:     string
  permissionRequired: string
  yes:                string
  always:             string
  no:                 string
  esc:                string
  enterKey:           string
  replyPlaceholder:   string
  // Remote control
  remoteControl:       string
  remoteIntro:         string
  remoteEnable:        string
  remoteEnabledTitle:  string
  remoteStep1:         string
  remoteStep2:         string
  remoteStep3:         string
  remoteUnavailable:   string
  remoteBack:          string
  remoteDone:          string
  remoteClose:         string
  remoteBusyText:      string
  // Harness wizard
  hwTitle:                 string
  hwSectionBasics:         string
  hwSectionBasicsHint:     string
  hwSectionArch:           string
  hwSectionArchHint:       string
  hwModeSelectTitle:       string
  hwModeSelectSubtitle:    string
  hwModeBeginnerLabel:     string
  hwModeBeginnerHint:      string
  hwModeProLabel:          string
  hwModeProHint:           string
  hwProjectName:           string
  hwProjectDesc:           string
  hwProjectDescHint:       string
  hwProjectDescPlaceholder:string
  hwProjectType:           string
  hwStack:                 string
  hwPackageManager:        string
  hwRuntime:               string
  hwCommands:              string
  hwCommandsHint:          string
  hwCommandKey:            string
  hwCommandValue:          string
  hwAddCommand:            string
  hwAdd:                   string
  hwDefinitionOfDone:      string
  hwCommitConvention:      string
  hwGenerate:              string
  hwGenerating:            string
  hwUpdate:                string
  hwWriting:               string
  hwSwitchGuided:          string
  hwSwitchManual:          string
  hwProBanner:             string
  hwClaudeMdTitle:         string
  hwClaudeMdQuestion:      string
  hwClaudeMdOverwrite:     string
  hwClaudeMdOverwriteHint: string
  hwClaudeMdAppend:        string
  hwClaudeMdAppendHint:    string
  hwClaudeMdCancel:        string
  hwClaudeMdCancelHint:    string
  hwArchBlurb:             string
  hwDefaultRules:          string
  hwCustomRulesTitle:      string
  hwCheckAll:              string
  hwUncheckAll:            string
  hwAddCustomRule:         string
  hwRuleTitlePlaceholder:  string
  hwRuleTextPlaceholder:   string
  hwFillNameFirst:         string
  hwMinCharsFormat:        (n: number) => string
  hwCharsMinimum:          string
  hwStatusWriting:         string
  hwStatusCancelled:       string
  // Category labels
  catDiscipline:    string
  catTypescript:    string
  catReact:         string
  catCss:           string
  catTesting:       string
  catGit:           string
  catSecurity:      string
  catArchitecture:  string
  catPerformance:   string
  catDocumentation: string
}

const en: Translations = {
  statusIdle:      'idle',
  statusStreaming: 'responding',
  statusWaiting:  'awaiting input',
  statusDone:     'complete',
  weeklyUsage:    'Weekly Usage',
  sessions:       'Claude Sessions',
  apiSessions:    'API Sessions',
  newSession:     'New Session',
  stopAll:        'Stop All',
  settings:       'Settings',
  quitApp:               'Quit',
  quitConfirmTitle:      'Quit CCC?',
  quitConfirmBody:       'Close CCC and exit completely?',
  quitConfirmBodyN:      n => `This will close ${n} active session${n === 1 ? '' : 's'} and exit CCC.`,
  quitConfirmAction:     'Quit',
  quitConfirmCancel:     'Cancel',
  language:       'Language',
  api:                 'API',
  apiAddDeepseek:      '+ Add DeepSeek',
  apiNone:             'No custom API configured',
  apiKey:              'API Key',
  apiKeyPlaceholder:   'Paste your API key',
  apiSave:             'Save',
  apiCancel:           'Cancel',
  apiEdit:             'Edit',
  apiRemove:           'Remove',
  apiTest:             'Test',
  apiTesting:          'Testing…',
  apiTestOk:           'Connected',
  apiTestEmptyKey:     'Enter a key first',
  apiVaultUnavailable: 'Encrypted storage unavailable on this system — key cannot be saved.',
  apiKeyMasked:        '••••••••••••',
  apiSavedNoTest:      'Saved (not yet tested)',
  apiSwitchTitle:           'Switch to API model',
  apiSwitchHistoryWarning:  'Conversation history will not carry over.',
  apiSwitchRestart:         'Restart this session',
  apiSwitchRestarting:      'Restarting…',
  apiSwitchOpenNew:         'Open a new session',
  apiSwitchPickerLabel:     'Custom APIs',
  contextThresholdTitle:    'Context window filling up',
  contextThresholdHint:     'Compact to summarize in place, or hand off to a fresh session.',
  contextCompact:           'Compact',
  contextHandoff:           'Hand off',
  contextDismiss:           'Dismiss',
  balance:    'Balance',
  thisWeek:   'This week',
  // CLI
  cli:           'CLI',
  claudeCodeCli: 'Claude Code CLI',
  cliStatus:    'Status',
  cliDefault:   'Default',
  claudeCliNotInstalled: 'Not installed',
  claudeCliLoggedIn:     'Logged in',
  claudeCliNotLoggedIn:  'Login not detected',
  claudeCliAccount:      'Account',
  claudeCliAnthropicAccount: 'Anthropic account',
  claudeCliVersion:      'Version',
  claudeCliDetected:     'Claude Code CLI detected',
  claudeCliStillNotDetected: 'Claude Code CLI still not detected',
  claudeCliDetectFailed: 'Claude Code CLI detection failed',
  // Codex CLI
  codexCli:              'Codex CLI',
  codexCliNotInstalled:  'Codex CLI not detected',
  codexCliInstallHint:   'Install it in your terminal, then check again.',
  codexCliDetectAgain:   'Check Again',
  codexCliDetecting:     'Checking...',
  codexCliDetected:      'Codex CLI detected',
  codexCliStillNotDetected: 'Still not detected',
  codexCliModel:         'Model',
  codexCliPickerLabel:   'Codex CLI',
  codexSessions:         'Codex Sessions',
  codexSwitchTitle:      'Switch Codex Model',
  codexSwitchHint:       "CCC will open /model and choose from Codex's native picker.",
  codexReasoningEffort:  'Reasoning effort',
  codexEffortLow:        'Low',
  codexEffortMedium:     'Medium',
  codexEffortHigh:       'High',
  codexEffortXhigh:      'Extra High',
  effortMax:             'Max',
  codexCliDetectFailed:  'Detection failed',
  newSessionEngineTitle: 'New Session',
  newSessionEngineHint:  'Choose which CLI to use.',
  newSessionClaudeHint:  'Claude hooks, DeepSeek, usage and context.',
  newSessionCodexHint:   'Codex CLI process with basic local state.',
  newSessionPermLabel:   'Permissions',
  newSessionPermNormal:  'Normal',
  newSessionPermFull:    'Full Access',
  newSessionPermFullHint: 'Skips every permission prompt. Use only in workspaces you trust.',
  codexProcessState:     'Process state',
  backgroundEnded:       'process ended',
  recoverCapabilityFull: 'Full monitoring',
  recoverCapabilityBestEffort: 'Best-effort control',
  recoverCapabilityBasic: 'Basic process control',
  recoverExternal:       'External',
  contextHover:   'Context',
  usage5hHover:   '5h Usage',
  sessionHover:   'Session:',
  resetsIn:       'resets in',
  harnessTooltip: 'CCC-Harness',
  accessibilityBannerTitle: 'macOS Accessibility permission required',
  accessibilityBannerHint:  'Open System Settings → Privacy & Security → Accessibility, then enable CCC. Without it, model switching and message replies silently fail.',
  accessibilityBannerBtn:   'Open System Settings',
  overlayCornerQuestion: 'Question pending',
  overlayCornerDone:     'Session complete',
  overlayDropCorner:     'Corner',
  overlayDropHide:       'Hide',
  overlayDropDefault:    'Default',
  responseComplete:   'Response complete',
  claudeIsAsking:     'Claude is asking',
  permissionRequired: 'Permission Required',
  yes:                'Yes',
  always:             'Always',
  no:                 'No',
  esc:                'ESC',
  enterKey:           'Enter ↵',
  replyPlaceholder:   'Type your reply…',
  remoteControl:       'Remote Control',
  remoteIntro:         'Drive this session from your phone or browser — chat and approve permissions while away from your computer, at home or out.',
  remoteEnable:        'Enable Remote Control',
  remoteEnabledTitle:  'Remote Control enabled',
  remoteStep1:         'Scan the QR / open the URL shown in this session’s terminal window — or find the session in the Claude app or claude.ai/code.',
  remoteStep2:         'To approve permission prompts from your phone: install the Claude app, then run /config and turn on “Push when actions required”.',
  remoteStep3:         'Works at home and away — traffic routes through Anthropic over HTTPS, no LAN needed.',
  remoteUnavailable:   'Remote Control needs a Claude (claude.ai) session. It’s not available for Codex or API-provider sessions.',
  remoteBack:          'Back',
  remoteDone:          'Done',
  remoteClose:         'Close',
  remoteBusyText:      'The session is currently responding. Wait until it finishes, then try again.',
  hwTitle:                 'Harness Wizard',
  hwSectionBasics:         'Basics',
  hwSectionBasicsHint:     'Project name, description, type, stack, commands',
  hwSectionArch:           'Architecture',
  hwSectionArchHint:       'Coding rules and constraints for AI',
  hwModeSelectTitle:       'Set up your harness',
  hwModeSelectSubtitle:    'How do you want to fill in the details?',
  hwModeBeginnerLabel:     'Guide me through it',
  hwModeBeginnerHint:      'Just write a project name + description + pick a type. CCC fills the rest with professional defaults you can tune later.',
  hwModeProLabel:          "I'll fill it in myself",
  hwModeProHint:           'Open the full editor — rules, DoD, commit style — and tune everything before generating.',
  hwProjectName:           'Project name',
  hwProjectDesc:           'Project description',
  hwProjectDescHint:       'Describe what it does, who uses it, the tech stack, and what matters most. This will appear verbatim in CLAUDE.md.',
  hwProjectDescPlaceholder:'e.g. A mobile expense-tracking app for small business owners. React Native + Node.js backend. Top priorities: fast receipt scanning and accounting export formats.',
  hwProjectType:           'Project type',
  hwStack:                 'Stack',
  hwPackageManager:        'Package manager',
  hwRuntime:               'Runtime',
  hwCommands:              'Commands',
  hwCommandsHint:          'Key = description (e.g. "build"), value = command (e.g. "pnpm build")',
  hwCommandKey:            'key',
  hwCommandValue:          'command',
  hwAddCommand:            '+ Add command',
  hwAdd:                   '+ Add',
  hwDefinitionOfDone:      'Definition of Done',
  hwCommitConvention:      'Commit convention',
  hwGenerate:              'Generate harness',
  hwGenerating:            'Generating…',
  hwUpdate:                'Update harness',
  hwWriting:               'Writing…',
  hwSwitchGuided:          "I'd rather fill it in myself →",
  hwSwitchManual:          'Switch to guided mode →',
  hwProBanner:             'Professional mode: tune any field, then click Update harness. Generation is instant — no AI, no spawn.',
  hwClaudeMdTitle:         'CLAUDE.md already exists',
  hwClaudeMdQuestion:      'This workspace already has a CLAUDE.md file. What would you like to do?',
  hwClaudeMdOverwrite:     'Overwrite',
  hwClaudeMdOverwriteHint: 'Old file is backed up as CLAUDE.md.bak.{timestamp}, new content replaces CLAUDE.md',
  hwClaudeMdAppend:        'Append import',
  hwClaudeMdAppendHint:    'Old CLAUDE.md gets @CCC-CLAUDE.md appended at the end, new content goes to CCC-CLAUDE.md (recommended)',
  hwClaudeMdCancel:        'Cancel',
  hwClaudeMdCancelHint:    'Leave all files unchanged',
  hwArchBlurb:             'Checked rules will be written into CLAUDE.md. Default rules are all pre-checked (universal rules for any project) — you can deselect individual ones. Optional rules are pre-selected by project type; checked ones appear in the "Project Discipline" section. You can add any number of custom rules.',
  hwDefaultRules:          'Default rules (universal — checked by default)',
  hwCustomRulesTitle:      'Project-specific custom rules',
  hwCheckAll:              'Check all',
  hwUncheckAll:            'Uncheck all',
  hwAddCustomRule:         '+ Add custom rule',
  hwRuleTitlePlaceholder:  'Rule title (one sentence)',
  hwRuleTextPlaceholder:   'Full rule text — gets copied verbatim into CLAUDE.md',
  hwFillNameFirst:         'Fill in project name first.',
  hwMinCharsFormat:        (n) => `Add ${n} more chars.`,
  hwCharsMinimum:          'chars minimum',
  hwStatusWriting:         'Writing CLAUDE.md…',
  hwStatusCancelled:       'Cancelled.',
  catDiscipline:    'Discipline',
  catTypescript:    'TypeScript',
  catReact:         'React',
  catCss:           'CSS',
  catTesting:       'Testing',
  catGit:           'Git / Commits',
  catSecurity:      'Security',
  catArchitecture:  'Architecture',
  catPerformance:   'Performance',
  catDocumentation: 'Documentation',
}

const zh: Translations = {
  statusIdle:      '空闲',
  statusStreaming: '响应中',
  statusWaiting:  '等待输入',
  statusDone:     '已完成',
  weeklyUsage:    '周用量',
  sessions:       'Claude 会话',
  apiSessions:    'API 会话',
  newSession:     '新建会话',
  stopAll:        '全部停止',
  settings:       '设置',
  quitApp:               '退出',
  quitConfirmTitle:      '退出 CCC?',
  quitConfirmBody:       '关闭 CCC 并完全退出?',
  quitConfirmBodyN:      n => `这将关闭 ${n} 个进行中的会话并退出 CCC。`,
  quitConfirmAction:     '退出',
  quitConfirmCancel:     '取消',
  language:       '语言',
  api:                 'API',
  apiAddDeepseek:      '+ 添加 DeepSeek',
  apiNone:             '未配置自定义 API',
  apiKey:              'API 密钥',
  apiKeyPlaceholder:   '粘贴你的 API 密钥',
  apiSave:             '保存',
  apiCancel:           '取消',
  apiEdit:             '编辑',
  apiRemove:           '移除',
  apiTest:             '测试',
  apiTesting:          '测试中…',
  apiTestOk:           '连接成功',
  apiTestEmptyKey:     '请先输入密钥',
  apiVaultUnavailable: '系统加密存储不可用 — 无法保存密钥。',
  apiKeyMasked:        '••••••••••••',
  apiSavedNoTest:      '已保存（未测试）',
  apiSwitchTitle:           '切换到 API 模型',
  apiSwitchHistoryWarning:  '当前对话历史不会保留。',
  apiSwitchRestart:         '重启当前会话',
  apiSwitchRestarting:      '重启中…',
  apiSwitchOpenNew:         '开一个新会话',
  apiSwitchPickerLabel:     '自定义 API',
  contextThresholdTitle:    '上下文窗口快满了',
  contextThresholdHint:     '可以压缩（就地总结当前对话），或切换到一个干净的新会话。',
  contextCompact:           '压缩',
  contextHandoff:           '切换会话',
  contextDismiss:           '关闭',
  balance:    '余额',
  thisWeek:   '本周',
  // CLI
  cli:           'CLI',
  claudeCodeCli: 'Claude Code CLI',
  cliStatus:    '状态',
  cliDefault:   '默认',
  claudeCliNotInstalled: '未安装',
  claudeCliLoggedIn:     '已登录',
  claudeCliNotLoggedIn:  '未检测到登录',
  claudeCliAccount:      '账户',
  claudeCliAnthropicAccount: 'Anthropic 账户',
  claudeCliVersion:      '版本',
  claudeCliDetected:     '已检测到 Claude Code CLI',
  claudeCliStillNotDetected: '仍未检测到 Claude Code CLI',
  claudeCliDetectFailed: 'Claude Code CLI 检测失败',
  // Codex CLI
  codexCli:              'Codex CLI',
  codexCliNotInstalled:  '未检测到 Codex CLI',
  codexCliInstallHint:   '请在终端中自行安装，然后重新检测。',
  codexCliDetectAgain:   '重新检测',
  codexCliDetecting:     '检测中...',
  codexCliDetected:      '已检测到 Codex CLI',
  codexCliStillNotDetected: '仍未检测到',
  codexCliModel:         '模型',
  codexCliPickerLabel:   'Codex CLI',
  codexSessions:         'Codex 会话',
  codexSwitchTitle:      '切换 Codex 模型',
  codexSwitchHint:       'CCC 会打开 /model，并在 Codex 原生选择器里完成选择。',
  codexReasoningEffort:  '智能能力',
  codexEffortLow:        '低',
  codexEffortMedium:     '中',
  codexEffortHigh:       '高',
  codexEffortXhigh:      '超高',
  effortMax:             '最高',
  codexCliDetectFailed:  '检测失败',
  newSessionEngineTitle: '新建会话',
  newSessionEngineHint:  '选择要使用的 CLI。',
  newSessionClaudeHint:  'Claude hooks、DeepSeek、usage 和 context。',
  newSessionCodexHint:   'Codex CLI 进程与基础本地状态。',
  newSessionPermLabel:   '权限',
  newSessionPermNormal:  '普通',
  newSessionPermFull:    '全权限',
  newSessionPermFullHint: '跳过所有权限提示，请仅在信任的工作区使用。',
  codexProcessState:     '进程状态',
  backgroundEnded:       '进程已结束',
  recoverCapabilityFull: '完整监控',
  recoverCapabilityBestEffort: '尽力控制',
  recoverCapabilityBasic: '基础进程控制',
  recoverExternal:       '外部进程',
  contextHover:   '上下文',
  usage5hHover:   '5 小时用量',
  sessionHover:   '本次会话:',
  resetsIn:       '重置剩余',
  harnessTooltip: 'CCC-Harness',
  accessibilityBannerTitle: '需要 macOS 辅助功能权限',
  accessibilityBannerHint:  '打开"系统设置 → 隐私与安全性 → 辅助功能"，然后启用 CCC。未授权时，切换模型和回复消息会静默失败。',
  accessibilityBannerBtn:   '打开系统设置',
  overlayCornerQuestion: '待回答',
  overlayCornerDone:     '已完成',
  overlayDropCorner:     '简约',
  overlayDropHide:       '隐藏',
  overlayDropDefault:    '默认',
  responseComplete:   '响应完成',
  claudeIsAsking:     'Claude 正在询问',
  permissionRequired: '需要授权',
  yes:                '允许',
  always:             '始终允许',
  no:                 '拒绝',
  esc:                'ESC',
  enterKey:           '确认 ↵',
  replyPlaceholder:   '输入回复…',
  remoteControl:       '远程控制',
  remoteIntro:         '在手机或浏览器上驱动这个会话——离开电脑时(在家或在外)也能聊天、批准权限。',
  remoteEnable:        '启用远程控制',
  remoteEnabledTitle:  '已启用远程控制',
  remoteStep1:         '扫描会话终端窗口里出现的二维码 / 打开那个网址,或在 Claude App、claude.ai/code 里找到这个会话。',
  remoteStep2:         '想在手机上批准权限请求:安装 Claude App,然后运行 /config,打开 “Push when actions required”。',
  remoteStep3:         '在家、在外都能用——流量经 Anthropic 走 HTTPS,不需要同一局域网。',
  remoteUnavailable:   '远程控制需要 Claude(claude.ai)会话,Codex / API 会话不支持。',
  remoteBack:          '返回',
  remoteDone:          '完成',
  remoteClose:         '关闭',
  remoteBusyText:      '当前会话正在响应中，请等待完成后再试。',
  hwTitle:                 '配置向导',
  hwSectionBasics:         '基本信息',
  hwSectionBasicsHint:     '项目名称、描述、类型、技术栈、命令',
  hwSectionArch:           '架构规则',
  hwSectionArchHint:       '供 AI 参考的编码规范与约束',
  hwModeSelectTitle:       '配置你的工作区',
  hwModeSelectSubtitle:    '以哪种方式填写配置？',
  hwModeBeginnerLabel:     '引导我完成',
  hwModeBeginnerHint:      '只需填写项目名称、描述和类型，CCC 会用专业默认值补充其余内容，之后可自由调整。',
  hwModeProLabel:          '我自己填写',
  hwModeProHint:           '打开完整编辑器，规则、完成标准、提交风格等均可自定义后再生成。',
  hwProjectName:           '项目名称',
  hwProjectDesc:           '项目描述',
  hwProjectDescHint:       '写清楚做什么、给谁用、技术栈（知道的话）、最在意什么。这段会原样写进 CLAUDE.md。',
  hwProjectDescPlaceholder:'例：一个给小型企业主用的移动端记账 app。React Native + Node.js 后端。最在意拍照识别票据的速度和导出会计软件的格式。',
  hwProjectType:           '项目类型',
  hwStack:                 '技术栈',
  hwPackageManager:        '包管理器',
  hwRuntime:               '运行时',
  hwCommands:              '命令',
  hwCommandsHint:          '键 = 描述（如 "build"），值 = 命令（如 "pnpm build"）',
  hwCommandKey:            '键',
  hwCommandValue:          '命令',
  hwAddCommand:            '+ 添加命令',
  hwAdd:                   '+ 添加',
  hwDefinitionOfDone:      '完成标准',
  hwCommitConvention:      '提交规范',
  hwGenerate:              '生成配置',
  hwGenerating:            '生成中…',
  hwUpdate:                '更新配置',
  hwWriting:               '写入中…',
  hwSwitchGuided:          '我想自己填写 →',
  hwSwitchManual:          '切换到引导模式 →',
  hwProBanner:             '专业模式：调整任意字段，然后点击更新配置。生成是即时的，无 AI 调用。',
  hwClaudeMdTitle:         'CLAUDE.md 已存在',
  hwClaudeMdQuestion:      '此工作区已有 CLAUDE.md 文件，如何处理？',
  hwClaudeMdOverwrite:     '覆盖',
  hwClaudeMdOverwriteHint: '旧文件备份为 CLAUDE.md.bak.{时间戳}，新内容写入 CLAUDE.md',
  hwClaudeMdAppend:        '追加引用',
  hwClaudeMdAppendHint:    '旧 CLAUDE.md 末尾追加 @CCC-CLAUDE.md，新内容写入 CCC-CLAUDE.md（推荐）',
  hwClaudeMdCancel:        '取消',
  hwClaudeMdCancelHint:    '不修改任何文件',
  hwArchBlurb:             '勾选的规则会写进 CLAUDE.md。默认规则全部预先勾选（适用于所有项目），可逐条取消。可选规则按项目类型预选，勾选的会出现在 CLAUDE.md 的"项目纪律"段落。可添加任意数量的自定义规则。',
  hwDefaultRules:          '默认规则（通用规则 — 默认勾选）',
  hwCustomRulesTitle:      '本项目自定义规则',
  hwCheckAll:              '全选',
  hwUncheckAll:            '全不选',
  hwAddCustomRule:         '+ 添加自定义规则',
  hwRuleTitlePlaceholder:  '规则标题（一句话）',
  hwRuleTextPlaceholder:   '完整规则内容 — 将原样复制到 CLAUDE.md',
  hwFillNameFirst:         '请先填写项目名称。',
  hwMinCharsFormat:        (n) => `还需 ${n} 个字符。`,
  hwCharsMinimum:          '字符（最少）',
  hwStatusWriting:         '写入 CLAUDE.md…',
  hwStatusCancelled:       '已取消。',
  catDiscipline:    '纪律',
  catTypescript:    'TypeScript',
  catReact:         'React',
  catCss:           'CSS',
  catTesting:       '测试',
  catGit:           'Git / 提交',
  catSecurity:      '安全',
  catArchitecture:  '架构',
  catPerformance:   '性能',
  catDocumentation: '文档',
}

const ko: Translations = {
  statusIdle:      '대기 중',
  statusStreaming: '응답 중',
  statusWaiting:  '입력 대기',
  statusDone:     '완료',
  weeklyUsage:    '주간 사용량',
  sessions:       'Claude 세션',
  apiSessions:    'API 세션',
  newSession:     '새 세션',
  stopAll:        '모두 중지',
  settings:       '설정',
  quitApp:               '종료',
  quitConfirmTitle:      'CCC 종료?',
  quitConfirmBody:       'CCC를 닫고 완전히 종료하시겠습니까?',
  quitConfirmBodyN:      n => `진행 중인 ${n}개 세션을 닫고 CCC를 종료합니다.`,
  quitConfirmAction:     '종료',
  quitConfirmCancel:     '취소',
  language:       '언어',
  api:                 'API',
  apiAddDeepseek:      '+ DeepSeek 추가',
  apiNone:             '사용자 정의 API가 없습니다',
  apiKey:              'API 키',
  apiKeyPlaceholder:   'API 키를 붙여넣으세요',
  apiSave:             '저장',
  apiCancel:           '취소',
  apiEdit:             '편집',
  apiRemove:           '제거',
  apiTest:             '테스트',
  apiTesting:          '테스트 중…',
  apiTestOk:           '연결됨',
  apiTestEmptyKey:     '먼저 키를 입력하세요',
  apiVaultUnavailable: '암호화 저장소를 사용할 수 없어 키를 저장할 수 없습니다.',
  apiKeyMasked:        '••••••••••••',
  apiSavedNoTest:      '저장됨 (테스트되지 않음)',
  apiSwitchTitle:           'API 모델로 전환',
  apiSwitchHistoryWarning:  '현재 대화 내역은 유지되지 않습니다.',
  apiSwitchRestart:         '현재 세션 재시작',
  apiSwitchRestarting:      '재시작 중…',
  apiSwitchOpenNew:         '새 세션 열기',
  apiSwitchPickerLabel:     '사용자 정의 API',
  contextThresholdTitle:    '컨텍스트 창이 가득 차고 있습니다',
  contextThresholdHint:     '압축（현재 대화 요약）하거나 새 세션으로 핸드오프하세요.',
  contextCompact:           '압축',
  contextHandoff:           '핸드오프',
  contextDismiss:           '닫기',
  balance:    '잔액',
  thisWeek:   '이번 주',
  // CLI
  cli:           'CLI',
  claudeCodeCli: 'Claude Code CLI',
  cliStatus:    '상태',
  cliDefault:   '기본',
  claudeCliNotInstalled: '설치되지 않음',
  claudeCliLoggedIn:     '로그인됨',
  claudeCliNotLoggedIn:  '로그인이 감지되지 않음',
  claudeCliAccount:      '계정',
  claudeCliAnthropicAccount: 'Anthropic 계정',
  claudeCliVersion:      '버전',
  claudeCliDetected:     'Claude Code CLI 감지됨',
  claudeCliStillNotDetected: 'Claude Code CLI가 아직 감지되지 않음',
  claudeCliDetectFailed: 'Claude Code CLI 감지 실패',
  // Codex CLI
  codexCli:              'Codex CLI',
  codexCliNotInstalled:  'Codex CLI가 감지되지 않음',
  codexCliInstallHint:   '터미널에서 직접 설치한 뒤 다시 확인하세요.',
  codexCliDetectAgain:   '다시 확인',
  codexCliDetecting:     '확인 중...',
  codexCliDetected:      'Codex CLI 감지됨',
  codexCliStillNotDetected: '아직 감지되지 않음',
  codexCliModel:         '모델',
  codexCliPickerLabel:   'Codex CLI',
  codexSessions:         'Codex 세션',
  codexSwitchTitle:      'Codex 모델 전환',
  codexSwitchHint:       'CCC가 /model을 열고 Codex 기본 선택기에서 선택합니다.',
  codexReasoningEffort:  '추론 강도',
  codexEffortLow:        '낮음',
  codexEffortMedium:     '중간',
  codexEffortHigh:       '높음',
  codexEffortXhigh:      '매우 높음',
  effortMax:             '최대',
  codexCliDetectFailed:  '감지 실패',
  newSessionEngineTitle: '새 세션',
  newSessionEngineHint:  '사용할 CLI를 선택하세요.',
  newSessionClaudeHint:  'Claude hooks, DeepSeek, usage 및 context.',
  newSessionCodexHint:   'Codex CLI 프로세스와 기본 로컬 상태.',
  newSessionPermLabel:   '권한',
  newSessionPermNormal:  '일반',
  newSessionPermFull:    '전체 권한',
  newSessionPermFullHint: '모든 권한 프롬프트를 건너뜁니다. 신뢰하는 작업 공간에서만 사용하세요.',
  codexProcessState:     '프로세스 상태',
  backgroundEnded:       '프로세스 종료됨',
  recoverCapabilityFull: '전체 모니터링',
  recoverCapabilityBestEffort: '최선형 제어',
  recoverCapabilityBasic: '기본 프로세스 제어',
  recoverExternal:       '외부',
  contextHover:   '컨텍스트',
  usage5hHover:   '5시간 사용량',
  sessionHover:   '이번 세션:',
  resetsIn:       '리셋까지',
  harnessTooltip: 'CCC-Harness',
  accessibilityBannerTitle: 'macOS 손쉬운 사용 권한 필요',
  accessibilityBannerHint:  '시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용에서 CCC를 활성화하세요. 권한 없이는 모델 전환과 답장이 조용히 실패합니다.',
  accessibilityBannerBtn:   '시스템 설정 열기',
  overlayCornerQuestion: '답변 대기',
  overlayCornerDone:     '완료됨',
  overlayDropCorner:     '구석',
  overlayDropHide:       '숨김',
  overlayDropDefault:    '기본',
  responseComplete:   '응답 완료',
  claudeIsAsking:     'Claude가 묻습니다',
  permissionRequired: '권한 필요',
  yes:                '허용',
  always:             '항상 허용',
  no:                 '거부',
  esc:                'ESC',
  enterKey:           '확인 ↵',
  replyPlaceholder:   '답변을 입력하세요…',
  remoteControl:       '원격 제어',
  remoteIntro:         '휴대폰이나 브라우저에서 이 세션을 조작하세요 — 컴퓨터를 떠나 있어도(집이든 외출이든) 대화하고 권한을 승인할 수 있습니다.',
  remoteEnable:        '원격 제어 활성화',
  remoteEnabledTitle:  '원격 제어가 활성화됨',
  remoteStep1:         '이 세션의 터미널 창에 표시되는 QR을 스캔하거나 URL을 여세요 — 또는 Claude 앱 / claude.ai/code에서 세션을 찾으세요.',
  remoteStep2:         '휴대폰에서 권한 요청을 승인하려면: Claude 앱을 설치한 뒤 /config에서 “Push when actions required”를 켜세요.',
  remoteStep3:         '집에서도 외부에서도 작동합니다 — 트래픽은 Anthropic을 통해 HTTPS로 전달되며 같은 네트워크가 필요 없습니다.',
  remoteUnavailable:   '원격 제어에는 Claude(claude.ai) 세션이 필요합니다. Codex / API 세션에서는 사용할 수 없습니다.',
  remoteBack:          '뒤로',
  remoteDone:          '완료',
  remoteClose:         '닫기',
  remoteBusyText:      '세션이 현재 응답 중입니다. 완료될 때까지 기다린 후 다시 시도하세요.',
  hwTitle:                 '하네스 마법사',
  hwSectionBasics:         '기본 정보',
  hwSectionBasicsHint:     '프로젝트 이름, 설명, 유형, 스택, 명령어',
  hwSectionArch:           '아키텍처 규칙',
  hwSectionArchHint:       'AI를 위한 코딩 규칙 및 제약 조건',
  hwModeSelectTitle:       '하네스를 설정하세요',
  hwModeSelectSubtitle:    '어떻게 세부 정보를 입력하시겠습니까?',
  hwModeBeginnerLabel:     '안내해 주세요',
  hwModeBeginnerHint:      '프로젝트 이름, 설명, 유형만 입력하면 CCC가 나머지를 전문적인 기본값으로 채워드립니다.',
  hwModeProLabel:          '직접 입력하겠습니다',
  hwModeProHint:           '전체 편집기를 열어 규칙, 완료 기준, 커밋 스타일 등을 모두 조정한 후 생성하세요.',
  hwProjectName:           '프로젝트 이름',
  hwProjectDesc:           '프로젝트 설명',
  hwProjectDescHint:       '무엇을 하는지, 누가 사용하는지, 기술 스택, 가장 중요한 것을 설명하세요. 이 내용이 CLAUDE.md에 그대로 삽입됩니다.',
  hwProjectDescPlaceholder:'예: 중소기업주를 위한 모바일 지출 관리 앱. React Native + Node.js 백엔드. 영수증 빠른 스캔과 회계 소프트웨어 내보내기 형식이 가장 중요합니다.',
  hwProjectType:           '프로젝트 유형',
  hwStack:                 '스택',
  hwPackageManager:        '패키지 관리자',
  hwRuntime:               '런타임',
  hwCommands:              '명령어',
  hwCommandsHint:          '키 = 설명 (예: "build"), 값 = 명령어 (예: "pnpm build")',
  hwCommandKey:            '키',
  hwCommandValue:          '명령어',
  hwAddCommand:            '+ 명령어 추가',
  hwAdd:                   '+ 추가',
  hwDefinitionOfDone:      '완료 기준',
  hwCommitConvention:      '커밋 규칙',
  hwGenerate:              '하네스 생성',
  hwGenerating:            '생성 중…',
  hwUpdate:                '하네스 업데이트',
  hwWriting:               '작성 중…',
  hwSwitchGuided:          '직접 입력하겠습니다 →',
  hwSwitchManual:          '안내 모드로 전환 →',
  hwProBanner:             '전문가 모드: 필드를 조정하고 하네스 업데이트를 클릭하세요. 생성은 즉시 이루어집니다.',
  hwClaudeMdTitle:         'CLAUDE.md가 이미 존재합니다',
  hwClaudeMdQuestion:      '이 작업 공간에 이미 CLAUDE.md 파일이 있습니다. 어떻게 처리하시겠습니까?',
  hwClaudeMdOverwrite:     '덮어쓰기',
  hwClaudeMdOverwriteHint: '이전 파일을 CLAUDE.md.bak.{타임스탬프}로 백업하고 CLAUDE.md에 새 내용 작성',
  hwClaudeMdAppend:        '가져오기 추가',
  hwClaudeMdAppendHint:    '이전 CLAUDE.md 끝에 @CCC-CLAUDE.md를 추가하고 새 내용을 CCC-CLAUDE.md에 작성 (권장)',
  hwClaudeMdCancel:        '취소',
  hwClaudeMdCancelHint:    '모든 파일 변경 없음',
  hwArchBlurb:             '체크된 규칙이 CLAUDE.md에 작성됩니다. 기본 규칙은 모두 미리 선택됩니다(모든 프로젝트에 적용되는 일반 규칙). 선택적 규칙은 프로젝트 유형에 따라 미리 선택됩니다. 사용자 정의 규칙을 원하는 만큼 추가할 수 있습니다.',
  hwDefaultRules:          '기본 규칙 (일반 규칙 — 기본 선택됨)',
  hwCustomRulesTitle:      '프로젝트별 사용자 정의 규칙',
  hwCheckAll:              '모두 선택',
  hwUncheckAll:            '모두 해제',
  hwAddCustomRule:         '+ 사용자 정의 규칙 추가',
  hwRuleTitlePlaceholder:  '규칙 제목 (한 문장)',
  hwRuleTextPlaceholder:   '전체 규칙 텍스트 — CLAUDE.md에 그대로 복사됩니다',
  hwFillNameFirst:         '먼저 프로젝트 이름을 입력하세요.',
  hwMinCharsFormat:        (n) => `${n}자 더 입력하세요.`,
  hwCharsMinimum:          '자 이상 필요',
  hwStatusWriting:         'CLAUDE.md 작성 중…',
  hwStatusCancelled:       '취소되었습니다.',
  catDiscipline:    '규율',
  catTypescript:    'TypeScript',
  catReact:         'React',
  catCss:           'CSS',
  catTesting:       '테스팅',
  catGit:           'Git / 커밋',
  catSecurity:      '보안',
  catArchitecture:  '아키텍처',
  catPerformance:   '성능',
  catDocumentation: '문서화',
}

export const TRANSLATIONS: Readonly<Record<LangCode, Translations>> = { en, zh, ko }

export const LANG_LABELS: Readonly<Record<LangCode, string>> = {
  en: 'EN',
  zh: '中文',
  ko: '한국어',
}

interface LangContextValue {
  lang:    LangCode
  setLang: (code: LangCode) => void
  t:       Translations
}

const LangContext = createContext<LangContextValue | null>(null)

// localStorage can be absent or throw (private-mode quirks, embedded/headless
// environments, test runners that tear the global down) — never let language
// persistence crash the whole renderer.
function readStoredLang(): LangCode | null {
  try {
    const saved = globalThis.localStorage?.getItem('ccc-lang')
    return (saved === 'zh' || saved === 'ko') ? saved : null
  } catch { return null }
}

function writeStoredLang(code: LangCode): void {
  try { globalThis.localStorage?.setItem('ccc-lang', code) } catch { /* non-fatal */ }
}

export function LangProvider({ children }: { children: ReactNode }): JSX.Element {
  const [lang, setLangState] = useState<LangCode>(() => readStoredLang() ?? 'en')

  const setLang = (code: LangCode): void => {
    writeStoredLang(code)
    setLangState(code)
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t: TRANSLATIONS[lang] }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang(): Translations {
  return useContext(LangContext)?.t ?? TRANSLATIONS.en
}

export function useLangContext(): LangContextValue {
  return useContext(LangContext) ?? { lang: 'en', setLang: () => {}, t: TRANSLATIONS.en }
}
