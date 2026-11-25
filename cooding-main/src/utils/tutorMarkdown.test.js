import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTutorLanguage, parseInline, parseTutorLines, parseTutorMarkdown } from './tutorMarkdown.js'

test('parses fenced code with language and surrounding text', () => {
  const blocks = parseTutorMarkdown('Try this:\n\n```js\nconst total = 2 + 3\nconsole.log(total)\n```\n\nWhat did it print?')
  assert.equal(blocks.length, 3)
  assert.equal(blocks[0].type, 'text')
  assert.equal(blocks[1].type, 'code')
  assert.equal(blocks[1].language, 'javascript')
  assert.equal(blocks[1].code, 'const total = 2 + 3\nconsole.log(total)')
  assert.equal(blocks[2].type, 'text')
})

test('keeps a file name from the fence info line', () => {
  const [block] = parseTutorMarkdown('```html index.html\n<h1>Hi</h1>\n```')
  assert.equal(block.type, 'code')
  assert.equal(block.fileName, 'index.html')
  assert.equal(block.language, 'html')
})

test('handles unterminated code fences and empty replies', () => {
  const blocks = parseTutorMarkdown('```python\nprint("hi")')
  assert.deepEqual(blocks.map((block) => block.type), ['code'])
  assert.equal(blocks[0].language, 'python')
  assert.deepEqual(parseTutorMarkdown('   '), [])
})

test('normalizes common language aliases', () => {
  assert.equal(normalizeTutorLanguage('JS'), 'javascript')
  assert.equal(normalizeTutorLanguage('py'), 'python')
  assert.equal(normalizeTutorLanguage('ruby'), 'ruby')
})

test('groups markdown lines into headings, lists, and paragraphs', () => {
  const lines = parseTutorLines('### Steps\n1. Open the file\n- Check the quote\n\nThen run it.')
  assert.deepEqual(lines.map((line) => line.type), ['heading', 'numbered', 'bullet', 'paragraph'])
  assert.equal(lines[0].level, 5)
  assert.equal(lines[1].marker, '1')
})

test('splits inline code and bold text', () => {
  const tokens = parseInline('Use `const` and **never** reassign.')
  assert.deepEqual(tokens, [
    { type: 'text', text: 'Use ' },
    { type: 'code', text: 'const' },
    { type: 'text', text: ' and ' },
    { type: 'strong', text: 'never' },
    { type: 'text', text: ' reassign.' },
  ])
})
