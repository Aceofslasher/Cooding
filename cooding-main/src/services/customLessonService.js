import { supabase } from './supabase'

function lessonFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    level: row.level,
    minutes: row.minutes,
    language: row.language,
    description: row.description,
    objective: row.objective,
    explanation: row.explanation,
    example: row.example,
    starterCode: row.starter_code,
    expectedOutput: row.expected_output,
    hint: row.hint,
    referenceUrl: row.reference_url || '',
    isCustom: true,
    author: row.owner_name || 'Learner',
    ownerId: row.owner_id,
  }
}

export async function loadSharedCustomLessons() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('custom_lessons')
    .select('id, owner_id, owner_name, title, topic, level, minutes, language, description, objective, explanation, example, starter_code, expected_output, hint, reference_url')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).map(lessonFromRow)
}

export async function publishCustomLessons(lessons, userId, displayName) {
  if (!supabase || !userId || !lessons.length) return
  const rows = lessons.map((lesson) => ({
    id: lesson.id,
    owner_id: userId,
    owner_name: displayName || 'Learner',
    title: lesson.title,
    topic: lesson.topic,
    level: lesson.level,
    minutes: lesson.minutes,
    language: lesson.language || 'javascript',
    description: lesson.description,
    objective: lesson.objective,
    explanation: lesson.explanation,
    example: lesson.example,
    starter_code: lesson.starterCode,
    expected_output: lesson.expectedOutput,
    hint: lesson.hint,
    reference_url: lesson.referenceUrl || '',
  }))
  const { error } = await supabase.from('custom_lessons').upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteSharedCustomLesson(lessonId) {
  if (!supabase) return
  const { error } = await supabase.from('custom_lessons').delete().eq('id', lessonId)
  if (error) throw error
}
