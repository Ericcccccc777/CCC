export type ProjectType =
  | 'web-app' | 'mobile' | 'cli' | 'library'
  | 'data'    | 'desktop' | 'service' | 'other'

export type CommitStyle = 'conventional' | 'free'

export type CodingRuleSource = 'builtin-default' | 'builtin-optional' | 'user-defined'

export type CodingRuleCategory =
  | 'discipline' | 'typescript' | 'react' | 'css'
  | 'testing'    | 'git'        | 'security'
  | 'architecture' | 'performance' | 'documentation'

export interface CodingRule {
  id?:       string
  title:     string
  text:      string
  enabled:   boolean
  source:    CodingRuleSource
  category?: CodingRuleCategory
}

export interface HarnessConfig {
  version: '2'
  basics: {
    name:           string
    description:    string
    projectType:    ProjectType
    stack:          string
    runtime:        string
    packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'other'
    commands:       Record<string, string>
  }
  architecture: {
    codingRules:      CodingRule[]
    definitionOfDone: string[]
    commitConvention: CommitStyle
  }
  meta: {
    outputPath?:   'claude-md' | 'ccc-claude-md'
    generatedAt?:  string
  }
}

export interface FileConflict {
  path: string
  type: 'claude-md' | 'agent' | 'skill' | 'command' | 'other'
}

export type ConflictResolution = 'overwrite' | 'append' | 'skip'

export interface HarnessCheckResult {
  hasConfig:   boolean
  hasClaudeMd: boolean
}

export const PROJECT_TYPE_LABELS: ReadonlyArray<{ value: ProjectType; label: string }> = [
  { value: 'web-app',  label: 'Web app' },
  { value: 'mobile',   label: 'Mobile app' },
  { value: 'cli',      label: 'CLI tool' },
  { value: 'library',  label: 'Library / SDK' },
  { value: 'data',     label: 'Data / ETL pipeline' },
  { value: 'desktop',  label: 'Desktop app' },
  { value: 'service',  label: 'Backend service / API' },
  { value: 'other',    label: 'Other' },
]

export function defaultHarnessConfig(): HarnessConfig {
  return {
    version: '2',
    basics: {
      name: '', description: '',
      projectType: 'other',
      stack: '', runtime: '',
      packageManager: 'npm',
      commands: { build: '', test: '', dev: '', lint: '' },
    },
    architecture: {
      codingRules: [],
      definitionOfDone: [],
      commitConvention: 'conventional',
    },
    meta: {},
  }
}

// ── V1 → V2 migration ────────────────────────────────────────────────────────
// Old configs (version: '1') had agents/skills/customCommands sections and
// architecture.{structure, keyDecisions, conventions}. Drop those silently;
// keep what survives.

interface V1ArchitectureLite {
  codingRules?: unknown
}
interface V1BasicsLite {
  name?: unknown; description?: unknown; stack?: unknown
  runtime?: unknown; packageManager?: unknown; commands?: unknown
}
interface V1ConfigLite {
  version?:      unknown
  basics?:       V1BasicsLite
  architecture?: V1ArchitectureLite
}

export function migrateConfig(raw: unknown): HarnessConfig {
  const def = defaultHarnessConfig()
  if (!raw || typeof raw !== 'object') return def

  const r = raw as V1ConfigLite

  if (r.version === '2') return raw as HarnessConfig

  // V1 path
  const v1Rules = Array.isArray(r.architecture?.codingRules)
    ? (r.architecture!.codingRules as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : []

  const pm = r.basics?.packageManager
  const validPm: HarnessConfig['basics']['packageManager'] =
    pm === 'pnpm' || pm === 'yarn' || pm === 'bun' || pm === 'other' || pm === 'npm' ? pm : 'npm'

  return {
    version: '2',
    basics: {
      name:           typeof r.basics?.name        === 'string' ? r.basics.name        : '',
      description:    typeof r.basics?.description === 'string' ? r.basics.description : '',
      projectType:    'other',
      stack:          typeof r.basics?.stack       === 'string' ? r.basics.stack       : '',
      runtime:        typeof r.basics?.runtime     === 'string' ? r.basics.runtime     : '',
      packageManager: validPm,
      commands:       (r.basics?.commands && typeof r.basics.commands === 'object')
                        ? r.basics.commands as Record<string, string>
                        : { build: '', test: '', dev: '', lint: '' },
    },
    architecture: {
      codingRules: v1Rules.map(text => ({
        title:   text.slice(0, 60),
        text,
        enabled: true,
        source:  'user-defined' as const,
      })),
      definitionOfDone: [],
      commitConvention: 'conventional',
    },
    meta: {},
  }
}
