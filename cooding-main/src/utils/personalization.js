import { buildTopicMastery, recentActivity, summarizeMistakes } from './insights.js'

const DIFFICULTY_ORDER = { Beginner: 0, Intermediate: 1, Advanced: 2 }

export function attemptPercent(attempt = {}) {
  if (Number.isFinite(Number(attempt.score))) return Math.max(0, Math.min(100, Math.round(Number(attempt.score))))
  const total = Number(attempt.totalTests) || 0
  const passed = Number(attempt.passedTests) || 0
  if (total > 0) return Math.round((Math.min(passed, total) / total) * 100)
  return attempt.passed ? 100 : 0
}

export function exerciseOutcomes(progress = {}) {
  const outcomes = new Map()
  for (const attempt of progress.attempts || []) {
    const key = attempt.exerciseId || attempt.title
    if (!key) continue
    const entry = outcomes.get(key) || { key, attempts: 0, passed: false, bestScore: 0, lastAttemptAt: null }
    entry.attempts += 1
    entry.bestScore = Math.max(entry.bestScore, attemptPercent(attempt))
    if (attempt.createdAt && (!entry.lastAttemptAt || new Date(attempt.createdAt) > new Date(entry.lastAttemptAt))) {
      entry.lastAttemptAt = attempt.createdAt
    }
    if (attempt.passed) entry.passed = true
    outcomes.set(key, entry)
  }
  return outcomes
}

export function buildImprovement(progress = {}, windowSize = 5) {
  const attempts = [...(progress.attempts || [])]
    .filter((attempt) => attempt.createdAt)
    .sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt))
  if (attempts.length < 3) {
    return { trend: 'starting', current: null, previous: null, delta: 0, label: 'Keep practicing to see a trend' }
  }
  const recent = attempts.slice(-windowSize)
  const earlier = attempts.slice(-windowSize * 2, -windowSize)
  const rate = (list) => (list.length ? list.filter((attempt) => attempt.passed).length / list.length : null)
  const current = rate(recent)
  const previous = rate(earlier)
  if (previous === null) {
    return { trend: 'starting', current, previous, delta: 0, label: `${Math.round(current * 100)}% of recent attempts passed` }
  }
  const delta = current - previous
  const trend = delta >= 0.15 ? 'improving' : delta <= -0.15 ? 'slipping' : 'steady'
  const label = trend === 'improving'
    ? 'Your pass rate is improving'
    : trend === 'slipping'
      ? 'Recent attempts are harder — review your open mistakes'
      : 'Your pass rate is holding steady'
  return { trend, current, previous, delta, label }
}

export function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0))
  if (seconds < 60) return seconds ? `${seconds}s` : '0m'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export function buildPersonalization(progress = {}, { lessons = [], exercises = [] } = {}) {
  const attempts = progress.attempts || []
  const outcomes = exerciseOutcomes(progress)
  const passedAttempts = attempts.filter((attempt) => attempt.passed).length
  const passRate = attempts.length ? passedAttempts / attempts.length : null
  const graded = attempts.filter((attempt) => Number.isFinite(Number(attempt.score)))
  const avgScore = graded.length
    ? Math.round(graded.reduce((total, attempt) => total + attemptPercent(attempt), 0) / graded.length)
    : null
  const practiceSeconds = attempts.reduce((total, attempt) => total + (Number(attempt.durationSeconds) || 0), 0)
  const lessonSeconds = Object.values(progress.lessonTimeSpent || {}).reduce((total, value) => total + (Number(value) || 0), 0)
  const exercisesPassed = exercises.filter((exercise) => outcomes.get(exercise.id)?.passed).length
  const weekly = recentActivity(progress, 7)
  const weekActivities = weekly.reduce((total, day) => total + day.count, 0)
  const mastery = buildTopicMastery(progress, lessons)
  const mistakes = summarizeMistakes(progress.errorHistory || [])
  const improvement = buildImprovement(progress)

  const weakness = new Map()
  const addSignal = (topic, weight) => {
    if (!topic) return
    const key = String(topic).toLowerCase()
    weakness.set(key, (weakness.get(key) || 0) + weight)
  }
  for (const attempt of attempts) {
    if (attempt.passed) continue
    addSignal(attempt.topic, 1)
  }
  for (const entry of mistakes.topics) addSignal(entry.topic, entry.unresolved * 2)
  for (const entry of mastery) if (entry.status === 'Needs Practice') addSignal(entry.topic, 1)

  const recommendations = exercises
    .filter((exercise) => !outcomes.get(exercise.id)?.passed)
    .map((exercise) => {
      const outcome = outcomes.get(exercise.id)
      const signals = weakness.get(String(exercise.topic).toLowerCase()) || 0
      const retried = outcome && !outcome.passed ? 1.5 : 0
      const neverTried = outcome ? 0 : 0.4
      return {
        exercise,
        score: signals * 2 + retried + neverTried,
        reason: signals > 0
          ? `${signals} recent signal${signals === 1 ? '' : 's'} in ${exercise.topic}`
          : outcome
            ? 'You tried this once; a second pass will confirm it'
            : `A short ${exercise.difficulty.toLowerCase()} exercise in ${exercise.topic}`,
      }
    })
    .sort((first, second) => second.score - first.score
      || (DIFFICULTY_ORDER[first.exercise.difficulty] ?? 9) - (DIFFICULTY_ORDER[second.exercise.difficulty] ?? 9)
      || first.exercise.title.localeCompare(second.exercise.title))
    .slice(0, 3)

  return {
    attempts: attempts.length,
    passedAttempts,
    passRate,
    avgScore,
    exercisesPassed,
    practiceSeconds,
    lessonSeconds,
    totalSeconds: practiceSeconds + lessonSeconds,
    weekly,
    weekActivities,
    mastery,
    masterySummary: {
      mastered: mastery.filter((entry) => entry.status === 'Mastered').length,
      needsPractice: mastery.filter((entry) => entry.status === 'Needs Practice').length,
      inProgress: mastery.filter((entry) => entry.status === 'In Progress').length,
    },
    unresolvedMistakes: mistakes.unresolved,
    improvement,
    recommendations,
  }
}
