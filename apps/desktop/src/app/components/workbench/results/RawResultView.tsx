export function RawResultView({ text }: { text: string }) {
  return (
    <pre className="panel-code raw-result-code" aria-label="Raw result">
      <code>{text}</code>
    </pre>
  )
}
