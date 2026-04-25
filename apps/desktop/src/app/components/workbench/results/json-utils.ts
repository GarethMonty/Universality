export function parseJsonValue(value: string): unknown {
  const trimmed = value.trim()

  if (!trimmed || !/^[{["0-9tfn-]/.test(trimmed)) {
    return value
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}
