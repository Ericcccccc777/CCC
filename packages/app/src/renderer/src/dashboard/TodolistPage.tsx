import type { HarnessSummary, TodoFunction, TodoItem, TodoItemStatus, TodoFnStatus } from '../../../shared/harness'
import type { DashStrings } from './strings'
import { fmt } from './strings'
import { countItems } from './util'

// Page 4 — Todolist. The centerpiece: a function-categorized board. Each
// function is a card; inside, items are bucketed into Done / In-progress /
// Planned. This is deliberately NOT a flat list — the whole point is showing
// how far each function (capability area) has come.

const ITEM_GLYPH: Record<TodoItemStatus, string> = { done: '✅', doing: '🔵', todo: '⚪' }

function fnStatusLabel(s: DashStrings, st?: TodoFnStatus): string {
  switch (st) {
    case 'done':        return s.fnDone
    case 'in-progress': return s.fnInProgress
    case 'abandoned':   return s.fnAbandoned
    default:            return s.fnPlanned
  }
}

function Bucket({ label, glyph, items }: { label: string; glyph: string; items: TodoItem[] }): JSX.Element | null {
  if (items.length === 0) return null
  return (
    <div className="dash-todo-bucket">
      <div className="dash-todo-bucket-head">{glyph} {label} <span className="dash-todo-bucket-n">{items.length}</span></div>
      <ul className="dash-todo-items">
        {items.map((it, i) => (
          <li key={it.id ?? i} className={`dash-todo-item is-${it.status ?? 'todo'}`}>
            <span className="dash-todo-item-text">{it.text ?? it.id}</span>
            {it.note ? <span className="dash-todo-item-note">{it.note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FunctionCard({ fn, s }: { fn: TodoFunction; s: DashStrings }): JSX.Element {
  const items = fn.items ?? []
  const done  = items.filter(i => i.status === 'done')
  const doing = items.filter(i => i.status === 'doing')
  const todo  = items.filter(i => (i.status ?? 'todo') === 'todo')
  const st    = fn.status ?? 'planned'
  return (
    <div className={`dash-fn-card is-${st}`}>
      <div className="dash-fn-head">
        <div className="dash-fn-title">{fn.title ?? fn.id}</div>
        <span className={`dash-fn-badge is-${st}`}>{fnStatusLabel(s, st)}</span>
      </div>
      {fn.description ? <div className="dash-fn-desc">{fn.description}</div> : null}
      <div className="dash-fn-progress">
        {fmt(s.itemsProgress, { done: done.length, total: items.length })}
        <div className="dash-fn-bar">
          <span className="dash-fn-bar-fill" style={{ width: items.length ? `${(done.length / items.length) * 100}%` : '0%' }} />
        </div>
      </div>
      <div className="dash-todo-buckets">
        <Bucket label={s.todoDone}  glyph={ITEM_GLYPH.done}  items={done} />
        <Bucket label={s.todoDoing} glyph={ITEM_GLYPH.doing} items={doing} />
        <Bucket label={s.todoTodo}  glyph={ITEM_GLYPH.todo}  items={todo} />
      </div>
    </div>
  )
}

export function TodolistPage({ summary, s }: { summary: HarnessSummary; s: DashStrings }): JSX.Element {
  const fns = summary.todolist?.functions ?? []
  if (fns.length === 0) {
    return (
      <div className="dash-empty">
        <div className="dash-empty-title">{s.todoEmpty}</div>
        <div className="dash-empty-hint">{s.todoEmptyHint}</div>
      </div>
    )
  }
  const c = countItems(summary.todolist)
  return (
    <div className="dash-page">
      <div className="dash-todo-overall">
        <span className="dash-todo-overall-label">{s.overall}</span>
        <span className="dash-pill is-done">✅ {s.todoDone} {c.done}</span>
        <span className="dash-pill is-doing">🔵 {s.todoDoing} {c.doing}</span>
        <span className="dash-pill is-todo">⚪ {s.todoTodo} {c.todo}</span>
      </div>
      <div className="dash-fn-grid">
        {fns.map((fn, i) => <FunctionCard key={fn.id ?? i} fn={fn} s={s} />)}
      </div>
    </div>
  )
}
