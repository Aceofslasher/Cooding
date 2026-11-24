export const PLAYGROUND_AI_NOTE = 'You are helping inside a browser playground with three files: index.html (html), styles.css (css), and script.js (javascript). When the learner asks you to add or change code, answer briefly, then include the complete updated contents of every affected file in a fenced block whose first line names the language and file, for example: ```html index.html. Include only the files that change and keep the rest of each file intact.'

export function playgroundFilePayload(files) {
  return files.map((file) => `--- ${file.name} (${file.language}) ---\n${file.content}`).join('\n\n').slice(0, 7000)
}

export function splitAssistantReply(reply) {
  const parts = []
  const pattern = /```([^\n`]*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match
  while ((match = pattern.exec(reply))) {
    if (match.index > lastIndex) parts.push({ type: 'text', text: reply.slice(lastIndex, match.index) })
    const words = match[1].trim().split(/\s+/).filter(Boolean)
    parts.push({
      type: 'code',
      language: words.find((word) => /^(html|css|js|javascript)$/i.test(word))?.toLowerCase(),
      fileName: words.find((word) => /\.(html|css|js)$/i.test(word)),
      code: match[2].replace(/\n$/, ''),
    })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < reply.length) parts.push({ type: 'text', text: reply.slice(lastIndex) })
  return parts
}

export function resolvePlaygroundFile(block, files) {
  if (block.fileName) {
    const target = files.find((file) => file.name.toLowerCase() === block.fileName.toLowerCase())
    if (target) return target
  }
  if (block.language === 'html') return files.find((file) => file.language === 'html')
  if (block.language === 'css') return files.find((file) => file.language === 'css')
  if (block.language === 'js' || block.language === 'javascript') return files.find((file) => file.language === 'javascript')
  return null
}
