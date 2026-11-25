import { supabase } from './supabase'

const lessonIds = {
  variables: 'c6231034-0705-42ed-872a-bad7c0080a01',
  conditionals: 'c6231034-0705-42ed-872a-bad7c0080a02',
  loops: 'c6231034-0705-42ed-872a-bad7c0080a03',
  functions: 'c6231034-0705-42ed-872a-bad7c0080a04',
  arrays: 'c6231034-0705-42ed-872a-bad7c0080a05',
  operators: 'c6231034-0705-42ed-872a-bad7c0080a06',
  objects: 'c6231034-0705-42ed-872a-bad7c0080a07',
  debugging: 'c6231034-0705-42ed-872a-bad7c0080a08',
  output: 'c6231034-0705-42ed-872a-bad7c0080a09',
  syntax: 'c6231034-0705-42ed-872a-bad7c0080a10',
  comments: 'c6231034-0705-42ed-872a-bad7c0080a11',
  'let-const': 'c6231034-0705-42ed-872a-bad7c0080a12',
  'data-types': 'c6231034-0705-42ed-872a-bad7c0080a13',
  'type-conversion': 'c6231034-0705-42ed-872a-bad7c0080a14',
  strings: 'c6231034-0705-42ed-872a-bad7c0080a15',
  'string-methods': 'c6231034-0705-42ed-872a-bad7c0080a16',
  'template-literals': 'c6231034-0705-42ed-872a-bad7c0080a17',
  numbers: 'c6231034-0705-42ed-872a-bad7c0080a18',
  'array-methods': 'c6231034-0705-42ed-872a-bad7c0080a19',
  'array-iteration': 'c6231034-0705-42ed-872a-bad7c0080a20',
  dates: 'c6231034-0705-42ed-872a-bad7c0080a21',
  math: 'c6231034-0705-42ed-872a-bad7c0080a22',
  booleans: 'c6231034-0705-42ed-872a-bad7c0080a23',
  comparisons: 'c6231034-0705-42ed-872a-bad7c0080a24',
  switch: 'c6231034-0705-42ed-872a-bad7c0080a25',
  'while-loops': 'c6231034-0705-42ed-872a-bad7c0080a26',
  'for-in-of': 'c6231034-0705-42ed-872a-bad7c0080a27',
  scope: 'c6231034-0705-42ed-872a-bad7c0080a28',
  hoisting: 'c6231034-0705-42ed-872a-bad7c0080a29',
  'strict-mode': 'c6231034-0705-42ed-872a-bad7c0080a30',
  'arrow-functions': 'c6231034-0705-42ed-872a-bad7c0080a31',
  classes: 'c6231034-0705-42ed-872a-bad7c0080a32',
  destructuring: 'c6231034-0705-42ed-872a-bad7c0080a33',
  callbacks: 'c6231034-0705-42ed-872a-bad7c0080a34',
  timers: 'c6231034-0705-42ed-872a-bad7c0080a35',
  promises: 'c6231034-0705-42ed-872a-bad7c0080a36',
  'async-await': 'c6231034-0705-42ed-872a-bad7c0080a37',
  errors: 'c6231034-0705-42ed-872a-bad7c0080a38',
  json: 'c6231034-0705-42ed-872a-bad7c0080a39',
  'object-methods': 'c6231034-0705-42ed-872a-bad7c0080a40',
  'object-keys': 'c6231034-0705-42ed-872a-bad7c0080a41',
  maps: 'c6231034-0705-42ed-872a-bad7c0080a42',
  sets: 'c6231034-0705-42ed-872a-bad7c0080a43',
  'dom-elements': 'c6231034-0705-42ed-872a-bad7c0080a44',
  'dom-content': 'c6231034-0705-42ed-872a-bad7c0080a45',
  'dom-events': 'c6231034-0705-42ed-872a-bad7c0080a46',
  'event-propagation': 'c6231034-0705-42ed-872a-bad7c0080a47',
  modules: 'c6231034-0705-42ed-872a-bad7c0080a48',
  this: 'c6231034-0705-42ed-872a-bad7c0080a49',
  closures: 'c6231034-0705-42ed-872a-bad7c0080a50',
  'reg-exp': 'c6231034-0705-42ed-872a-bad7c0080a51',
  prototypes: 'c6231034-0705-42ed-872a-bad7c0080a52',
  iterators: 'c6231034-0705-42ed-872a-bad7c0080a53',
  'spread-rest': 'c6231034-0705-42ed-872a-bad7c0080a54',
  'optional-chaining': 'c6231034-0705-42ed-872a-bad7c0080a55',
  'typing-check': 'c6231034-0705-42ed-872a-bad7c0080a56',
  bitwise: 'c6231034-0705-42ed-872a-bad7c0080a57',
  'browser-storage': 'c6231034-0705-42ed-872a-bad7c0080a58',
  'fetch-api': 'c6231034-0705-42ed-872a-bad7c0080a59',
  performance: 'c6231034-0705-42ed-872a-bad7c0080a60',
  'html-basics': 'c6231034-0705-42ed-872a-bad7c0080a61',
  'html-elements': 'c6231034-0705-42ed-872a-bad7c0080a62',
  'html-headings': 'c6231034-0705-42ed-872a-bad7c0080a63',
  'html-paragraphs': 'c6231034-0705-42ed-872a-bad7c0080a64',
  'html-links': 'c6231034-0705-42ed-872a-bad7c0080a65',
  'html-images': 'c6231034-0705-42ed-872a-bad7c0080a66',
  'html-lists': 'c6231034-0705-42ed-872a-bad7c0080a67',
  'html-tables': 'c6231034-0705-42ed-872a-bad7c0080a68',
  'html-forms': 'c6231034-0705-42ed-872a-bad7c0080a69',
  'html-semantic': 'c6231034-0705-42ed-872a-bad7c0080a70',
  'html-media': 'c6231034-0705-42ed-872a-bad7c0080a71',
  'html-meta': 'c6231034-0705-42ed-872a-bad7c0080a72',
}
const lessonSlugs = Object.fromEntries(Object.entries(lessonIds).map(([slug, id]) => [id, slug]))
const languageLabels = { javascript: 'JavaScript', python: 'Python', 'html & css': 'HTML & CSS', html: 'HTML' }

