import { useEffect, useRef } from 'react'
import { CloseIcon, SearchIcon } from './icons'

interface CommandPaletteProps {
  commands: string[]
  query: string
  onClose(): void
  onQueryChange(value: string): void
  onRunCommand(command: string): void
}

const SHORTCUTS: Record<string, string> = {
  'Run current query': 'Ctrl Enter',
  'Explain current query': 'Ctrl Shift E',
  'Toggle bottom panel': 'Ctrl J',
  'Toggle sidebar': 'Ctrl B',
  'Open command palette': 'Ctrl K',
}

export function CommandPalette({
  commands,
  query,
  onClose,
  onQueryChange,
  onRunCommand,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const runFirstCommand = () => {
    const [firstCommand] = commands

    if (firstCommand) {
      onRunCommand(firstCommand)
    }
  }

  return (
    <div
      className="command-palette-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="command-palette-input-row">
          <SearchIcon className="command-palette-icon" />
          <input
            ref={inputRef}
            aria-label="Search commands"
            value={query}
            placeholder="Type a command"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
                return
              }

              if (event.key === 'Enter') {
                event.preventDefault()
                runFirstCommand()
              }
            }}
          />
          <button
            type="button"
            className="command-palette-close"
            aria-label="Close command palette"
            onClick={onClose}
          >
            <CloseIcon className="command-palette-icon" />
          </button>
        </div>

        <div className="command-palette-list" role="listbox" aria-label="Available commands">
          {commands.length > 0 ? (
            commands.map((command, index) => (
              <button
                key={command}
                type="button"
                role="option"
                aria-selected={index === 0}
                className={`command-palette-row${index === 0 ? ' is-active' : ''}`}
                onClick={() => onRunCommand(command)}
              >
                <span>{command}</span>
                {SHORTCUTS[command] ? <kbd>{SHORTCUTS[command]}</kbd> : null}
              </button>
            ))
          ) : (
            <p className="command-palette-empty">No commands found.</p>
          )}
        </div>
      </section>
    </div>
  )
}
