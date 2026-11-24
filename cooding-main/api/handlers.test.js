import test from 'node:test'
import assert from 'node:assert/strict'
import tutorHandler from './tutor.js'
import executionHandler from './execute.js'

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

function withoutSupabaseConfig() {
  for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) delete process.env[key]
}

test('hosted tutor fails closed without Supabase token verification', async () => {
  withoutSupabaseConfig()
  const response = createResponse()
  await tutorHandler({ method: 'POST', headers: {}, body: { question: 'Explain a variable' } }, response)
  assert.equal(response.statusCode, 401)
})

test('hosted Python execution fails closed without Supabase token verification', async () => {
  withoutSupabaseConfig()
  const response = createResponse()
  await executionHandler({ method: 'POST', headers: {}, body: { sourceCode: 'print(1)' } }, response)
  assert.equal(response.statusCode, 401)
})

test('provider endpoints reject methods other than POST', async () => {
  const request = { method: 'GET', headers: {}, body: {} }
  const tutorResponse = createResponse()
  const executionResponse = createResponse()
  await tutorHandler(request, tutorResponse)
  await executionHandler(request, executionResponse)
  assert.equal(tutorResponse.statusCode, 405)
  assert.equal(executionResponse.statusCode, 405)
})

test('hosted tutor reports provider status and a safe troubleshooting hint', async () => {
  const originalFetch = global.fetch
  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL: process.env.AI_MODEL,
  }
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.AI_API_KEY = 'test-ai-key'
  process.env.AI_BASE_URL = 'https://api.example.com/v1'
  process.env.AI_MODEL = 'test-model'
  global.fetch = async (url) => {
    if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'student' }) }
    return { ok: false, status: 403, text: async () => JSON.stringify({ error: { message: 'Key blocked by provider policy' } }) }
  }

  try {
    const response = createResponse()
    await tutorHandler({
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      body: { question: 'Explain a variable' },
    }, response)
    assert.equal(response.statusCode, 502)
    assert.match(response.body.error, /HTTP 403/)
    assert.match(response.body.error, /Key blocked by provider policy/)
    assert.match(response.body.error, /API key/)
    assert.doesNotMatch(response.body.error, /test-ai-key/)
  } finally {
    global.fetch = originalFetch
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('hosted tutor uses native Gemini auth for generativelanguage base URLs', async () => {
  const originalFetch = global.fetch
  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL: process.env.AI_MODEL,
    AI_GEMINI_NATIVE: process.env.AI_GEMINI_NATIVE,
  }
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.AI_API_KEY = 'AQ.test-key'
  process.env.AI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'
  process.env.AI_MODEL = 'gemini-test'
  delete process.env.AI_GEMINI_NATIVE
  let captured = null
  global.fetch = async (url, options = {}) => {
    if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'student' }) }
    captured = { url, options }
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Use a variable.' }] } }] }),
    }
  }

  try {
    const response = createResponse()
    await tutorHandler({
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      body: { question: 'Explain a variable', history: [{ role: 'assistant', content: 'Hello' }] },
    }, response)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.reply, 'Use a variable.')
    assert.equal(captured.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent')
    assert.equal(captured.options.headers['x-goog-api-key'], 'AQ.test-key')
    assert.equal(captured.options.headers.Authorization, undefined)
    const sent = JSON.parse(captured.options.body)
    assert.equal(sent.contents.at(-1).role, 'user')
    assert.equal(sent.contents[0].role, 'model')
    assert.match(sent.systemInstruction.parts[0].text, /tutor/)
  } finally {
    global.fetch = originalFetch
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})