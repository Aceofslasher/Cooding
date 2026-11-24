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
    return { ok: false, status: 403 }
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