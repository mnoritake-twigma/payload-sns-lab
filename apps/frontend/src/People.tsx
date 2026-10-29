import { useEffect, useRef, useState } from 'react'
import { ApiError, request, type User } from './api'
import { Timeline } from './Timeline'

type Follow = { id: number; follower: User | number; following: User | number }
type Page<T> = { docs: T[]; totalDocs: number; totalPages: number; hasNextPage: boolean }
const idOf = (value: User | number) => typeof value === 'object' ? value.id : value

export function People({ user, onUnauthorized }: { user: User; onUnauthorized: () => void }) {
  const [mode, setMode] = useState<'all' | 'following'>('all')
  const [selected, setSelected] = useState<User['id'] | null>(null)
  return <section className="mt-8" aria-label="ユーザーとフォロー">
    <nav className="mb-5 flex gap-5" aria-label="ユーザー一覧の種類">
      <button className={`tab ${mode === 'all' && !selected ? 'selected' : ''}`} onClick={() => { setSelected(null); setMode('all') }}>ユーザー一覧</button>
      <button className={`tab ${mode === 'following' && !selected ? 'selected' : ''}`} onClick={() => { setSelected(null); setMode('following') }}>自分のフォロー中</button>
    </nav>
    {selected && <button className="mb-5 text-sm underline" onClick={() => setSelected(null)}>← 一覧へ戻る</button>}
    <PeopleView key={`${mode}-${selected}`} user={user} mode={mode} selected={selected} onSelect={setSelected} onUnauthorized={onUnauthorized} />
  </section>
}

function PeopleView({ user, mode, selected, onSelect, onUnauthorized }: {
  user: User; mode: 'all' | 'following'; selected: User['id'] | null; onSelect: (id: User['id']) => void; onUnauthorized: () => void
}) {
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [people, setPeople] = useState<User[]>([])
  const [relations, setRelations] = useState<Follow[]>([])
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const active = useRef(true), locked = useRef(false)
  const unauthorized = useRef(onUnauthorized); unauthorized.current = onUnauthorized
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const ownFilter = `where[follower][equals]=${encodeURIComponent(user.id)}`

  function fail(e: unknown) {
    if (!active.current) return
    if (e instanceof ApiError && [401, 403].includes(e.status)) unauthorized.current()
    setError(e instanceof ApiError && e.status === 404 ? '対象が見つかりません。一覧を更新してください。' : '操作を完了できませんでした。接続と現在の状態を確認して再試行してください。')
  }
  useEffect(() => {
    const controller = new AbortController(), options = { signal: controller.signal }
    setLoading(true); setPeople([]); setRelations([])
    void (async () => {
      let users: User[], follows: Follow[], count: number, pageCount: number
      if (!selected && mode === 'following') {
        const result = await request<Page<Follow>>(`/api/follows?${ownFilter}&sort=-createdAt,-id&limit=20&page=${page}&depth=1`, options)
        follows = result.docs
        users = follows.flatMap(f => typeof f.following === 'object' ? [f.following] : [])
        count = result.totalDocs; pageCount = result.totalPages
      } else {
        const result = selected
          ? { docs: [await request<User>(`/api/users/${encodeURIComponent(selected)}`, options)], totalDocs: 1, totalPages: 1 }
          : await request<Page<User>>(`/api/users?sort=username&limit=20&page=${page}&depth=0`, options)
        users = result.docs; count = result.totalDocs; pageCount = result.totalPages
        follows = users.length ? (await request<Page<Follow>>(`/api/follows?${ownFilter}&where[following][in]=${users.map(u => encodeURIComponent(u.id)).join(',')}&limit=20&depth=0`, options)).docs : []
      }
      if (controller.signal.aborted) return
      if (page > Math.max(1, pageCount)) { setPage(Math.max(1, pageCount)); return }
      setPeople(users); setRelations(follows); setTotal(count); setPages(Math.max(1, pageCount))
    })().catch(e => { if (!controller.signal.aborted) fail(e) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, revision, selected, mode, user.id])

  async function toggle(target: User, relation?: Follow) {
    if (locked.current) return
    locked.current = true; setBusy(true); setError(''); setNotice('')
    try {
      if (relation) await request(`/api/follows/${relation.id}`, { method: 'DELETE' })
      else await request('/api/follows', { method: 'POST', body: JSON.stringify({ following: target.id }) })
      if (active.current) setNotice(relation ? `${target.displayName}さんのフォローを解除しました。` : `${target.displayName}さんをフォローしました。`)
    } catch (e) {
      // Other tabs may already have changed this relation. Re-read authoritative state.
      if (active.current && e instanceof ApiError && [400, 404, 409].includes(e.status)) setNotice('関係が変更された可能性があります。最新の状態を読み直しました。')
      else fail(e)
    } finally {
      locked.current = false
      if (active.current) { setBusy(false); setRevision(n => n + 1) }
    }
  }
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><h2 className="font-semibold">{selected ? 'ユーザー詳細' : mode === 'all' ? 'ユーザー一覧' : '自分のフォロー中'}</h2><button className="text-xs underline" disabled={loading || busy} onClick={() => { setError(''); setRevision(n => n + 1) }}>一覧を更新</button></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {loading ? <p role="status" className="card text-sm">ユーザーを読み込んでいます…</p> : <>
      {!people.length && !error && <p className="card text-sm text-stone-500">{mode === 'following' ? 'まだ誰もフォローしていません。ユーザー一覧から探してみましょう。' : 'ユーザーが見つかりません。'}</p>}
      {people.map(person => {
        const relation = relations.find(f => String(idOf(f.following)) === String(person.id))
        const self = String(person.id) === String(user.id)
        return <article className="card" key={person.id}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h3 className="font-semibold">{person.displayName}</h3><p className="mt-1 text-xs text-stone-500">@{person.username}{self ? ' · あなた' : ''}</p></div>
            {!self && <button className={relation ? 'rounded-lg border border-stone-300 px-4 py-3 text-sm' : 'primary'} disabled={busy} aria-label={`${person.displayName}を${relation ? 'フォロー解除' : 'フォロー'}`} onClick={() => void toggle(person, relation)}>{busy ? '処理中…' : relation ? 'フォロー解除' : 'フォローする'}</button>}
          </div>
          {!selected && <button className="mt-4 text-xs text-emerald-800 underline" disabled={busy} onClick={() => onSelect(person.id)} aria-label={`${person.displayName}の詳細と投稿を見る`}>詳細と投稿を見る →</button>}
        </article>
      })}
      {!selected && total > 0 && <nav className="flex items-center justify-between text-sm" aria-label="ユーザーのページ"><button disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-4 py-2 disabled:opacity-30">前へ</button><span>{page} / {pages} ページ · {total}人</span><button disabled={page >= pages || busy} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-4 py-2 disabled:opacity-30">次へ</button></nav>}
      {selected && people.length > 0 && <Timeline key={selected} user={user} authorId={selected} onUnauthorized={onUnauthorized} />}
    </>}
  </div>
}
