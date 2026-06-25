import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Thin wrapper: render harness markdown (constitution.md, workflow.md) with GFM
// (tables, strikethrough). Links are rendered as inert text — the dashboard is a
// read-only viewer inside a desktop app, not a browser, so we don't want
// navigations. All output is scoped under .dash-md for styling.
export function Markdown({ source }: { source: string }): JSX.Element {
  return (
    <div className="dash-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children }) => <span className="dash-md-link">{children}</span>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
