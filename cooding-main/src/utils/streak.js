export const STREAK_GOAL = 3

export function dayKey(date = new Date()) {
  const value = new Date(date)
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${value.getFullYear()}-${month}-${day}`
}

function shiftDay(key, offset) {
  const [year, month, day] = key.split('-').map(Number)
  const value = new Date(year, month - 1, day)
  value.setDate(value.getDate() + offset)
  return dayKey(value)
}

export function recordStreakCompletion(streak, date = new Date(), lessonId = null) {
  const today = dayKey(date)
  const base = streak && typeof streak === 'object' ? streak : {}
  const sameDay = base.day === today
  let dayLessons = sameDay && Array.isArray(base.dayLessons) ? base.dayLessons : []
  let dayCount
  if (lessonId) {
    if (!dayLessons.includes(lessonId)) dayLessons = [...dayLessons, lessonId]
    dayCount = dayLessons.length
  } else {
    dayCount = (sameDay ? Number(base.dayCount) || 0 : 0) + 1
  }
  let count = Number(base.count) || 0
  let lastDay = base.lastDay || null
  if (dayCount >= STREAK_GOAL && lastDay !== today) {
    count = lastDay === shiftDay(today, -1) ? count + 1 : 1
    lastDay = today
  }
  return { count, lastDay, day: today, dayCount, dayLessons }
}

export function summarizeStreak(streak, date = new Date()) {
  const today = dayKey(date)
  const base = streak && typeof streak === 'object' ? streak : {}
  const count = Number(base.count) || 0
  const lastDay = base.lastDay || null
  const todayCount = base.day === today ? Math.min(Number(base.dayCount) || 0, STREAK_GOAL) : 0
  const alive = lastDay === today || lastDay === shiftDay(today, -1)
  return {
    count: alive ? count : 0,
    todayCount,
    goalMetToday: lastDay === today,
    remaining: Math.max(0, STREAK_GOAL - todayCount),
  }
}
