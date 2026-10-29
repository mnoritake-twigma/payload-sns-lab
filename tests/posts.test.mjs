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
  const r = await api('/users/login', 'POST', '', { username, password: env.SEED_MEMBER_PASSWORD })
  assert.equal(r.status, 200)
  return { id: r.data.user.id, cookie: r.headers.getSetCookie().find(x => x.startsWith('payload-token=')).split(';')[0] }
}
const rejected = r => assert.ok([400, 401, 403, 404].includes(r.status), `Expected rejection, got ${r.status}`)

test('Posts: validation, ownership, pagination, relationship privacy and SQLite persistence', async t => {
  const alice = await login('alice'), bob = await login('bob')
  const ids = []
  t.after(async () => {
    for (const id of ids) await api(`/posts/${id}`, 'DELETE', alice.cookie)
    for (const u of [alice, bob]) await api('/users/logout', 'POST', u.cookie, {})
  })
  rejected(await api('/posts'))
  rejected(await api('/posts', 'POST', '', { body: 'anonymous' }))
  for (const body of ['', ' \n\t', 'a'.repeat(501), '😀'.repeat(251)]) rejected(await api('/posts', 'POST', alice.cookie, { body }))
  rejected(await api('/posts', 'POST', alice.cookie, { body: 'forged', author: bob.id }))
  const marker = `wave2-${Date.now()}`
  for (let i = 0; i < 21; i++) {
    const body = i === 0 ? '😀'.repeat(250) : `${marker}-${i} <script>alert('x')</script>\n改行を保持`
    const r = await api('/posts', 'POST', alice.cookie, { body, createdAt: '2000-01-01T00:00:00Z' })
    assert.equal(r.status, 201, JSON.stringify(r.data))
    ids.push(r.data.doc.id)
    assert.equal(r.data.doc.body, body)
    assert.equal(typeof r.data.doc.author === 'object' ? r.data.doc.author.id : r.data.doc.author, alice.id)
    assert.notEqual(r.data.doc.createdAt, '2000-01-01T00:00:00Z')
  }
  const query = `/posts?where[id][in]=${ids.join(',')}&sort=-createdAt,-id&limit=20&depth=1`
  const first = await api(query, 'GET', bob.cookie), second = await api(`${query}&page=2`, 'GET', bob.cookie)
  assert.equal(first.status, 200); assert.equal(first.data.totalDocs, 21)
  assert.equal(first.data.docs.length, 20); assert.equal(second.data.docs.length, 1)
  assert.equal(first.data.hasNextPage, true)
  assert.deepEqual([...first.data.docs, ...second.data.docs].map(p => p.id), [...ids].reverse())
  for (const p of first.data.docs) {
    assert.equal(p.author.username, 'alice')
    for (const field of ['email', 'password', 'hash', 'salt']) assert.equal(p.author[field], undefined)
  }
  rejected(await api(`/posts/${ids[0]}`, 'DELETE', bob.cookie))
  rejected(await api(`/posts/${ids[0]}`, 'PATCH', alice.cookie, { body: 'edited', author: bob.id }))
  rejected(await api(`/posts/${ids[0]}`, 'GET'))
  const db = new DatabaseSync(fileURLToPath(new URL('../apps/backend/data/sns.db', import.meta.url)), { readOnly: true })
  try {
    const row = db.prepare('SELECT body, author_id FROM posts WHERE id = ?').get(ids[0])
    assert.equal(row.body, '😀'.repeat(250)); assert.equal(row.author_id, alice.id)
  } finally { db.close() }
  assert.equal((await api(`/posts/${ids[0]}`, 'DELETE', alice.cookie)).status, 200)
  assert.equal((await api(`/posts/${ids[0]}`, 'GET', bob.cookie)).status, 404)
  ids.shift()
})
