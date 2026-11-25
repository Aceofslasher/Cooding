import test from 'node:test'
import assert from 'node:assert/strict'
import { attemptScore, errorSignature, mergeErrorHistory } from './attempts.js'

const failedAttempt = {
  id: 'attempt-1',
  topic: 'Loops',
  exerciseId: 'practice-count',
  lessonId: 'loops',
  language: 'javascript',
  executionStatus: 'wrong_answer',
  output: '1\n2',
  code: 'for (let i = 1; i < 3; i++) console.log(i)',
  passed: false,
  createdAt: '2026-11-26T10:00:00.000Z',
}

test('a repeated failure of the same exercise increments one mistake row', () => {
  const first = mergeErrorHistory([], failedAttempt)
  assert.equal(first.length, 1)
  assert.equal(first[0].occurrences, 1)

  const second = mergeErrorHistory(first, { ...failedAttempt, id: 'attempt-2', createdAt: '2026-11-26T10:05:00.000Z', output: '1' })
  assert.equal(second.length, 1)
  assert.equal(second[0].occurrences, 2)
  assert.equal(second[0].errorMessage, '1')
  assert.equal(second[0].lastSeenAt, '2026-11-26T10:05:00.000Z')
  assert.equal(second[0].resolved, false)
})

test('a different exercise creates a separate mistake row', () => {
  const first = mergeErrorHistory([], failedAttempt)
  const second = mergeErrorHistory(first, { ...failedAttempt, exerciseId: 'practice-score', topic: 'Loops' })
  assert.equal(second.length, 2)
  assert.notEqual(errorSignature(second[0]), errorSignature(second[1]))
})

test('a passing attempt resolves only the matching exercise mistakes', () => {
  const first = mergeErrorHistory([], failedAttempt)
  const withOther = mergeErrorHistory(first, { ...failedAttempt, exerciseId: 'practice-score' })
  const resolved = mergeErrorHistory(withOther, { ...failedAttempt, id: 'attempt-3', passed: true, output: '1\n2\n3' })
  const countRow = resolved.find((row) => row.exerciseRef === 'practice-count')
  const otherRow = resolved.find((row) => row.exerciseRef === 'practice-score')
  assert.equal(countRow.resolved, true)
  assert.equal(otherRow.resolved, false)
})

test('a passing attempt resolves a legacy topic-only mistake', () => {
  const legacy = [{ id: 'legacy', topic: 'Loops', errorType: 'incorrect_output', resolved: false, occurrences: 1 }]
  const resolved = mergeErrorHistory(legacy, { ...failedAttempt, passed: true })
  assert.equal(resolved[0].resolved, true)
})

test('attemptScore derives passed and total counts from test results', () => {
  assert.deepEqual(attemptScore({ testResults: [{ passed: true }, { passed: false }] }), { passed: 1, total: 2, passedAll: false })
  assert.deepEqual(attemptScore({ passed: true }), { passed: 0, total: 0, passedAll: true })
})
