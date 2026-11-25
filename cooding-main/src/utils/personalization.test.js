import test from 'node:test'
import assert from 'node:assert/strict'
import { attemptPercent, buildImprovement, buildPersonalization, exerciseOutcomes, formatDuration } from './personalization.js'

const now = Date.now()
const day = 86_400_000
const iso = (offset) => new Date(now - offset * day).toISOString()

const lessons = [
  { id: 'loops', topic: 'Loops', language: 'javascript' },
  { id: 'arrays', topic: 'Arrays', language: 'javascript' },
  { id: 'html-lists', topic: 'HTML lists', language: 'html' },
]
const exercises = [
  { id: 'ex-loops', title: 'Count to three', topic: 'Loops', difficulty: 'Beginner' },
  { id: 'ex-arrays', title: 'Sum an array', topic: 'Arrays', difficulty: 'Intermediate' },
  { id: 'ex-lists', title: 'Build a list', topic: 'HTML lists', difficulty: 'Beginner' },
]

function sampleProgress() {
  return {
    attempts: [
      { id: 'a1', exerciseId: 'ex-loops', topic: 'Loops', passed: false, score: 33, durationSeconds: 90, createdAt: iso(6) },
      { id: 'a2', exerciseId: 'ex-loops', topic: 'Loops', passed: false, score: 66, durationSeconds: 60, createdAt: iso(5) },
      { id: 'a3', exerciseId: 'ex-loops', topic: 'Loops', passed: true, score: 100, durationSeconds: 40, createdAt: iso(1) },
      { id: 'a4', exerciseId: 'ex-arrays', topic: 'Arrays', passed: true, score: 100, durationSeconds: 30, createdAt: iso(1) },
    ],
    errorHistory: [
      { id: 'e1', topic: 'Loops', resolved: false, occurrences: 2, errorMessage: 'Off by one', createdAt: iso(1) },
    ],
    lessonTimeSpent: { loops: 180 },
    lessonsCompleted: ['arrays'],
    lessonsStarted: ['loops', 'arrays'],
    lessonCompletedAt: { arrays: iso(1) },
  }
}

test('attemptPercent prefers a stored score and falls back to tests', () => {
  assert.equal(attemptPercent({ score: 80 }), 80)
  assert.equal(attemptPercent({ passedTests: 2, totalTests: 3 }), 67)
  assert.equal(attemptPercent({ passed: true }), 100)
  assert.equal(attemptPercent({ passed: false }), 0)
})

test('exercise outcomes track repeated attempts and passes', () => {
  const outcomes = exerciseOutcomes(sampleProgress())
  assert.equal(outcomes.get('ex-loops').attempts, 3)
  assert.equal(outcomes.get('ex-loops').passed, true)
  assert.equal(outcomes.get('ex-arrays').bestScore, 100)
})

test('recommendations skip passed exercises and lead with the weakest topic', () => {
  const result = buildPersonalization(sampleProgress(), { lessons, exercises })
  const ids = result.recommendations.map((entry) => entry.exercise.id)
  assert.deepEqual(ids.slice(0, 1), ['ex-lists'])
  assert.equal(result.exercisesPassed, 2)
  assert.equal(result.passRate, 0.5)
  assert.equal(result.avgScore, 75)
  assert.match(result.recommendations[0].reason, /HTML lists/i)
})

test('personalization totals practice and lesson time', () => {
  const result = buildPersonalization(sampleProgress(), { lessons, exercises })
  assert.equal(result.practiceSeconds, 220)
  assert.equal(result.lessonSeconds, 180)
  assert.equal(result.totalSeconds, 400)
  assert.equal(result.unresolvedMistakes, 1)
  assert.equal(formatDuration(result.totalSeconds), '7m')
})

test('improvement compares the recent window with the earlier window', () => {
  const result = buildImprovement(sampleProgress(), 2)
  assert.equal(result.trend, 'improving')
  assert.equal(result.current, 1)
  assert.equal(result.previous, 0)
})

test('a short history reports a starting trend instead of guessing', () => {
  const result = buildImprovement({ attempts: [{ passed: true, createdAt: iso(1) }] })
  assert.equal(result.trend, 'starting')
  assert.equal(result.current, null)
})

test('duration formatting stays readable', () => {
  assert.equal(formatDuration(0), '0m')
  assert.equal(formatDuration(45), '45s')
  assert.equal(formatDuration(3600), '1h')
  assert.equal(formatDuration(3900), '1h 5m')
})
