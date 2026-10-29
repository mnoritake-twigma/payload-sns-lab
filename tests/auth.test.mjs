import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const env = parseEnv(await readFile(new URL('../apps/backend/.env', import.meta.url), 'utf8'))
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
async function api(path, { method = 'GET', cookie = '', data, origin } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', Origin: origin || base, ...(cookie ? { Cookie: cookie } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  })
  return { status: response.status, body: await response.json(), headers: response.headers }
}
const denied = result => assert.ok([401, 403].includes(result.status), `Expected denial, got ${result.status}`)

test('SQLite persists users with password hashes and no plaintext passwords', () => {
  const db = new DatabaseSync(fileURLToPath(new URL('../apps/backend/data/sns.db', import.meta.url)), { readOnly: true })
  try {
    const rows = db.prepare('SELECT username, password IS NOT NULL AS plaintext, length(hash) > 0 AS hashed FROM users').all()
    assert.ok(rows.length >= 3)
    for (const row of rows) {
      assert.equal(row.plaintext, 0)
      assert.equal(row.hashed, 1)
    }
  } finally { db.close() }
})

test('Payload REST auth, sessions, access and private fields through Vite proxy', async t => {
  const anonymous = await api('/users/me')
  assert.equal(anonymous.body.user, null)
  denied(await api('/users'))
  denied(await api('/users', { method: 'POST', data: { username: 'intruder', displayName: 'Intruder', role: 'admin', password: 'Unauthorized12345' } }))
  const wrong = await api('/users/login', { method: 'POST', data: { username: 'alice', password: 'wrong-password' } })
  assert.equal(wrong.status, 401)

  const login = async (username, password) => {
    const result = await api('/users/login', { method: 'POST', data: { username, password } })
    assert.equal(result.status, 200)
    assert.equal(result.body.token, undefined)
    const header = result.headers.getSetCookie().find(value => value.startsWith('payload-token='))
    assert.ok(header && /httponly/i.test(header))
    assert.match(header, /samesite=lax/i)
    return { ...result, cookie: header.split(';')[0] }
  }
  const alice = await login('alice', env.SEED_MEMBER_PASSWORD)
  const admin = await login('admin', env.SEED_ADMIN_PASSWORD)
  const aliceId = alice.body.user.id
  t.after(async () => {
    // Preserve the seeded role even if a regression permitted the attack below.
    await api(`/users/${aliceId}`, { method: 'PATCH', cookie: admin.cookie, data: { role: 'member' } })
    await api('/users/logout', { method: 'POST', cookie: admin.cookie, data: {} })
  })

  const me = await api('/users/me', { cookie: alice.cookie })
  assert.equal(me.body.user.username, 'alice')
  assert.equal(me.body.user.role, 'member')
  const users = await api('/users', { cookie: alice.cookie })
  assert.equal(users.status, 200)
  assert.equal(users.body.docs.length, 3)
  for (const user of users.body.docs) {
    assert.equal(user.password, undefined)
    assert.equal(user.hash, undefined)
    assert.equal(user.salt, undefined)
    if (user.username !== 'alice') assert.equal(user.email, undefined)
  }
  assert.equal(Boolean((await api('/access', { cookie: alice.cookie })).body.canAccessAdmin), false)
  assert.equal((await api('/access', { cookie: admin.cookie })).body.canAccessAdmin, true)
  denied(await api(`/users/${aliceId}`, { method: 'PATCH', cookie: alice.cookie, data: { role: 'admin' } }))
  denied(await api('/users', { method: 'POST', cookie: alice.cookie, data: { username: 'intruder', displayName: 'Intruder', role: 'admin', password: 'Unauthorized12345' } }))
  denied(await api('/users', { cookie: alice.cookie, origin: 'https://untrusted.example' }))
  const duplicate = await api('/users', { method: 'POST', cookie: admin.cookie, data: { username: 'alice', displayName: 'Duplicate', role: 'member', password: 'DuplicatePassword123' } })
  assert.ok([400, 409].includes(duplicate.status))
  const logout = await api('/users/logout', { method: 'POST', cookie: alice.cookie, data: {} })
  assert.equal(logout.status, 200)
  assert.equal((await api('/users/me', { cookie: alice.cookie })).body.user, null)
  denied(await api('/users', { cookie: alice.cookie }))
  console.log('Verified anonymous denial, credentials, HttpOnly cookie, me restore, private fields, role/admin access, CSRF, unique username, logout and stale cookie rejection.')
})
