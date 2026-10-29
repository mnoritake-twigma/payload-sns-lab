import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import * as oidc from 'openid-client'
import { generateKeyPair, exportJWK, SignJWT, EncryptJWT } from 'jose'
import { getPayload } from 'payload'
import { REST_GET, REST_POST, REST_DELETE } from '@payloadcms/next/routes'
import { startLogin, finishLogin, flowCookieName } from '../src/oidc/flow'
import { hash } from '../src/oidc/session'
import { loginIdentity } from '../src/oidc/identity'

// This isolated test fixture cannot be selected by the production HTTP routes.
const folder = await mkdtemp(path.join(tmpdir(), 'payload-oidc-'))
process.env.DATABASE_URL = `file:${folder}/test.db`
process.env.PAYLOAD_SECRET = randomBytes(32).toString('hex')
const { default: config } = await import('../src/payload.config')
const payload = await getPayload({ config })
const s = { issuer: 'https://idp.example.test', clientId: 'sns-test', appURL: 'http://127.0.0.1:5173', redirectURI: 'http://127.0.0.1:5173/api/oidc/callback' }
const keys = await generateKeyPair('RS256'), wrongKeys = await generateKeyPair('RS256')
const jwk = { ...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' }
const client = new oidc.Configuration({ issuer: s.issuer, authorization_endpoint: `${s.issuer}/authorize`, token_endpoint: `${s.issuer}/token`, jwks_uri: `${s.issuer}/jwks`, response_types_supported: ['code'], id_token_signing_alg_values_supported: ['RS256'] }, s.clientId, { client_secret: 'fixture-secret', id_token_signed_response_alg: 'RS256' }, oidc.ClientSecretBasic('fixture-secret'))
oidc.enableNonRepudiationChecks(client)
const codes = new Map<string, { nonce: string; challenge: string; mode: string; sub: string }>()
let exchanges = 0
client[oidc.customFetch] = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (url.pathname === '/jwks') return Response.json({ keys: [jwk] })
  assert.equal(url.pathname, '/token')
  exchanges++
  assert.equal(decodeURIComponent(Buffer.from(new Headers(options?.headers).get('authorization')!.slice(6), 'base64').toString()), 'sns-test:fixture-secret')
  const params = new URLSearchParams(String(options?.body))
  const code = params.get('code')!, entry = codes.get(code)
  codes.delete(code)
  if (!entry || await oidc.calculatePKCECodeChallenge(params.get('code_verifier') || '') !== entry.challenge) return Response.json({ error: 'invalid_grant' }, { status: 400 })
  const now = Math.floor(Date.now() / 1000)
  const idToken = await new SignJWT({ sub: entry.sub, name: 'Okta Test User', nonce: entry.mode === 'nonce' ? 'wrong' : entry.nonce, iss: entry.mode === 'issuer' ? 'https://wrong.example' : s.issuer, aud: entry.mode === 'audience' ? 'wrong-client' : s.clientId, iat: now, exp: entry.mode === 'expired' ? now - 120 : now + 300 })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(entry.mode === 'signature' ? wrongKeys.privateKey : keys.privateKey)
  return Response.json({ access_token: 'unused-fixture-token', token_type: 'Bearer', expires_in: 300, ...(entry.mode === 'missing-id-token' ? {} : { id_token: idToken }) })
}
async function begin(mode = 'valid', sub = 'test-subject') {
  const response = await startLogin(new Request(`${s.appURL}/api/oidc/login`, { method: 'POST', headers: { Origin: s.appURL } }), payload, s, client)
  assert.equal(response.status, 303)
  const url = new URL(response.headers.get('location')!)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('scope'), 'openid profile')
  const cookie = response.headers.getSetCookie()[0].split(';')[0]
  assert.match(response.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax/)
  const code = randomBytes(16).toString('hex')
  codes.set(code, { nonce: url.searchParams.get('nonce')!, challenge: mode === 'pkce' ? 'wrong' : url.searchParams.get('code_challenge')!, mode, sub })
  return { cookie, url: `${s.redirectURI}?code=${code}&state=${url.searchParams.get('state')}` }
}
const finish = (flow: { cookie: string; url: string }) => finishLogin(new Request(flow.url, { headers: { Cookie: flow.cookie } }), payload, s, client)
async function rest(endpoint: string, cookie = '', method: 'GET' | 'POST' | 'DELETE' = 'GET', data?: unknown, origin = s.appURL) {
  const handler = method === 'GET' ? REST_GET(config) : method === 'POST' ? REST_POST(config) : REST_DELETE(config)
  return handler(new Request(`${s.appURL}/api/${endpoint}`, { method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }), { params: Promise.resolve({ slug: endpoint.split('?')[0].split('/') }) })
}

