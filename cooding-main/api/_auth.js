export async function verifyConfiguredUser(request) {
  const projectUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!projectUrl || !anonKey) return { configured: false, authorized: false, reason: 'unconfigured' }

  const authorization = request.headers.authorization || ''
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token || token.length > 4096) return { configured: true, authorized: false, reason: 'missing-token' }

  try {
    const response = await fetch(`${projectUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return { configured: true, authorized: false, reason: 'rejected', status: response.status }
    const user = await response.json()
    return user.id
      ? { configured: true, authorized: true, reason: '' }
      : { configured: true, authorized: false, reason: 'rejected' }
  } catch {
    return { configured: true, authorized: false, reason: 'unreachable' }
  }
}
