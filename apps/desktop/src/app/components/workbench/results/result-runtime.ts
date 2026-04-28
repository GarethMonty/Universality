export function formatDurationClock(durationMs: number) {
  const safeDuration = Math.max(0, Math.round(durationMs))
  const hours = Math.floor(safeDuration / 3_600_000)
  const minutes = Math.floor((safeDuration % 3_600_000) / 60_000)
  const seconds = Math.floor((safeDuration % 60_000) / 1000)
  const milliseconds = safeDuration % 1000

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(milliseconds, 3)}`
}

function pad(value: number, length: number) {
  return String(value).padStart(length, '0')
}
