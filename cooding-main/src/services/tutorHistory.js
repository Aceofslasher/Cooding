import { supabase } from './supabase'

const CONVERSATION_TITLE = 'Loopwise tutor'

export async function loadTutorHistory(userId, limit = 80) {
  if (!supabase || !userId) return { conversationId: null, messages: [] }
  const { data: conversation, error } = await supabase
    .from('ai_conversations')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  let conversationId = conversation?.id
  if (!conversationId) {
    const created = await supabase.from('ai_conversations').insert({ user_id: userId, title: CONVERSATION_TITLE }).select('id').single()
    if (created.error) throw created.error
    conversationId = created.data.id
  }
  const { data, error: messagesError } = await supabase
    .from('ai_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (messagesError) throw messagesError
  return {
    conversationId,
    messages: (data ?? []).map((row) => ({ id: row.id, role: row.role, content: row.content, createdAt: row.created_at })),
  }
}

export async function startTutorConversation(userId) {
  if (!supabase || !userId) return null
  const { data, error } = await supabase.from('ai_conversations').insert({ user_id: userId, title: CONVERSATION_TITLE }).select('id').single()
  if (error) throw error
  return data.id
}

export async function saveTutorMessage(userId, conversationId, message) {
  if (!supabase || !userId || !conversationId || !message?.content?.trim()) return
  const { error } = await supabase.from('ai_messages').upsert({
    id: message.id,
    conversation_id: conversationId,
    user_id: userId,
    role: message.role,
    content: String(message.content).slice(0, 12000),
  }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw error
  const { error: touchError } = await supabase
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', userId)
  if (touchError) throw touchError
}
