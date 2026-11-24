export const INTERMEDIATE_AFTER = 15

export function deriveSkillLevel(completedLessons, totalLessons) {
  const completed = Math.max(0, Number(completedLessons) || 0)
  const total = Math.max(0, Number(totalLessons) || 0)
  if (!total) return 'Beginner'
  if (completed >= Math.ceil(total / 2)) return 'Advanced'
  if (completed >= INTERMEDIATE_AFTER) return 'Intermediate'
  return 'Beginner'
}

export function skillLevelPlan(completedLessons, totalLessons) {
  const completed = Math.max(0, Number(completedLessons) || 0)
  const total = Math.max(0, Number(totalLessons) || 0)
  const advancedAt = total ? Math.ceil(total / 2) : INTERMEDIATE_AFTER
  const level = deriveSkillLevel(completed, total)
  if (level === 'Advanced') return { level, intermediateAt: INTERMEDIATE_AFTER, advancedAt, nextLevel: null, lessonsToNext: 0 }
  const nextLevel = level === 'Beginner' ? 'Intermediate' : 'Advanced'
  const target = level === 'Beginner' ? Math.min(INTERMEDIATE_AFTER, advancedAt) : advancedAt
  return { level, intermediateAt: INTERMEDIATE_AFTER, advancedAt, nextLevel, lessonsToNext: Math.max(0, target - completed) }
}
