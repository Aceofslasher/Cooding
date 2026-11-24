import test from 'node:test'
import assert from 'node:assert/strict'
import { lessons } from './learningContent.js'

test('built-in JavaScript curriculum has exactly 20 lessons per level', () => {
  for (const level of ['Beginner', 'Intermediate', 'Advanced']) {
    assert.equal(lessons.filter((lesson) => lesson.level === level).length, 20)
  }
})

test('every built-in lesson links to a W3Schools JavaScript reference', () => {
  assert.ok(lessons.every((lesson) => lesson.referenceUrl.startsWith('https://www.w3schools.com/js/')))
})
