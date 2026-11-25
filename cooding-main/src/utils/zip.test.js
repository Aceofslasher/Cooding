import test from 'node:test'
import assert from 'node:assert/strict'
import { buildZip, crc32, zipFileName } from './zip.js'

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926)
  assert.equal(crc32(new TextEncoder().encode('')), 0)
})

test('zip archive starts and ends with the expected signatures', () => {
  const archive = buildZip([
    { name: 'index.html', content: '<h1>Hi</h1>' },
    { name: 'styles.css', content: 'h1 { color: green; }' },
  ])
  assert.deepEqual(archive.slice(0, 4), new Uint8Array([0x50, 0x4b, 0x03, 0x04]))
  assert.equal(new DataView(archive.buffer).getUint32(archive.length - 22, true), 0x06054b50)
  const text = new TextDecoder().decode(archive)
  assert.match(text, /index\.html/)
  assert.match(text, /styles\.css/)
  assert.match(text, /<h1>Hi<\/h1>/)
})

test('zip records one central directory entry per file', () => {
  const archive = buildZip([{ name: 'a.js', content: '1' }, { name: 'b.js', content: '2' }, { name: 'c.js', content: '3' }])
  const view = new DataView(archive.buffer)
  assert.equal(view.getUint16(archive.length - 12, true), 3)
})

test('download names are filesystem safe', () => {
  assert.equal(zipFileName('My Project!'), 'my-project')
  assert.equal(zipFileName(''), 'loopwise-project')
})
