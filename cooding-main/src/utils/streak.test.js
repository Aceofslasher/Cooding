import test from 'node:test'
import assert from 'node:assert/strict'
import { STREAK_GOAL, recordStreakCompletion, summarizeStreak } from './streak.js'

const monday = new Date(2026, 10, 23, 12)
const tuesday = new Date(2026, 10, 24, 12)
const wednesday = new Date(2026, 10, 25, 12)
const friday = new Date(2026, 10, 27, 12)

function completeTimes(streak, times, date) {
  let next = streak
  for (let index = 0; index < times; index += 1) next = recordStreakCompletion(next, date)
  return next
}

test('a streak starts after three lessons in one day', () => {
  let streak = completeTimes(undefined, STREAK_GOAL, monday)
  const summary = summarizeStreak(streak, monday)
  assert.equal(summary.count, 1)
  assert.equal(summary.goalMetToday, true)
  streak = recordStreakCompletion(streak, monday)
  assert.equal(summarizeStreak(streak, monday).count, 1)
})

test('a streak continues on the next day when the goal is met', () => {
  let streak = completeTimes(undefined, STREAK_GOAL, monday)
  assert.equal(summarizeStreak(streak, tuesday).count, 1)
  streak = completeTimes(streak, STREAK_GOAL, tuesday)
  assert.equal(summarizeStreak(streak, tuesday).count, 2)
})

test('a missed goal day breaks the streak', () => {
  let streak = completeTimes(undefined, STREAK_GOAL, monday)
  assert.equal(summarizeStreak(streak, friday).count, 0)
  streak = completeTimes(streak, STREAK_GOAL, friday)
  assert.equal(summarizeStreak(streak, friday).count, 1)
})

test('yesterday count is preserved until today ends', () => {
  const streak = completeTimes(undefined, STREAK_GOAL, tuesday)
  const summary = summarizeStreak(streak, wednesday)
  assert.equal(summary.count, 1)
  assert.equal(summary.todayCount, 0)
  assert.equal(summary.remaining, STREAK_GOAL)
})

test('the same lesson only counts once per day', () => {
  let streak
  for (let index = 0; index < 4; index += 1) streak = recordStreakCompletion(streak, monday, 'variables')
  assert.equal(streak.dayCount, 1)
  assert.equal(summarizeStreak(streak, monday).goalMetToday, false)
  streak = recordStreakCompletion(streak, monday, 'loops')
  streak = recordStreakCompletion(streak, monday, 'functions')
  const summary = summarizeStreak(streak, monday)
  assert.equal(summary.count, 1)
  assert.equal(summary.goalMetToday, true)
})
