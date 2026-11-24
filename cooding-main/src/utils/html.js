const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function htmlToText(source) {
  if (typeof source !== 'string' || !source.trim()) return ''
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    doc.querySelectorAll('script, style, template').forEach((node) => node.remove())
    return normalize(doc.body?.textContent)
  }
  const stripped = source
    .replace(/<(script|style|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
  return normalize(stripped.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => entities[name]))
}
