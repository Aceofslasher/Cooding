import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLessonImport, validateLesson } from './lessonLibrary.js'

const sampleLesson = {
  id: 'custom-test-lesson',
  title: 'Test lesson',
  topic: 'Testing',
  level: 'Beginner',
  minutes: 10,
  language: 'javascript',
  description: 'A short test lesson.',
  objective: 'Print a value.',
  explanation: 'Use console.log to display a value.',
  example: 'console.log("Ready");',
  starterCode: '// Print Ready.',
  expectedOutput: 'Ready',
  hint: 'Use console.log().',
  referenceUrl: 'https://www.w3schools.com/js/',
}

test('lesson validation normalizes custom lesson data', () => {
  const lesson = validateLesson(sampleLesson)
  assert.equal(lesson.id, sampleLesson.id)
  assert.equal(lesson.language, 'javascript')
  assert.equal(lesson.isCustom, true)
})

test('lesson validation rejects invalid level, duration, and non-HTTPS references', () => {
  assert.throws(() => validateLesson({ ...sampleLesson, level: 'Expert' }), /Level must be/)
  assert.throws(() => validateLesson({ ...sampleLesson, minutes: 0 }), /Minutes must be/)
  assert.throws(() => validateLesson({ ...sampleLesson, referenceUrl: 'http://example.com' }), /must use HTTPS/)
})

test('JSON import accepts a lesson list and rejects duplicate IDs', () => {
  const imported = parseLessonImport(JSON.stringify([sampleLesson]))
  assert.equal(imported.length, 1)
  assert.throws(() => parseLessonImport(JSON.stringify(sampleLesson), [sampleLesson]), /already exists/)
  assert.throws(() => parseLessonImport('{broken'), /valid JSON/)
})
