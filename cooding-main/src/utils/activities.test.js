import test from 'node:test'
import assert from 'node:assert/strict'
import { lessonActivityState, lessonsReadyToComplete } from './activities.js'

const lesson = { id: 'loops' }
const quiz = { question: 'Which part stops a loop?', choices: ['start', 'condition', 'name'], answer: 1 }

test('an exercise pass alone does not complete a lesson with a knowledge check', () => {
  const state = lessonActivityState({ attempts: [{ lessonId: 'loops', passed: true }] }, lesson, quiz)
  assert.equal(state.exercisePassed, true)
  assert.equal(state.quizPassed, false)
  assert.equal(state.ready, false)
  assert.equal(state.done, 1)
  assert.equal(state.required, 2)
})

test('practice attempts for the linked lesson do not count as the lesson exercise', () => {
  const state = lessonActivityState({ attempts: [{ lessonId: 'loops', exerciseId: 'practice-count', passed: true }] }, lesson, null)
  assert.equal(state.exercisePassed, false)
})

test('exercise plus quiz completes the required activities', () => {
  const progress = {
    attempts: [{ lessonId: 'loops', passed: true }],
    quizAttempts: [{ lessonId: 'loops', score: 1, totalQuestions: 1 }],
  }
  const state = lessonActivityState(progress, lesson, quiz)
  assert.equal(state.ready, true)
  assert.equal(state.done, 2)
})

test('a lesson without a quiz is ready after its exercise passes', () => {
  const state = lessonActivityState({ attempts: [{ lessonId: 'loops', passed: true }] }, lesson, null)
  assert.equal(state.ready, true)
  assert.equal(state.required, 1)
})

test('lessons with a passed exercise but no completion record are reconciled', () => {
  const lessons = [{ id: 'loops' }, { id: 'arrays' }]
  const progress = {
    attempts: [
      { lessonId: 'loops', passed: true },
      { lessonId: 'arrays', exerciseId: 'practice-array-total', passed: true },
    ],
    lessonsCompleted: [],
  }
  const ready = lessonsReadyToComplete(progress, lessons, {})
  assert.deepEqual(ready.map((entry) => entry.id), ['loops'])
})

test('lessons with a quiz are not reconciled until the quiz passes', () => {
  const lessons = [{ id: 'loops' }]
  const quizzes = { loops: quiz }
  const exercised = { attempts: [{ lessonId: 'loops', passed: true }], lessonsCompleted: [] }
  assert.deepEqual(lessonsReadyToComplete(exercised, lessons, quizzes), [])
  const quizzed = { ...exercised, quizAttempts: [{ lessonId: 'loops', score: 1, totalQuestions: 1 }] }
  assert.deepEqual(lessonsReadyToComplete(quizzed, lessons, quizzes).map((entry) => entry.id), ['loops'])
})

test('already completed lessons are left untouched', () => {
  const lessons = [{ id: 'loops' }]
  const progress = { attempts: [{ lessonId: 'loops', passed: true }], lessonsCompleted: ['loops'] }
  assert.deepEqual(lessonsReadyToComplete(progress, lessons, {}), [])
})
