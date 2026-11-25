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

export function buildTopicMastery(progress = {}, lessons = []) {
  const completed = new Set(progress.lessonsCompleted || [])
  const started = new Set(progress.lessonsStarted || [])
  const entries = new Map()
  const entryFor = (topic, language) => {
    const key = String(topic || '').toLowerCase()
    if (!key) return null
    const existing = entries.get(key)
    if (existing) {
      if (!existing.language && language) existing.language = language
      return existing
    }
    const created = {
      topic,
      language: language || 'javascript',
      lessons: 0,
      completed: 0,
      started: 0,
      attempts: 0,
      passed: 0,
      unresolved: 0,
      status: 'Not Started',
    }
    entries.set(key, created)
    return created
  }
  for (const lesson of lessons.filter((item) => !item.isCustom)) {
    const entry = entryFor(lesson.topic, lesson.language)
    if (!entry) continue
    entry.lessons += 1
    if (completed.has(lesson.id)) entry.completed += 1
    if (started.has(lesson.id)) entry.started += 1
  }
  for (const attempt of progress.attempts || []) {
    const entry = entryFor(attempt.topic || 'General practice', attempt.language)
    if (!entry) continue
    entry.attempts += 1
    if (attempt.passed) entry.passed += 1
  }
  for (const row of progress.errorHistory || []) {
    if (row.resolved) continue
    const entry = entryFor(row.topic || 'General practice', row.language)
    if (entry) entry.unresolved += Number(row.occurrences) || 1
  }
  const topics = [...entries.values()].map((entry) => {
    const passRate = entry.attempts ? entry.passed / entry.attempts : null
    let status = 'Not Started'
    if (!entry.started && !entry.attempts && !entry.unresolved) status = 'Not Started'
    else if (entry.unresolved > 0 || (entry.attempts >= 2 && passRate < 0.5)) status = 'Needs Practice'
    else if (entry.lessons && entry.completed === entry.lessons) status = 'Mastered'
    else status = 'In Progress'
    return { ...entry, passRate, status }
  })
  const order = { 'Needs Practice': 0, 'In Progress': 1, Mastered: 2, 'Not Started': 3 }
  topics.sort((first, second) => order[first.status] - order[second.status] || first.topic.localeCompare(second.topic))
  return topics
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
