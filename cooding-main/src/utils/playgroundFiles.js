const EXTENSION_LANGUAGE = { html: 'html', css: 'css', js: 'javascript' }
const LANGUAGE_EXTENSION = { html: 'html', css: 'css', javascript: 'js' }

export function languageForFileName(name = '') {
  const extension = String(name).trim().split('.').pop().toLowerCase()
  return EXTENSION_LANGUAGE[extension] || 'javascript'
}

export function sanitizeFileName(raw, languageHint = null) {
  let base = String(raw || '')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^[-.]+|-+$/g, '')
    .slice(0, 48)
  if (!base) base = 'file'
  if (!/\.(html|css|js)$/i.test(base)) {
    const guess = languageHint
      || (base.toLowerCase().includes('style') ? 'css' : base.toLowerCase().includes('html') ? 'html' : 'javascript')
    base = `${base}.${LANGUAGE_EXTENSION[guess] || 'js'}`
  }
  return base
}

export function playgroundNameTaken(files = [], name, ignoreName = null) {
  const target = String(name).toLowerCase()
  return files.some((file) => file.name.toLowerCase() === target && file.name !== ignoreName)
}

export function nextAvailableName(files = [], baseName) {
  if (!playgroundNameTaken(files, baseName)) return baseName
  const dot = baseName.lastIndexOf('.')
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName
  const extension = dot > 0 ? baseName.slice(dot) : ''
  let index = 2
  while (playgroundNameTaken(files, `${stem}-${index}${extension}`)) index += 1
  return `${stem}-${index}${extension}`
}

export function starterContentFor(name, language = languageForFileName(name)) {
  if (language === 'html') {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name}</title>
  </head>
  <body>
    <h1>New page</h1>
  </body>
</html>`
  }
  if (language === 'css') return `/* Styles for your page */\nbody {\n  font-family: system-ui, sans-serif;\n}\n`
  return `// JavaScript for your page\nconsole.log('Hello from ${name}');\n`
}

export function createPlaygroundFile(files = [], rawName, content = null) {
  const name = nextAvailableName(files, sanitizeFileName(rawName))
  return [...files, { name, language: languageForFileName(name), content: content ?? starterContentFor(name) }]
}

export function updatePlaygroundFile(files = [], name, content) {
  return files.map((file) => (file.name === name ? { ...file, content: content ?? '' } : file))
}

export function renamePlaygroundFile(files = [], oldName, rawName) {
  const nextName = sanitizeFileName(rawName)
  if (!nextName || nextName === oldName || playgroundNameTaken(files, nextName, oldName)) return files
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const reference = new RegExp(`((?:href|src)\\s*=\\s*["'])(\\./)?${escaped}(["'])`, 'gi')
  return files.map((file) => ({
    ...file,
    name: file.name === oldName ? nextName : file.name,
    language: file.name === oldName ? languageForFileName(nextName) : file.language,
    content: file.content.replace(reference, (_match, prefix, dot, quote) => `${prefix}${dot || ''}${nextName}${quote}`),
  }))
}

export function duplicatePlaygroundFile(files = [], name) {
  const source = files.find((file) => file.name === name)
  if (!source) return { files, name: null }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  const copyName = nextAvailableName(files, `${stem}-copy${extension}`)
  return {
    files: [...files, { ...source, name: copyName, language: languageForFileName(copyName) }],
    name: copyName,
  }
}

export function deletePlaygroundFile(files = [], name) {
  if (files.length <= 1) return files
  return files.filter((file) => file.name !== name)
}

export function normalizePlaygroundFiles(value) {
  if (!Array.isArray(value)) return null
  const files = value
    .filter((file) => file && typeof file.name === 'string' && typeof file.content === 'string' && /\.(html|css|js)$/i.test(file.name))
    .map((file) => ({ name: file.name.slice(0, 80), language: languageForFileName(file.name), content: file.content.slice(0, 200_000) }))
  return files.length ? files : null
}

export function serializePlayground({ files = [], activeName = '', openTabs = [], chat = [], projectId = null, projectName = '' } = {}) {
  return JSON.stringify({
    version: 1,
    files,
    activeName,
    openTabs,
    chat: chat.slice(-40).map((message) => ({
      id: message.id,
      role: message.role,
      content: String(message.content || '').slice(0, 6000),
      mode: message.mode || null,
      applied: Array.isArray(message.applied) ? message.applied : [],
    })),
    projectId,
    projectName,
  })
}

export function parsePlayground(raw) {
  if (!raw) return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const files = normalizePlaygroundFiles(parsed.files)
  if (!files) return null
  const names = new Set(files.map((file) => file.name))
  const activeName = names.has(parsed.activeName) ? parsed.activeName : files[0].name
  const openTabs = Array.isArray(parsed.openTabs) ? parsed.openTabs.filter((name) => names.has(name)) : []
  return {
    files,
    activeName,
    openTabs: openTabs.length ? [...new Set([...openTabs, activeName])] : [activeName],
    chat: Array.isArray(parsed.chat)
      ? parsed.chat.filter((message) => message && typeof message.content === 'string' && ['user', 'assistant'].includes(message.role)).slice(-40)
      : [],
    projectId: typeof parsed.projectId === 'string' ? parsed.projectId : null,
    projectName: typeof parsed.projectName === 'string' ? parsed.projectName.slice(0, 80) : '',
  }
}

export function playgroundStorageKey(userId = null) {
  return `loopwise-playground-v1:${userId || 'guest'}`
}
