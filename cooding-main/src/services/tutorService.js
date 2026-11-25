import { getAuthHeaders } from './supabase'

function localTutorReply({ question, code, error, context, mode = 'learning' }) {
  const prompt = [question, error].filter(Boolean).join(' ').toLowerCase()
  let explanation

  if (mode === 'explain') {
    return `This reply is a demo because the hosted tutor is not connected. To read code like a story, go from top to bottom:\n\n1. Find where the values are created.\n2. Follow every place those values are used.\n3. Note the lines that change the page or print a result.\n\n${code?.trim() ? 'With the hosted tutor enabled, I would walk through the code you attached line by line.' : 'Attach the code you want explained, then send the question again.'}`
  }
  if (mode === 'correct') {
    return `This reply is a demo because the hosted tutor is not connected. A safe correction routine:\n\n1. Run the code and read the first error message.\n2. Fix only the reported line or block.\n3. Run again before changing anything else.\n\n${code?.trim() ? 'The hosted tutor can then suggest the smallest change and show a corrected snippet for you to review in the Playground.' : 'Attach the broken code so the hosted tutor can point at the exact line.'}`
  }
  if (mode === 'quiz') {
    return `Quick check: which part of a loop decides when the loop should stop?\n\nA. The starting value\nB. The condition\nC. The variable name\n\nReply with A, B, or C and I will tell you why.`
  }
  if (mode === 'hint' || prompt.includes('hint') || prompt.includes('stuck')) {
    explanation = context?.hint || 'Try splitting the task into one small step. What value do you need first, and what should the program do with it?'
  } else if (prompt.includes('undefined') || prompt.includes('referenceerror')) {
    explanation = 'This usually means JavaScript cannot find a variable with that name. Check the spelling and make sure the variable is declared before this line runs.'
  } else if (prompt.includes('syntax') || prompt.includes('unexpected')) {
    explanation = 'This looks like a syntax issue: the parser reached something it did not expect. Check the line just before the reported position for a missing quote, bracket, or closing brace.'
  } else if (prompt.includes('variable')) {
    explanation = 'A variable gives a value a reusable name. You can use that name in more than one place, and if the value changes, you update it once. What other part of this greeting might reuse the learner name?'
  } else if (prompt.includes('loop') || context?.topic === 'Loops') {
    explanation = 'A loop needs a starting value, a condition that eventually becomes false, and an update. Trace those three pieces for two iterations. Which one is easiest to check first?'
  } else if (prompt.includes('function')) {
    explanation = 'A function parameter receives an input, and `return` sends a result back. Printing a value and returning it are different actions. Which result should the caller receive?'
  } else if (context?.recentMistakes?.length) {
    explanation = `I noticed you have been practicing ${context.recentMistakes[0].split(':')[0]}. Let's use this question to strengthen that idea: what does the first line do, and what value do you expect next?`
  } else {
    explanation = `Let's work through it one step at a time. ${context?.objective ? `The goal is to ${context.objective.toLowerCase()} ` : ''}What does the first line do, and what value do you expect next?`
  }

  if (code?.trim()) explanation += '\n\nI looked at the code you attached. Try tracing the values in order, then run it again to see whether the output changes.'
  return explanation
}

export async function askTutor(payload) {
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_SERVERLESS !== 'true') {
    return { reply: localTutorReply(payload), mode: 'demo' }
  }
  try {
    const authHeaders = await getAuthHeaders()
    const response = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(40_000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      // Plain `vite` dev cannot serve /api/*; use the local tutor unless `vercel dev` is running.
      if (import.meta.env.DEV && response.status === 404) {
        return { reply: localTutorReply(payload), mode: 'demo' }
      }
      const message = data && typeof data.error === 'string'
        ? data.error
        : `The tutor endpoint returned HTTP ${response.status}.`
      return { reply: `I could not reach the tutor service. ${message}`, mode: 'error', error: message, retryable: true }
    }
    if (!data || typeof data.reply !== 'string' || !data.reply.trim()) {
      return { reply: 'The tutor service returned an empty reply. Please try again.', mode: 'error', error: 'Empty reply', retryable: true }
    }
    return { reply: data.reply, mode: 'ai' }
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    const message = timedOut
      ? 'The tutor took too long to answer. Check your connection and try again.'
      : error instanceof Error && error.message
        ? error.message
        : 'An unexpected error occurred.'
    return { reply: `I could not reach the tutor service. ${message}`, mode: 'error', error: message, retryable: true }
  }
}
