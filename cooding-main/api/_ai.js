const DEFAULT_GEMINI_FALLBACKS = 'gemini-flash-lite-latest,gemini-3.1-flash-lite'
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

export class AiProviderError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AiProviderError'
  }
}

function providerErrorHint(status) {
  if (status === 401 || status === 403) return 'Check the API key, AI_BASE_URL, and whether the key can access this model.'
  if (status === 404) return 'Check AI_BASE_URL and AI_MODEL.'
  if (status === 429) return 'The provider quota or rate limit may have been reached.'
  return 'Check the AI provider settings and try again.'
}

async function readProviderError(upstream) {
  if (typeof upstream.text !== 'function') return ''
  const raw = await upstream.text().catch(() => '')
  let detail = ''
  try {
    const parsed = JSON.parse(raw)
    detail = parsed?.error?.message || parsed?.message || ''
  } catch {
    detail = ''
  }
  if (typeof detail !== 'string') return ''
  const key = process.env.AI_API_KEY
  return detail
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
    .split(key || '\u0000')
    .join('[redacted]')
}

// New AI Studio keys (AQ. prefix) authenticate with x-goog-api-key on the native
// generateContent endpoint; the OpenAI-compatible surface rejects them on some accounts.
function geminiNativeRoot() {
  const baseUrl = (process.env.AI_BASE_URL || '').replace(/\/+$/, '')
  if (process.env.AI_GEMINI_NATIVE === 'true') {
    return baseUrl.replace(/\/openai$/, '') || 'https://generativelanguage.googleapis.com/v1beta'
  }
  if (!baseUrl) return ''
  try {
    if (new URL(baseUrl).hostname !== 'generativelanguage.googleapis.com') return ''
  } catch {
    return ''
  }
  return baseUrl.replace(/\/openai$/, '')
}

function geminiEndpoint(root, model) {
  const apiRoot = /\/(v1beta|v1)$/.test(root) ? root : `${root}/v1beta`
  return `${apiRoot}/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`
}

function geminiReply(data) {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('').trim()
}

function requestGemini(root, candidate, systemPrompt, history, userMessage, timeoutMs, options) {
  return fetch(geminiEndpoint(root, candidate), {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.AI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        ...history.map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
        { role: 'user', parts: [{ text: userMessage }] },
      ],
      generationConfig: { temperature: options.temperature, maxOutputTokens: options.maxOutputTokens },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
}

function requestCompatible(baseUrl, candidate, systemPrompt, history, userMessage, timeoutMs, options) {
  return fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: candidate,
      temperature: options.temperature,
      max_tokens: options.maxOutputTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
}

export async function generateAiText({
  systemPrompt,
  history = [],
  userMessage,
  maxOutputTokens = 1600,
  temperature = 0.4,
  timeoutMs = 25_000,
  maxChars = 8000,
  fallbackMessage = 'The AI service is temporarily unavailable.',
}) {
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.AI_MODEL || 'gpt-4o-mini'
  const nativeRoot = geminiNativeRoot()
  // Gemini overloads individual models with transient 503s; try the next candidate instead of failing.
  const fallbackModels = (process.env.AI_FALLBACK_MODELS || (nativeRoot ? DEFAULT_GEMINI_FALLBACKS : ''))
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  const candidates = [...new Set([model, ...fallbackModels])]
  const options = { maxOutputTokens, temperature }

  try {
    let upstream = null
    let detail = ''
    let status = 0
    const deadline = Date.now() + timeoutMs
    for (const candidate of candidates) {
      const remaining = deadline - Date.now()
      if (remaining < 2_000) break
      try {
        upstream = nativeRoot
          ? await requestGemini(nativeRoot, candidate, systemPrompt, history, userMessage, Math.min(12_000, remaining), options)
          : await requestCompatible(baseUrl, candidate, systemPrompt, history, userMessage, Math.min(20_000, remaining), options)
      } catch {
        upstream = null
        status = 0
        detail = ''
        continue
      }
      status = upstream.status
      if (upstream.ok) break
      detail = await readProviderError(upstream)
      if (!RETRYABLE_STATUS.has(status)) break
    }
    if (!upstream || !upstream.ok) {
      const message = status
        ? `The AI provider returned HTTP ${status}.${detail ? ` ${detail}` : ''} ${providerErrorHint(status)}`
        : 'The AI provider did not respond in time. Please try again in a moment.'
      throw new AiProviderError(message)
    }
    const data = await upstream.json()
    const reply = nativeRoot ? geminiReply(data) : data.choices?.[0]?.message?.content
    if (typeof reply !== 'string' || !reply.trim()) {
      const blocked = nativeRoot && data?.promptFeedback?.blockReason
      throw new AiProviderError(blocked ? `The AI provider blocked the reply (${data.promptFeedback.blockReason}).` : 'The AI provider returned an empty reply.')
    }
    return reply.slice(0, maxChars)
  } catch (error) {
    if (error instanceof AiProviderError) throw error
    throw new AiProviderError(fallbackMessage)
  }
}
