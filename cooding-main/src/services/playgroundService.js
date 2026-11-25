import { supabase } from './supabase'

const PROJECT_COLUMNS = 'id, name, files, updated_at'

function explainError(error) {
  if (!error) return new Error('Unknown playground project error')
  const message = typeof error.message === 'string' ? error.message : ''
  if (error.code === '42P01' || /relation .*playground_projects.* does not exist/i.test(message)) {
    return new Error('Saved playground projects need the latest database migration. Run supabase/migrations/202611260001_learning_data_foundation.sql in the Supabase SQL editor.')
  }
  if (error.code === '23505' || /duplicate key/i.test(message)) {
    return new Error('A saved project with that name already exists. Rename this project or open the saved one.')
  }
  if (error.code === '42501' || /row-level security/i.test(message)) {
    return new Error('This account is not allowed to save playground projects. Sign out and in again, then retry.')
  }
  return error instanceof Error ? error : new Error(message || 'Could not reach saved projects')
}

export async function listPlaygroundProjects(userId) {
  if (!supabase || !userId) return []
  const { data, error } = await supabase
    .from('playground_projects')
    .select('id, name, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw explainError(error)
  return data || []
}

export async function loadPlaygroundProject(projectId) {
  if (!supabase || !projectId) return null
  const { data, error } = await supabase
    .from('playground_projects')
    .select(PROJECT_COLUMNS)
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw explainError(error)
  return data
}

export async function savePlaygroundProject({ id = null, userId, name, files }) {
  if (!supabase || !userId) throw new Error('Sign in to save playground projects.')
  if (id) {
    const { data, error } = await supabase
      .from('playground_projects')
      .update({ name, files })
      .eq('id', id)
      .select(PROJECT_COLUMNS)
      .maybeSingle()
    if (error) throw explainError(error)
    if (!data) throw new Error('That saved project no longer exists. Save it again to create a new copy.')
    return data
  }
  const { data, error } = await supabase
    .from('playground_projects')
    .insert({ user_id: userId, name, files })
    .select(PROJECT_COLUMNS)
    .single()
  if (error) throw explainError(error)
  return data
}

export async function deletePlaygroundProject(projectId) {
  if (!supabase || !projectId) return
  const { error } = await supabase.from('playground_projects').delete().eq('id', projectId)
  if (error) throw explainError(error)
}