export async function loadCloudProgress(userId) {
  if (!supabase) return null
  const [profileResult, lessonResult, attemptResult, quizResult, errorResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('lesson_progress').select('lesson_id, status, started_at, completed_at').eq('user_id', userId),
    supabase.from('coding_attempts').select('id, exercise_title, topic, programming_language, execution_status, passed_tests, feedback, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    supabase.from('quiz_attempts').select('id, lesson_id, score, total_questions, completed_at').eq('user_id', userId).order('completed_at', { ascending: false }).limit(100),
    supabase.from('error_history').select('id, coding_attempt_id, topic, error_type, error_message, resolved, correction_summary, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(150),
  ])
  for (const result of [profileResult, lessonResult, attemptResult, quizResult, errorResult]) {
    if (result.error) throw result.error
  }
  const lessonRows = lessonResult.data ?? []
  const profile = profileResult.data ?? {}
  const lessonStartedAt = {}
  const lessonCompletedAt = {}
  for (const row of lessonRows) {
    const slug = lessonSlugs[row.lesson_id] || row.lesson_id
    if (row.started_at) lessonStartedAt[slug] = row.started_at
    if (row.completed_at) lessonCompletedAt[slug] = row.completed_at
  }
  return {
    displayName: profile.display_name || 'Learner',
    firstName: profile.first_name || '',
    lastName: profile.last_name || '',
    country: profile.country || '',
    skillLevel: profile.skill_level ? profile.skill_level[0].toUpperCase() + profile.skill_level.slice(1) : 'Beginner',
    preferredLanguage: languageLabels[profile.preferred_language?.toLowerCase()] || 'JavaScript',
    lessonsStarted: lessonRows.map((row) => lessonSlugs[row.lesson_id] || row.lesson_id),
    lessonsCompleted: lessonRows.filter((row) => row.status === 'completed').map((row) => lessonSlugs[row.lesson_id] || row.lesson_id),
    lessonStartedAt,
    lessonCompletedAt,
    errorHistory: (errorResult.data ?? []).map((row) => ({
      id: row.id,
      attemptId: row.coding_attempt_id,
      topic: row.topic || 'General practice',
      errorType: row.error_type,
      errorMessage: row.error_message,
      correctionSummary: row.correction_summary || '',
      resolved: row.resolved,
      createdAt: row.created_at,
    })),
    attempts: (attemptResult.data ?? []).map((row) => ({
      id: row.id,
      title: row.exercise_title || 'Coding attempt',
      topic: row.topic || 'Practice',
      language: row.programming_language,
      executionStatus: row.execution_status,
      passed: row.execution_status === 'accepted',
      output: row.feedback || '',
      createdAt: row.created_at,
    })),
    quizAttempts: (quizResult.data ?? []).map((row) => ({
      id: row.id,
      lessonId: lessonSlugs[row.lesson_id] || row.lesson_id,
      score: row.score,
      totalQuestions: row.total_questions,
      completedAt: row.completed_at,
    })),
  }
}

export async function saveCloudAttempt(userId, attempt) {
  if (!supabase) return
  const executionStatuses = ['accepted', 'wrong_answer', 'compile_error', 'runtime_error', 'time_limit', 'infrastructure_error']
  const executionStatus = attempt.passed ? 'accepted' : executionStatuses.includes(attempt.executionStatus) ? attempt.executionStatus : 'wrong_answer'
  const { data: savedAttempt, error } = await supabase.from('coding_attempts').insert({
    user_id: userId,
    exercise_title: attempt.title,
    topic: attempt.topic,
    submitted_code: attempt.code || '',
    programming_language: attempt.language || 'javascript',
    execution_status: executionStatus,
    passed_tests: attempt.passed ? 1 : 0,
    total_tests: 1,
    feedback: attempt.output || null,
  }).select('id').single()
  if (error) throw error
  if (attempt.passed && attempt.topic) {
    const { error: resolveError } = await supabase.from('error_history').update({ resolved: true, correction_summary: 'A later attempt for this topic passed.' }).eq('user_id', userId).eq('topic', attempt.topic).eq('resolved', false)
    if (resolveError) throw resolveError
  }
  if (!attempt.passed && (['compile_error', 'runtime_error', 'time_limit'].includes(executionStatus) || executionStatus === 'wrong_answer')) {
    const { error: historyError } = await supabase.from('error_history').insert({
      user_id: userId,
      coding_attempt_id: savedAttempt.id,
      topic: attempt.topic || null,
      error_type: executionStatus === 'wrong_answer' ? 'incorrect_output' : executionStatus,
      error_message: attempt.output || 'The program ran, but its output did not match the exercise requirement.',
      resolved: false,
    })
    if (historyError) throw historyError
  }
}

export async function saveCloudLessonProgress(userId, lessonId, status) {
  if (!supabase) return
  const row = { user_id: userId, lesson_id: lessonIds[lessonId] || lessonId, status }
  if (status === 'started') {
    const { error } = await supabase.from('lesson_progress').upsert(row, { onConflict: 'user_id,lesson_id', ignoreDuplicates: true })
    if (error) throw error
    return
  }
  row.completed_at = new Date().toISOString()
  const { data: existing, error: lookupError } = await supabase.from('lesson_progress').select('id, completed_at').eq('user_id', userId).eq('lesson_id', row.lesson_id).maybeSingle()
  if (lookupError) throw lookupError
  const result = existing
    ? await supabase.from('lesson_progress').update({ status, completed_at: existing.completed_at || row.completed_at }).eq('id', existing.id)
    : await supabase.from('lesson_progress').insert(row)
  const { error } = result
  if (error) throw error
}

export async function saveCloudProfile(userId, profile) {
  if (!supabase) return
  const base = {
    id: userId,
    display_name: profile.displayName,
    skill_level: (profile.skillLevel || 'Beginner').toLowerCase(),
    preferred_language: (profile.preferredLanguage || 'JavaScript').toLowerCase(),
  }
  const extended = {
    ...base,
    first_name: profile.firstName || '',
    last_name: profile.lastName || '',
    country: profile.country || '',
  }
  const { error: extendedError } = await supabase.from('profiles').upsert(extended)
  if (!extendedError) return
  const { error: retryError } = await supabase.from('profiles').upsert(base)
  if (retryError) throw retryError
  if (extendedError.code === 'PGRST204' || /first_name|last_name|country/i.test(extendedError.message)) {
    throw new Error('Name details did not sync. Apply supabase/migrations/202611250001_html_custom_lessons.sql in Supabase, then save again.')
  }
  throw extendedError
}

export async function saveCloudQuizAttempt(userId, attempt) {
  if (!supabase) return
  const { error } = await supabase.from('quiz_attempts').insert({
    user_id: userId,
    lesson_id: lessonIds[attempt.lessonId] || attempt.lessonId,
    score: attempt.score,
    total_questions: attempt.totalQuestions,
  })
  if (error) throw error
}