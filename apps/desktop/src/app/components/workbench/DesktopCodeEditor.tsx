import { useEffect, useState } from 'react'
import type { ComponentType, DragEvent } from 'react'
import { readFieldDragData } from './results/field-drag'

export function DesktopCodeEditor({
  value,
  language,
  theme,
  onChange,
  onDropField,
}: {
  value: string
  language: string
  theme: 'light' | 'dark'
  onChange(value: string): void
  onDropField?(fieldPath: string): void
}) {
  const [LoadedEditor, setLoadedEditor] = useState<null | ComponentType<{
    height: string
    language: string
    value: string
    theme: string
    options: Record<string, unknown>
    onChange(value: string | undefined): void
  }>>(null)

  useEffect(() => {
    let mounted = true

    void import('@monaco-editor/react')
      .then((module) => {
        if (mounted) {
          setLoadedEditor(() => module.default)
        }
      })
      .catch(() => {
        if (mounted) {
          setLoadedEditor(null)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!onDropField) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!onDropField) {
      return
    }

    event.preventDefault()
    const fieldPath = readFieldDragData(event)

    if (fieldPath) {
      onDropField(fieldPath)
    }
  }

  if (!LoadedEditor) {
    return (
      <textarea
        aria-label="Query editor"
        className="editor-textarea"
        value={value}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  return (
    <div className="editor-monaco-frame" onDragOver={handleDragOver} onDrop={handleDrop}>
      <LoadedEditor
        height="100%"
        language={language}
        value={value}
        theme={theme === 'light' ? 'vs' : 'vs-dark'}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          lineNumbersMinChars: 3,
          padding: { top: 12 },
        }}
        onChange={(nextValue) => onChange(nextValue ?? '')}
      />
    </div>
  )
}
