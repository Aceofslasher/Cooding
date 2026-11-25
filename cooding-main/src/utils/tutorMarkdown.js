const languageAliases = {
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  html: 'html',
  css: 'css',
  py: 'python',
  python: 'python',
  json: 'json',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  jsx: 'jsx',
  tsx: 'tsx',
}

export function normalizeTutorLanguage(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  return languageAliases[raw] || raw
}

export function parseTutorMarkdown(source) {
  const text = String(source ?? '')
  const blocks = []
  const fence = /```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g
  let lastIndex = 0
  let match
  while ((match = fence.exec(text))) {
    if (!match[0]) {
      fence.lastIndex += 1
      continue
    }
    if (match.index > lastIndex) blocks.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    const info = match[1].trim().split(/\s+/).filter(Boolean)
    const rawLanguage = info[0] || ''
    const fileName = info.find((token) => token.includes('.')) || ''
    const code = match[2].replace(/\s+$/, '')
    blocks.push({ type: 'code', rawLanguage, fileName, language: normalizeTutorLanguage(rawLanguage), code })
    lastIndex = fence.lastIndex
  }
  if (lastIndex < text.length) blocks.push({ type: 'text', text: text.slice(lastIndex) })
  const cleaned = blocks
    .map((block) => (block.type === 'code' ? (block.code.trim() ? block : null) : (block.text.trim() ? block : null)))
    .filter(Boolean)
  if (!cleaned.length && text.trim()) return [{ type: 'text', text }]
  return cleaned
}

export function parseTutorLines(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  const items = []
  let paragraph = []
  const flush = () => {
    if (paragraph.length) {
      items.push({ type: 'paragraph', text: paragraph.join('\n').trim() })
      paragraph = []
    }
  }
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      continue
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/)
    const bullet = trimmed.match(/^[-*]\s+(.*)$/)
    const numbered = trimmed.match(/^(\d+)[.)]\s+(.*)$/)
    if (heading) {
      flush()
      items.push({ type: 'heading', level: Math.min(heading[1].length + 2, 5), text: heading[2] })
    } else if (bullet) {
      flush()
      items.push({ type: 'bullet', text: bullet[1] })
    } else if (numbered) {
      flush()
      items.push({ type: 'numbered', marker: numbered[1], text: numbered[2] })
    } else {
      paragraph.push(trimmed)
    }
  }
  flush()
  return items
}

export function parseInline(text) {
  const source = String(text ?? '')
  const tokens = []
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g
  let lastIndex = 0
  let match
  while ((match = pattern.exec(source))) {
    if (match.index > lastIndex) tokens.push({ type: 'text', text: source.slice(lastIndex, match.index) })
    if (match[1] !== undefined) tokens.push({ type: 'code', text: match[1] })
    else if (match[2] !== undefined) tokens.push({ type: 'strong', text: match[2] })
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < source.length) tokens.push({ type: 'text', text: source.slice(lastIndex) })
  return tokens
}

export const runnableTutorLanguage = (language) => language === 'javascript' || language === 'html'
