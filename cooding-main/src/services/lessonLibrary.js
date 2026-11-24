export const customLessonsStorageKey = 'loopwise-custom-lessons'

const requiredTextFields = [
  'title',
  'topic',
  'description',
  'objective',
  'explanation',
  'example',
  'starterCode',
  'expectedOutput',
  'hint',
]
const levels = ['Beginner', 'Intermediate', 'Advanced']
const maxTextLength = 5000
const maxImportedLessons = 100

export function validateLesson(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Each lesson must be a JSON object.')
  }

  for (const field of requiredTextFields) {
    if (typeof input[field] !== 'string' || !input[field].trim()) {
      throw new Error(`${field} is required.`)
    }
    if (input[field].length > maxTextLength) {
      throw new Error(`${field} must be ${maxTextLength} characters or fewer.`)
    }
  }

  if (!levels.includes(input.level)) {
    throw new Error('Level must be Beginner, Intermediate, or Advanced.')
  }
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 120) {
    throw new Error('Minutes must be a whole number from 1 to 120.')
  }
  if (input.language !== 'javascript') {
    throw new Error('Only JavaScript lessons are supported in Lesson Studio.')
  }

  if (input.referenceUrl !== undefined && typeof input.referenceUrl !== 'string') {
    throw new Error('Reference URL must be text.')
  }
  const referenceUrl = input.referenceUrl?.trim() || ''
  if (referenceUrl) {
    let url
    try {
      url = new URL(referenceUrl)
    } catch {
      throw new Error('Reference URL must be a valid HTTPS URL.')
    }
    if (url.protocol !== 'https:') {
      throw new Error('Reference URL must use HTTPS.')
    }
  }

  const id = input.id || `custom-${globalThis.crypto.randomUUID()}`
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) {
    throw new Error('Lesson id may only contain letters, numbers, and hyphens.')
  }

  return {
    id,
    title: input.title.trim(),
    topic: input.topic.trim(),
    level: input.level,
    minutes: input.minutes,
    language: 'javascript',
    description: input.description.trim(),
    objective: input.objective.trim(),
    explanation: input.explanation.trim(),
    example: input.example,
    starterCode: input.starterCode,
    expectedOutput: input.expectedOutput,
    hint: input.hint.trim(),
    referenceUrl,
    isCustom: true,
  }
}

export function parseLessonImport(jsonText, existingLessons = []) {
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('Import must be valid JSON.')
  }
  const inputLessons = Array.isArray(parsed) ? parsed : [parsed]
  if (!inputLessons.length) throw new Error('Import must contain at least one lesson.')
  if (inputLessons.length > maxImportedLessons) {
    throw new Error(`Import can contain at most ${maxImportedLessons} lessons at a time.`)
  }

  const existingIds = new Set(existingLessons.map((lesson) => lesson.id))
  const imported = inputLessons.map((lesson) => validateLesson(lesson))
  const importedIds = new Set()
  for (const lesson of imported) {
    if (existingIds.has(lesson.id) || importedIds.has(lesson.id)) {
      throw new Error(`A lesson with id "${lesson.id}" already exists.`)
    }
    importedIds.add(lesson.id)
  }
  return imported
}

export function readCustomLessons() {
  const stored = localStorage.getItem(customLessonsStorageKey)
  if (!stored) return []
  const parsed = JSON.parse(stored)
  if (!Array.isArray(parsed)) throw new Error('Saved Lesson Studio data must be a JSON array.')
  if (!parsed.length) return []
  return parseLessonImport(stored)
}

export function saveCustomLessons(lessons) {
  localStorage.setItem(customLessonsStorageKey, JSON.stringify(lessons))
}
