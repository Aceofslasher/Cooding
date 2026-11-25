import { dayKey } from './streak.js'

const WEEKDAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

export function recentActivity(progress = {}, days = 7, now = new Date()) {
  const buckets = new Map()
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now)
    date.setDate(date.getDate() - offset)
    buckets.set(dayKey(date), { key: dayKey(date), label: WEEKDAY_FORMAT.format(date), count: 0, lessons: 0 })
  }
  const bump = (iso, kind) => {
    if (!iso) return
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return
    const bucket = buckets.get(dayKey(date))
    if (!bucket) return
    bucket.count += 1
    if (kind === 'lesson') bucket.lessons += 1
  }
  for (const iso of Object.values(progress.lessonCompletedAt || {})) bump(iso, 'lesson')
  for (const attempt of progress.attempts || []) bump(attempt.createdAt)
  for (const quiz of progress.quizAttempts || []) bump(quiz.completedAt)
  return [...buckets.values()]
}

export function summarizeMistakes(errorHistory = []) {
  const byTopic = new Map()
  let unresolved = 0
  let resolved = 0
  for (const row of errorHistory) {
    if (row.resolved) resolved += 1
    else unresolved += 1
    const topic = row.topic || 'General practice'
    const entry = byTopic.get(topic) || { topic, total: 0, unresolved: 0, resolved: 0, lastAt: null, lastError: '', errors: [] }
    entry.total += 1
    if (row.resolved) entry.resolved += 1
    else entry.unresolved += 1
    if (!entry.lastAt || new Date(row.createdAt) > new Date(entry.lastAt)) {
      entry.lastAt = row.createdAt
      entry.lastError = row.errorMessage || ''
    }
    entry.errors.push(row)
    byTopic.set(topic, entry)
  }
  const topics = [...byTopic.values()].sort((first, second) => second.unresolved - first.unresolved || second.total - first.total)
  return {
    total: errorHistory.length,
    unresolved,
    resolved,
    topics,
    recurring: topics.filter((entry) => entry.total >= 2 && entry.unresolved > 0),
  }
}

export function buildPrerequisiteMap(lessons = []) {
  const map = new Map()
  const byLanguage = new Map()
  for (const lesson of lessons) {
    if (lesson.isCustom) continue
    const list = byLanguage.get(lesson.language) || []
    if (list.length) map.set(lesson.id, list[list.length - 1])
    list.push(lesson)
    byLanguage.set(lesson.language, list)
  }
  return map
}

export function recentCompletions(progress = {}, lessons = [], limit = 3) {
  const completedIds = new Set(progress.lessonsCompleted || [])
  const timestamps = progress.lessonCompletedAt || {}
  return lessons
    .filter((lesson) => completedIds.has(lesson.id))
    .sort((first, second) => new Date(timestamps[second.id] || 0) - new Date(timestamps[first.id] || 0))
    .slice(0, limit)
}

export function recommendNextLesson(progress = {}, lessons = [], builtInLessons = null) {
  const pool = (builtInLessons || lessons.filter((lesson) => !lesson.isCustom)).filter(Boolean)
  if (!pool.length) return null
  const completed = new Set(progress.lessonsCompleted || [])
  const unfinished = pool.filter((lesson) => !completed.has(lesson.id))
  if (!unfinished.length) return { lesson: pool[0], reason: 'You finished every lesson. Revisit one to keep the ideas fresh.' }

  const mistakes = summarizeMistakes(progress.errorHistory || [])
  for (const entry of mistakes.topics) {
    if (!entry.unresolved) continue
    const match = unfinished.find((lesson) => lesson.topic && lesson.topic.toLowerCase() === entry.topic.toLowerCase())
    if (match) {
      return {
        lesson: match,
        reason: `${entry.unresolved} unresolved ${entry.topic} mistake${entry.unresolved === 1 ? '' : 's'} to turn around.`,
      }
    }
  }

  const startedAt = progress.lessonStartedAt || {}
  const started = unfinished
    .filter((lesson) => startedAt[lesson.id])
    .sort((first, second) => new Date(startedAt[second.id]) - new Date(startedAt[first.id]))
  if (started.length) return { lesson: started[0], reason: 'You already opened this lesson. Finish what you started.' }

  return { lesson: unfinished[0], reason: 'The next step in your learning path.' }
}
