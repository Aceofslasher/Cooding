import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPrerequisiteMap, recentActivity, recentCompletions, recommendNextLesson, summarizeMistakes } from './insights.js'

const now = new Date(2026, 10, 26, 12)

function at(daysAgo) {
  const date = new Date(now)
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}

test('summarizes unresolved and recurring mistakes by topic', () => {
  const summary = summarizeMistakes([
    { topic: 'Loops', errorMessage: 'off by one', resolved: false, createdAt: at(1) },
    { topic: 'Loops', errorMessage: 'infinite loop', resolved: false, createdAt: at(0) },
    { topic: 'Arrays', errorMessage: 'wrong total', resolved: true, createdAt: at(2) },
  ])
  assert.equal(summary.total, 3)
  assert.equal(summary.unresolved, 2)
  assert.equal(summary.resolved, 1)
  assert.equal(summary.topics[0].topic, 'Loops')
  assert.equal(summary.topics[0].total, 2)
  assert.equal(summary.recurring.length, 1)
  assert.equal(summary.recurring[0].lastError, 'infinite loop')
})

test('counts lessons, attempts, and quizzes per day for the last week', () => {
  const activity = recentActivity({
    lessonCompletedAt: { a: at(0), b: at(0), c: at(2) },
    attempts: [{ createdAt: at(0) }, { createdAt: at(6) }],
    quizAttempts: [{ completedAt: at(3) }],
  }, 7, now)
  assert.equal(activity.length, 7)
  assert.equal(activity[6].count, 3)
  assert.equal(activity[6].lessons, 2)
  assert.equal(activity[4].count, 1)
  assert.equal(activity[0].count, 1)
})

test('orders recent completions by completion time', () => {
  const lessons = [{ id: 'a' }, { id: 'b' }, { id: 'custom-1' }]
  const completed = recentCompletions({
    lessonsCompleted: ['a', 'b', 'custom-1'],
    lessonCompletedAt: { a: at(3), b: at(0) },
  }, lessons, 2)
  assert.deepEqual(completed.map((lesson) => lesson.id), ['b', 'a'])
})

test('links each built-in lesson to the previous lesson in its language', () => {
  const map = buildPrerequisiteMap([
    { id: 'js-1', language: 'javascript' },
    { id: 'js-2', language: 'javascript' },
    { id: 'html-1', language: 'html' },
    { id: 'custom-1', language: 'javascript', isCustom: true },
  ])
  assert.equal(map.get('js-1'), undefined)
  assert.equal(map.get('js-2').id, 'js-1')
  assert.equal(map.get('html-1'), undefined)
  assert.equal(map.has('custom-1'), false)
})

test('recommends a lesson that matches an unresolved mistake topic', () => {
  const lessons = [
    { id: 'loops', topic: 'Loops', title: 'Loops' },
    { id: 'arrays', topic: 'Arrays', title: 'Arrays' },
  ]
  const recommendation = recommendNextLesson({
    lessonsCompleted: [],
    errorHistory: [{ topic: 'Loops', errorMessage: 'off by one', resolved: false, createdAt: at(1) }],
  }, lessons)
  assert.equal(recommendation.lesson.id, 'loops')
  assert.match(recommendation.reason, /unresolved Loops/)
})

test('falls back to started lessons, then the next incomplete lesson', () => {
  const lessons = [
    { id: 'one', topic: 'Variables' },
    { id: 'two', topic: 'Loops' },
  ]
  const started = recommendNextLesson({
    lessonsCompleted: ['one'],
    lessonStartedAt: { two: at(0) },
  }, lessons)
  assert.equal(started.lesson.id, 'two')
  const next = recommendNextLesson({ lessonsCompleted: ['one'] }, lessons)
  assert.equal(next.lesson.id, 'two')
})
