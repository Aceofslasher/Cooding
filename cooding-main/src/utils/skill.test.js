import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveSkillLevel, skillLevelPlan } from './skill.js'

test('skill level starts at Beginner and upgrades after 15 lessons', () => {
  assert.equal(deriveSkillLevel(0, 72), 'Beginner')
  assert.equal(deriveSkillLevel(14, 72), 'Beginner')
  assert.equal(deriveSkillLevel(15, 72), 'Intermediate')
  assert.equal(deriveSkillLevel(35, 72), 'Intermediate')
})

test('skill level reaches Advanced at half of the built-in lessons', () => {
  assert.equal(deriveSkillLevel(36, 72), 'Advanced')
  assert.equal(deriveSkillLevel(70, 72), 'Advanced')
  assert.equal(deriveSkillLevel(10, 20), 'Advanced')
})

test('skill plan reports the lessons left before the next level', () => {
  assert.deepEqual(skillLevelPlan(10, 72), { level: 'Beginner', intermediateAt: 15, advancedAt: 36, nextLevel: 'Intermediate', lessonsToNext: 5 })
  assert.deepEqual(skillLevelPlan(20, 72), { level: 'Intermediate', intermediateAt: 15, advancedAt: 36, nextLevel: 'Advanced', lessonsToNext: 16 })
  assert.equal(skillLevelPlan(40, 72).lessonsToNext, 0)
})
