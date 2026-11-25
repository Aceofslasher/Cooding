import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateTestCases, normalizeOutput, passedAllTests } from './evaluation.js'

test('falls back to a single exact output check', () => {
  const results = evaluateTestCases({ output: 'Hello\n', expectedOutput: 'Hello' })
  assert.equal(results.length, 1)
  assert.equal(results[0].passed, true)
})

test('evaluates exact, includes, and line checks separately', () => {
  const results = evaluateTestCases({
    output: '1\n2\n3',
    language: 'javascript',
    testCases: [
      { description: 'Exact sequence', expectedOutput: '1\n2\n3', mode: 'exact' },
      { description: 'Prints two', expectedOutput: '2', mode: 'line' },
      { description: 'Mentions three', expectedOutput: '3', mode: 'includes' },
      { description: 'Prints four', expectedOutput: '4', mode: 'line' },
    ],
  })
  assert.deepEqual(results.map((result) => result.passed), [true, true, true, false])
})

test('compares HTML output as visible text', () => {
  const results = evaluateTestCases({
    output: '<h1>Welcome to Loopwise</h1>',
    language: 'html',
    expectedOutput: 'Welcome to Loopwise',
  })
  assert.equal(results[0].passed, true)
  assert.equal(normalizeOutput('<p>A   B</p>', 'html'), 'A B')
})

test('requires every test to pass', () => {
  assert.equal(passedAllTests([{ passed: true }, { passed: false }]), false)
  assert.equal(passedAllTests([{ passed: true }]), true)
  assert.equal(passedAllTests([]), false)
})
