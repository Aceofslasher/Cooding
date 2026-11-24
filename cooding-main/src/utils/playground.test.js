import test from 'node:test'
import assert from 'node:assert/strict'
import { playgroundFilePayload, resolvePlaygroundFile, splitAssistantReply } from './playground.js'

const files = [
  { name: 'index.html', language: 'html', content: '<h1>Hi</h1>' },
  { name: 'styles.css', language: 'css', content: 'h1 { color: red; }' },
  { name: 'script.js', language: 'javascript', content: 'console.log(1)' },
]

test('fenced replies split into text and named code blocks', () => {
  const reply = 'Sure. Here is the update:\n\n```css styles.css\nh1 { color: blue; }\n```\nThen run it.'
  const parts = splitAssistantReply(reply)
  assert.equal(parts.length, 3)
  assert.equal(parts[0].type, 'text')
  assert.equal(parts[1].type, 'code')
  assert.equal(parts[1].language, 'css')
  assert.equal(parts[1].fileName, 'styles.css')
  assert.equal(parts[1].code, 'h1 { color: blue; }')
  assert.equal(parts[2].text.trim(), 'Then run it.')
})

test('code blocks map to the matching playground file', () => {
  const [block] = splitAssistantReply('```html index.html\n<h1>New</h1>\n```').filter((part) => part.type === 'code')
  assert.equal(resolvePlaygroundFile(block, files)?.name, 'index.html')
  assert.equal(resolvePlaygroundFile({ language: 'css', code: '' }, files)?.name, 'styles.css')
  assert.equal(resolvePlaygroundFile({ language: 'js', code: '' }, files)?.name, 'script.js')
  assert.equal(resolvePlaygroundFile({ fileName: 'other.css' }, files), null)
})

test('file payload includes each file with its language', () => {
  const payload = playgroundFilePayload(files)
  assert.ok(payload.includes('--- index.html (html) ---'))
  assert.ok(payload.includes('--- script.js (javascript) ---'))
  assert.ok(payload.length < 7001)
})
