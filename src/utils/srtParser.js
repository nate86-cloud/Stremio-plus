function parseTimestamp(timestamp) {
  const match = timestamp.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{1,3})/)
  if (!match) return null

  const [, hours, minutes, seconds, ms] = match
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) + Number(ms) / 1000
}

export function parseSRT(content) {
  if (!content || typeof content !== 'string') return []

  const blocks = content
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)

  const cues = []

  for (const block of blocks) {
    const lines = block.split(/\r?\n/)
    if (lines.length < 2) continue

    const timeLine = lines.find((line) => line.includes('-->'))
    if (!timeLine) continue

    const match = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{1,3})/)
    if (!match) continue

    const start = parseTimestamp(match[1])
    const end = parseTimestamp(match[2])
    if (start == null || end == null) continue

    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join('\n')
      .replace(/\{\\.*?\}/g, '')
      .trim()

    if (!text) continue

    cues.push({
      start,
      end,
      text,
    })
  }

  return cues
}

export function getActiveCue(cues, currentTimeSeconds, offsetMs = 0) {
  if (!Array.isArray(cues) || !cues.length) return null

  const offsetSeconds = offsetMs / 1000
  const time = currentTimeSeconds + offsetSeconds

  const cue = cues.find((entry) => time >= entry.start && time <= entry.end)
  return cue || null
}
