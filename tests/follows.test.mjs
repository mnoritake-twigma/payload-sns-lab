import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
const env = parseEnv(await readFile(new URL('../apps/backend/.env', import.meta.url), 'utf8'))
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
async function api(path, method = 'GET', cookie = '', data) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
  return { status: r.status, data: await r.json(), headers: r.headers }
}
async function login(username) {
  const r = await api('/users/login', 'POST', '', { username, password: username === 'admin' ? env.SEED_ADMIN_PASSWORD : env.SEED_MEMBER_PASSWORD })
  assert.equal(r.status, 200)
  return { id: r.data.user.id, cookie: r.headers.getSetCookie().find(x => x.startsWith('payload-token=')).split(';')[0] }
}
const rejected = r => assert.ok([400, 401, 403, 404, 409].includes(r.status), `Expected controlled rejection, got ${r.status}: ${JSON.stringify(r.data)}`)

test('Follows: concurrent uniqueness, ownership, self-follow, missing target, unfollow and re-follow', async t => {
  const alice = await login('alice'), bob = await login('bob'), admin = await login('admin')
  const query = `/follows?where[follower][equals]=${alice.id}&where[following][equals]=${bob.id}&depth=1`
  let cleanup = false
  t.after(async () => {
    if (cleanup) {
      const rest = await api(query, 'GET', alice.cookie)
      for (const doc of rest.data.docs ?? []) await api(`/follows/${doc.id}`, 'DELETE', alice.cookie)
    }
    for (const u of [alice, bob, admin]) await api('/users/logout', 'POST', u.cookie, {})
  })
  const original = await api(query, 'GET', alice.cookie)
  assert.equal(original.status, 200)
  if (original.data.totalDocs > 0) { t.skip('alice → bob already exists; use a dedicated test DB or remove that relation before testing.'); return }
  cleanup = true
  rejected(await api('/follows'))
  rejected(await api('/follows', 'POST', '', { following: bob.id }))
  rejected(await api('/follows', 'POST', alice.cookie, { following: alice.id }))
  rejected(await api('/follows', 'POST', alice.cookie, { follower: bob.id, following: admin.id }))
  for (const following of [999999999, 0, -1, 'bad', null]) rejected(await api('/follows', 'POST', alice.cookie, { following }))
  const results = await Promise.all(Array.from({ length: 6 }, () => api('/follows', 'POST', alice.cookie, { following: bob.id })))
  assert.equal(results.filter(r => r.status === 201).length, 1)
  for (const r of results.filter(r => r.status !== 201)) rejected(r)
  const saved = await api(query, 'GET', alice.cookie)
  assert.equal(saved.data.totalDocs, 1)
  const relation = saved.data.docs[0]
  assert.equal(relation.follower.id, alice.id); assert.equal(relation.following.id, bob.id)
  for (const key of ['email', 'password', 'hash', 'salt']) assert.equal(relation.following[key], undefined)
  rejected(await api(`/follows/${relation.id}`, 'PATCH', alice.cookie, { following: admin.id }))
  rejected(await api(`/follows/${relation.id}`, 'DELETE', bob.cookie))
  rejected(await api(`/follows/${relation.id}`, 'DELETE', admin.cookie))
  const db = new DatabaseSync(fileURLToPath(new URL('../apps/backend/data/sns.db', import.meta.url)), { readOnly: true })
  try {
    assert.equal(db.prepare('SELECT count(*) AS n FROM follows WHERE follower_id=? AND following_id=?').get(alice.id, bob.id).n, 1)
    const indexes = db.prepare("PRAGMA index_list('follows')").all()
    assert.ok(indexes.some(i => i.unique === 1 && db.prepare(`PRAGMA index_info('${i.name}')`).all().map(c => c.name).join(',') === 'follower_id,following_id'))
  } finally { db.close() }
  assert.equal((await api(`/follows/${relation.id}`, 'DELETE', alice.cookie)).status, 200)
  assert.ok([403, 404].includes((await api(`/follows/${relation.id}`, 'DELETE', alice.cookie)).status))
  assert.equal((await api(query, 'GET', alice.cookie)).data.totalDocs, 0)
  assert.equal((await api('/follows', 'POST', alice.cookie, { following: bob.id })).status, 201)
  const profile = await api(`/users/${bob.id}`, 'GET', alice.cookie)
  assert.equal(profile.status, 200); assert.equal(profile.data.email, undefined)
  const fixturePosts = []
  t.after(async () => {
    // Login again because the session cleanup hook may already have run.
    for (const fixture of fixturePosts) {
      const owner = await login(fixture.username)
      await api(`/posts/${fixture.id}`, 'DELETE', owner.cookie)
      await api('/users/logout', 'POST', owner.cookie, {})
    }
  })
  for (const [username, owner] of [['alice', alice], ['bob', bob]]) {
    const created = await api('/posts', 'POST', owner.cookie, { body: 'Wave 3 author-filter test' })
    assert.equal(created.status, 201)
    fixturePosts.push({ username, id: created.data.doc.id })
  }
  const posts = await api(`/posts?where[author][equals]=${bob.id}`, 'GET', alice.cookie)
  assert.equal(posts.status, 200)
  assert.ok(posts.data.docs.some(p => p.id === fixturePosts.find(p => p.username === 'bob').id))
  assert.ok(!posts.data.docs.some(p => p.id === fixturePosts.find(p => p.username === 'alice').id))
  for (const post of posts.data.docs) assert.equal(typeof post.author === 'object' ? post.author.id : post.author, bob.id)
})
