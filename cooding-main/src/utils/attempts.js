export const errorTypes = {
  wrong_answer: 'incorrect_output',
  compile_error: 'compile_error',
  runtime_error: 'runtime_error',
  time_limit: 'time_limit',
  infrastructure_error: 'infrastructure_error',
}

export function errorTypeFor(executionStatus) {
  return errorTypes[executionStatus] || (executionStatus === 'accepted' ? null : 'incorrect_output')
}

export function attemptRefs(attempt = {}) {
  return {
    exerciseRef: attempt.exerciseId || null,
    lessonRef: attempt.lessonId || null,
  }
}

export function attemptScore(attempt = {}) {
  const results = Array.isArray(attempt.testResults) ? attempt.testResults : []
  const total = results.length || (Number(attempt.totalTests) || 0)
  const passed = results.length
    ? results.filter((result) => result.passed).length
    : Number(attempt.passedTests) || 0
  return { passed, total, passedAll: total ? passed === total : Boolean(attempt.passed) }
}

export function errorSignature(row = {}) {
  return [
    row.exerciseRef || row.lessonRef || 'general',
    String(row.topic || '').toLowerCase(),
    row.errorType || 'incorrect_output',
  ].join('|')
}

function matchesAttemptScope(row, attempt) {
  const { exerciseRef, lessonRef } = attemptRefs(attempt)
  if (row.resolved) return false
  if (exerciseRef) return row.exerciseRef === exerciseRef
  if (lessonRef) return row.lessonRef === lessonRef
  return Boolean(attempt.topic) && String(row.topic || '').toLowerCase() === String(attempt.topic).toLowerCase()
}

function isLegacyTopicRow(row, attempt) {
  if (row.resolved || row.exerciseRef || row.lessonRef || !attempt.topic) return false
  if (attemptRefs(attempt).exerciseRef || attemptRefs(attempt).lessonRef) {
    return String(row.topic || '').toLowerCase() === String(attempt.topic).toLowerCase()
  }
  return false
}

export function mergeErrorHistory(rows = [], attempt = {}, now = new Date()) {
  const timestamp = attempt.createdAt || new Date(now).toISOString()
  if (attempt.passed) {
    return rows.map((row) => (matchesAttemptScope(row, attempt) || isLegacyTopicRow(row, attempt)
      ? { ...row, resolved: true, correctionSummary: 'A later attempt passed.', resolvedAt: timestamp, lastSeenAt: timestamp }
      : row))
  }
  if (!attempt.topic) return rows
  const { exerciseRef, lessonRef } = attemptRefs(attempt)
  const errorType = errorTypeFor(attempt.executionStatus) || 'incorrect_output'
  const draft = {
    topic: attempt.topic,
    exerciseRef,
    lessonRef,
    errorType,
  }
  const signature = errorSignature(draft)
  const message = attempt.output || 'The program ran, but its output did not match the exercise requirement.'
  const existing = rows.find((row) => !row.resolved && errorSignature(row) === signature)
  if (existing) {
    return rows.map((row) => (row === existing
      ? {
          ...row,
          occurrences: (Number(row.occurrences) || 1) + 1,
          errorMessage: message,
          language: attempt.language || row.language || null,
          codeExcerpt: attempt.code?.slice(0, 4000) || row.codeExcerpt || '',
          lastSeenAt: timestamp,
        }
      : row))
  }
  return [{
    id: `local-${attempt.id || crypto.randomUUID()}`,
    attemptId: attempt.id || null,
    topic: attempt.topic,
    errorType,
    errorMessage: message,
    language: attempt.language || null,
    lessonRef,
    exerciseRef,
    codeExcerpt: attempt.code?.slice(0, 4000) || '',
    occurrences: 1,
    resolved: false,
    createdAt: timestamp,
    lastSeenAt: timestamp,
  }, ...rows]
}
