import { existsSync, readFileSync } from 'node:fs'

function loadEnvFile(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value
  }
}

function fail(message, hint) {
  console.error(`FAIL  ${message}`)
  if (hint) console.error(`      ${hint}`)
  process.exitCode = 1
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const key = process.env.AI_API_KEY
const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
const model = process.env.AI_MODEL || ''

if (!key) {
  fail('AI_API_KEY is not set.', 'Add it to .env.local (and to the Vercel project for deployments).')
  process.exit()
}

const isGemini = process.env.AI_GEMINI_NATIVE === 'true' || baseUrl.includes('generativelanguage.googleapis.com')
const geminiRoot = (() => {
  const trimmed = baseUrl.replace(/\/openai$/, '')
  return /\/(v1beta|v1)$/.test(trimmed) ? trimmed : 'https://generativelanguage.googleapis.com/v1beta'
})()
const url = isGemini ? `${geminiRoot}/models` : `${baseUrl}/models`
const headers = isGemini ? { 'x-goog-api-key': key } : { Authorization: `Bearer ${key}` }

console.log(`Checking ${isGemini ? 'Gemini native (x-goog-api-key)' : 'OpenAI-compatible (Bearer)'} auth against ${url}`)

let response
try {
  response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
} catch (error) {
  fail(`Could not reach the provider: ${error.message}`, 'Check your network connection and AI_BASE_URL.')
  process.exit()
}

if (!response.ok) {
  const raw = await response.text().catch(() => '')
  let detail = raw
  let reason = ''
  try {
    const parsed = JSON.parse(raw)
    detail = parsed?.error?.message || parsed?.message || raw
    reason = parsed?.error?.details?.[0]?.reason || ''
  } catch {
    // keep raw text
  }
  fail(
    `The provider rejected the request (HTTP ${response.status}${reason ? `, ${reason}` : ''}): ${String(detail).replace(/\s+/g, ' ').slice(0, 200)}`,
    isGemini
      ? 'The key is not valid for the Gemini API. Copy a current key from https://aistudio.google.com/apikey into AI_API_KEY, or point AI_BASE_URL at another OpenAI-compatible provider.'
      : 'Check AI_API_KEY and AI_BASE_URL. The key must be allowed to use this base URL and model.',
  )
} else {
  const data = await response.json().catch(() => null)
  const names = (data?.models || data?.data || [])
    .map((item) => String(item?.name || item?.id || ''))
    .map((name) => name.replace(/^models\//, ''))
    .filter(Boolean)
  const wanted = model.replace(/^models\//, '')
  console.log(`OK    The key is accepted${names.length ? ` and can see ${names.length} model(s)` : ''}.`)
  if (wanted && names.length && !names.includes(wanted)) {
    console.log(`WARN  AI_MODEL "${wanted}" is not in the model list. Available examples: ${names.slice(0, 8).join(', ')}`)
  } else if (wanted) {
    console.log(`OK    AI_MODEL "${wanted}" is available.`)
  }
}
