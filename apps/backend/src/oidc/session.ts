import { createHash, randomBytes } from 'node:crypto'
import type { AuthStrategy, CollectionAfterLogoutHook, CollectionMeHook, Payload, PayloadRequest } from 'payload'

export const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export const sessionCookieName = 'payload-token'
export function cookieValue(headers: Headers, name: string) {
  return (headers.get('cookie') || '').split(';').map(p => p.trim()).find(p => p.startsWith(`${name}=`))?.slice(name.length + 1)
}
export function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}
export function trustedRequest(headers: Headers, csrf: string[]) {
  const origin = headers.get('origin')
  return origin ? csrf.includes(origin) : ['same-origin', 'same-site', 'none'].includes(headers.get('sec-fetch-site') || '')
}
export const oktaStrategy: AuthStrategy = {
  name: 'okta-session',
  authenticate: async ({ headers, payload, req }) => {
    const token = cookieValue(headers, sessionCookieName)
    if (!token?.startsWith('oidc_') || !/^oidc_[A-Za-z0-9_-]{43}$/.test(token) || !trustedRequest(headers, payload.config.csrf)) return { user: null }
    const sessions = await payload.find({ collection: 'oidc-sessions', where: { and: [{ tokenHash: { equals: hash(token) } }, { expiresAt: { greater_than: new Date().toISOString() } }] }, depth: 0, limit: 1, overrideAccess: true, req })
    const session = sessions.docs[0]
    if (!session) return { user: null }
    const id = typeof session.user === 'object' ? session.user.id : session.user
    const user = await payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true, req })
    if (user.authProvider !== 'okta') return { user: null }
    if (req) req.context.oidcExpiresAt = Math.floor(new Date(session.expiresAt).getTime() / 1000)
    return { user: { ...user, collection: 'users' as const, _strategy: 'okta-session' } }
  },
}
export async function issueSession(payload: Payload, user: number, req: PayloadRequest) {
  const token = `oidc_${randomBytes(32).toString('base64url')}`
  await payload.create({ collection: 'oidc-sessions', data: { user, tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600_000).toISOString() }, overrideAccess: true, req })
  return token
}
export const oidcMe: CollectionMeHook = async ({ args, user }) => {
  if (args.req.user?.authProvider !== 'okta') return
  // Avoid the standard me operation attempting to decode the opaque cookie as JWT.
  return { user, exp: Number(args.req.context.oidcExpiresAt) }
}
export const oidcLogout: CollectionAfterLogoutHook = async ({ req }) => {
  if (req.user?.authProvider !== 'okta') return
  const token = cookieValue(req.headers, sessionCookieName)
  const all = req.searchParams?.get('allSessions') === 'true'
  await req.payload.delete({ collection: 'oidc-sessions', where: all ? { user: { equals: req.user.id } } : { tokenHash: { equals: hash(token || '') } }, overrideAccess: true, req })
}