test('OIDC flow and Payload integration (mock provider, isolated SQLite)', async t => {
  t.after(async () => { await payload.destroy(); await rm(folder, { recursive: true, force: true }) })
  await payload.db.migrate()
  await t.test('reject foreign login Origin', async () => {
    assert.equal((await startLogin(new Request(`${s.appURL}/api/oidc/login`, { method: 'POST', headers: { Origin: 'https://evil.example' } }), payload, s, client)).status, 403)
  })
  await t.test('state, cookie binding, tampering, expiry and cancellation', async () => {
    const a = await begin(), b = await begin()
    const invalid = [ { ...a, cookie: '' }, { ...a, cookie: b.cookie }, { ...a, cookie: `${flowCookieName}=tampered` }, { ...a, url: a.url.replace(/state=[^&]+/, 'state=wrong') }, { ...a, url: a.url + '&state=duplicate' }, { ...a, url: a.url.replace(/code=[^&]+/, 'error=access_denied') } ]
    for (const f of invalid) assert.equal((await finish(f)).headers.get('location'), `${s.appURL}/?auth_error=okta`)
    const expired = await new EncryptJWT({ state: 'expired' }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuer(s.appURL).setAudience('sns-oidc-flow').setIssuedAt(Math.floor(Date.now()/1000)-1000).setExpirationTime(Math.floor(Date.now()/1000)-400).encrypt(createHash('sha256').update(`sns-oidc-flow:${payload.secret}`).digest())
    assert.equal((await finish({ cookie: `${flowCookieName}=${expired}`, url: `${s.redirectURI}?state=expired&code=x` })).headers.get('location'), `${s.appURL}/?auth_error=okta`)
  })
  await t.test('ID token signature, issuer, audience, expiry, nonce and PKCE', async () => {
    for (const mode of ['signature','issuer','audience','expired','nonce','pkce','missing-id-token']) {
      const response = await finish(await begin(mode))
      assert.equal(response.headers.get('location'), `${s.appURL}/?auth_error=okta`, mode)
      assert.ok(!response.headers.getSetCookie().some(c => c.startsWith('payload-token=')))
    }
  })
  let session = '', userId = 0
  await t.test('valid callback, replay prevention, me, private collections and common permissions', async () => {
    const flow = await begin()
    const before = exchanges
    const results = await Promise.all([finish(flow), finish(flow)])
    const success = results.filter(r => r.headers.get('location') === s.appURL)
    assert.equal(success.length, 1); assert.equal(exchanges - before, 1)
    session = success[0].headers.getSetCookie().find(c => c.startsWith('payload-token='))!.split(';')[0]
    const me = await rest('users/me', session)
    assert.equal(me.status, 200)
    const data = await me.json(); userId = data.user.id
    assert.equal(data.user.authProvider, 'okta'); assert.equal(data.user.role, 'member'); assert.equal(data.token, undefined)
    assert.ok(data.exp > Date.now()/1000 && data.exp <= Date.now()/1000+3601)
    for (const slug of ['auth-identities','oidc-sessions','oidc-flows']) {
      assert.equal((await rest(slug, session)).status, 403)
      assert.equal((await rest(slug, session, 'POST', {})).status, 403)
    }
    assert.equal((await rest('posts', session, 'GET', undefined, 'https://evil.example')).status, 403)
    const post = await rest('posts', session, 'POST', { body: 'Okta session post' })
    assert.equal(post.status, 201)
    const postId = (await post.json()).doc.id
    assert.equal((await rest(`posts/${postId}`, session, 'DELETE')).status, 200)
    const other = await loginIdentity(payload, { issuer: s.issuer, subject: 'other-subject' })
    assert.equal((await rest('follows', session, 'POST', { following: userId })).status, 400)
    const follow = await rest('follows', session, 'POST', { following: other.userId })
    assert.equal(follow.status, 201)
    const followId = (await follow.json()).doc.id
    assert.ok([403,404].includes((await rest(`follows/${followId}`, `payload-token=${other.token}`, 'DELETE')).status))
    assert.equal((await rest(`follows/${followId}`, session, 'DELETE')).status, 200)
    assert.equal(Boolean((await (await rest('access', session)).json()).canAccessAdmin), false)
    assert.equal((await rest('users/refresh-token', session, 'POST', {})).status, 403)
    const knownPassword = randomBytes(24).toString('hex')
    const reset = await payload.update({ collection: 'users', id: userId, data: { password: knownPassword }, overrideAccess: true })
    assert.equal((await rest('users/login', '', 'POST', { username: reset.username, password: knownPassword })).status, 401)
  })
  await t.test('same identity resolves once, including concurrent first login', async () => {
    const again = await finish(await begin())
    const cookie = again.headers.getSetCookie().find(c => c.startsWith('payload-token='))!.split(';')[0]
    assert.equal((await (await rest('users/me', cookie)).json()).user.id, userId)
    const concurrent = await Promise.all([loginIdentity(payload, { issuer: s.issuer, subject: 'concurrent' }), loginIdentity(payload, { issuer: s.issuer, subject: 'concurrent' })])
    assert.equal(concurrent[0].userId, concurrent[1].userId)
    const identities = await payload.find({ collection: 'auth-identities', where: { subject: { equals: 'concurrent' } }, overrideAccess: true })
    assert.equal(identities.totalDocs, 1)
    const users = await payload.find({ collection: 'users', overrideAccess: true })
    assert.equal(users.totalDocs, 3) // primary, other and concurrent; no orphan on conflict
  })
  await t.test('expiry, tampering and logout revoke protected access', async () => {
    const token = session.slice('payload-token='.length)
    const row = (await payload.find({ collection: 'oidc-sessions', where: { tokenHash: { equals: hash(token) } }, overrideAccess: true })).docs[0]
    assert.equal(row.tokenHash.includes(token), false)
    await payload.update({ collection: 'oidc-sessions', id: row.id, data: { expiresAt: new Date(Date.now()-1000).toISOString() }, overrideAccess: true })
    assert.equal((await (await rest('users/me', session)).json()).user, null)
    assert.equal((await rest('posts', session)).status, 403)
    const valid = await finish(await begin())
    session = valid.headers.getSetCookie().find(c => c.startsWith('payload-token='))!.split(';')[0]
    assert.equal((await rest('posts', session+'x')).status, 403)
    assert.equal((await rest('users/logout', session, 'POST', {})).status, 200)
    assert.equal((await (await rest('users/me', session)).json()).user, null)
    assert.equal((await rest('posts', session)).status, 403)
  })
})
