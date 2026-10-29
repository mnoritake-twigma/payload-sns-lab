import { createHash } from 'node:crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'
import * as oidc from 'openid-client'
import type { Payload } from 'payload'
import { cookie, cookieValue, hash, sessionCookieName } from './session'
import { loginIdentity } from './identity'

export const flowCookieName = 'sns-oidc-flow'
export type FlowConfig = { issuer: string; clientId: string; appURL: string; redirectURI: string }
const encryptionKey = (secret: string) => createHash('sha256').update(`sns-oidc-flow:${secret}`).digest()
function redirect(url: string, cookies: string[] = []) {
  const headers = new Headers({ Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
  for (const value of cookies) headers.append('Set-Cookie', value)
  return new Response(null, { status: 303, headers })
}
export async function startLogin(request: Request, payload: Payload, config: FlowConfig, client: oidc.Configuration) {
  if (request.headers.get('origin') !== config.appURL) return new Response('Forbidden', { status: 403 })
  const state = oidc.randomState(), nonce = oidc.randomNonce(), verifier = oidc.randomPKCECodeVerifier()
  const sealed = await new EncryptJWT({ state, nonce, verifier, provider: config.issuer, clientId: config.clientId })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuedAt().setExpirationTime('10m').setIssuer(config.appURL).setAudience('sns-oidc-flow').encrypt(encryptionKey(payload.secret))
  const url = oidc.buildAuthorizationUrl(client, { redirect_uri: config.redirectURI, scope: 'openid profile', response_type: 'code', state, nonce, code_challenge_method: 'S256', code_challenge: await oidc.calculatePKCECodeChallenge(verifier) })
  // Expired consumed-flow markers and sessions contain no useful auth state.
  await payload.delete({ collection: 'oidc-flows', where: { expiresAt: { less_than: new Date().toISOString() } }, overrideAccess: true })
  await payload.delete({ collection: 'oidc-sessions', where: { expiresAt: { less_than: new Date().toISOString() } }, overrideAccess: true })
  return redirect(url.href, [cookie(flowCookieName, sealed, 600)])
}
export async function finishLogin(request: Request, payload: Payload, config: FlowConfig, client: oidc.Configuration) {
  const clear = cookie(flowCookieName, '', 0)
  try {
    const sealed = cookieValue(request.headers, flowCookieName)
    if (!sealed) throw new Error('Missing flow')
    const { payload: flow } = await jwtDecrypt(sealed, encryptionKey(payload.secret), { issuer: config.appURL, audience: 'sns-oidc-flow', maxTokenAge: '10m' })
    const incoming = new URL(request.url)
    if (typeof flow.state !== 'string' || incoming.searchParams.getAll('state').length !== 1 || incoming.searchParams.get('state') !== flow.state || flow.provider !== config.issuer || flow.clientId !== config.clientId || typeof flow.nonce !== 'string' || typeof flow.verifier !== 'string') throw new Error('Invalid flow')
    // Unique insert is atomic across requests/processes. A replay cannot exchange a code.
    await payload.create({ collection: 'oidc-flows', data: { stateHash: hash(flow.state), expiresAt: new Date(Number(flow.exp) * 1000).toISOString() }, overrideAccess: true })
    const callback = new URL(config.redirectURI); callback.search = incoming.search
    const tokens = await oidc.authorizationCodeGrant(client, callback, { expectedState: flow.state, expectedNonce: flow.nonce, pkceCodeVerifier: flow.verifier, idTokenExpected: true })
    const claims = tokens.claims()
    if (!claims?.sub || claims.iss !== config.issuer) throw new Error('Invalid identity')
    const { token } = await loginIdentity(payload, { issuer: config.issuer, subject: claims.sub, name: typeof claims.name === 'string' ? claims.name : undefined })
    // Okta ID/access tokens are intentionally not persisted or sent to the frontend.
    return redirect(config.appURL, [clear, cookie(sessionCookieName, token, 3600)])
  } catch {
    return redirect(`${config.appURL}/?auth_error=okta`, [clear])
  }
}
