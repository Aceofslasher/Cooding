import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPlaygroundFile,
  deletePlaygroundFile,
  duplicatePlaygroundFile,
  languageForFileName,
  normalizePlaygroundFiles,
  parsePlayground,
  playgroundNameTaken,
  playgroundStorageKey,
  renamePlaygroundFile,
  sanitizeFileName,
  serializePlayground,
  starterContentFor,
} from './playgroundFiles.js'

const baseFiles = [
  { name: 'index.html', language: 'html', content: '<link rel="stylesheet" href="styles.css" /><script src="script.js"></script>' },
  { name: 'styles.css', language: 'css', content: 'body { margin: 0; }' },
  { name: 'script.js', language: 'javascript', content: 'console.log(1)' },
]

test('file names map to editor languages', () => {
  assert.equal(languageForFileName('page.html'), 'html')
  assert.equal(languageForFileName('theme.CSS'), 'css')
  assert.equal(languageForFileName('app.js'), 'javascript')
  assert.equal(languageForFileName('notes'), 'javascript')
})

test('unsafe names are sanitized and given an extension', () => {
  assert.equal(sanitizeFileName('my page'), 'my-page.js')
  assert.equal(sanitizeFileName('about me', 'html'), 'about-me.html')
  assert.equal(sanitizeFileName('../evil.html'), 'evil.html')
  assert.equal(sanitizeFileName('style'), 'style.css')
})

test('creating a file never overwrites an existing name', () => {
  const files = createPlaygroundFile(baseFiles, 'styles.css')
  assert.equal(files.length, 4)
  assert.ok(playgroundNameTaken(files, 'styles-2.css'))
  assert.match(starterContentFor('styles-2.css'), /font-family/)
})

test('renaming a file updates html references', () => {
  const files = renamePlaygroundFile(baseFiles, 'script.js', 'app.js')
  assert.ok(playgroundNameTaken(files, 'app.js'))
  assert.ok(!playgroundNameTaken(files, 'script.js'))
  assert.match(files[0].content, /src="app.js"/)
})

test('renaming to a taken name is a no-op', () => {
  assert.equal(renamePlaygroundFile(baseFiles, 'script.js', 'styles.css'), baseFiles)
})

test('duplicate keeps the original and copies the content', () => {
  const { files, name } = duplicatePlaygroundFile(baseFiles, 'styles.css')
  assert.equal(name, 'styles-copy.css')
  assert.equal(files.length, 4)
  assert.equal(files[3].content, 'body { margin: 0; }')
})

test('the last file cannot be deleted', () => {
  const files = deletePlaygroundFile([baseFiles[0]], 'index.html')
  assert.equal(files.length, 1)
  assert.equal(deletePlaygroundFile(baseFiles, 'script.js').length, 2)
})

test('serialized playground state round-trips through parse', () => {
  const raw = serializePlayground({ files: baseFiles, activeName: 'script.js', openTabs: ['index.html', 'script.js'], chat: [{ id: '1', role: 'user', content: 'Hi' }], projectId: null, projectName: 'Demo' })
  const parsed = parsePlayground(raw)
  assert.equal(parsed.activeName, 'script.js')
  assert.deepEqual(parsed.openTabs, ['index.html', 'script.js'])
  assert.equal(parsed.chat.length, 1)
  assert.equal(parsed.projectName, 'Demo')
  assert.equal(parsed.files.length, 3)
})

test('parse rejects corrupt or unsupported state', () => {
  assert.equal(parsePlayground('not json'), null)
  assert.equal(parsePlayground(JSON.stringify({ files: [{ name: 'notes.txt', content: 'x' }] })), null)
  assert.equal(normalizePlaygroundFiles([]), null)
})

test('storage keys are scoped per user', () => {
  assert.equal(playgroundStorageKey(null), 'loopwise-playground-v1:guest')
  assert.equal(playgroundStorageKey('abc'), 'loopwise-playground-v1:abc')
})
