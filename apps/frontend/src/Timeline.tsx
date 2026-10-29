import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, request, type User } from './api'

type Post = { id: number; body: string; author: User | number; createdAt: string }
type Page = { docs: Post[]; totalDocs: number; totalPages: number; page: number; hasNextPage: boolean }

export function Timeline({ user, onUnauthorized, authorId }: { user: User; onUnauthorized: () => void; authorId?: User['id'] }) {
  const [body, setBody] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const locked = useRef(false)
  const active = useRef(true)
  const unauthorized = useRef(onUnauthorized)
  unauthorized.current = onUnauthorized
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])

  function fail(e: unknown) {
    if (!active.current) return
    if (e instanceof ApiError && [401, 403].includes(e.status)) {
      setError('認証状態または操作権限を確認してください。')
      unauthorized.current()
    } else setError('操作を完了できませんでした。接続を確認して再試行してください。')
  }
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setResult(null)
    void request<Page>(`/api/posts?sort=-createdAt,-id&limit=20&page=${page}&depth=1${authorId ? `&where[author][equals]=${encodeURIComponent(authorId)}` : ''}`, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return
        if (page > Math.max(1, data.totalPages)) { setPage(Math.max(1, data.totalPages)); return }
        setResult(data)
      })
      .catch(e => { if (!controller.signal.aborted) fail(e) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, revision, authorId])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (locked.current || !body.trim() || body.length > 500) return
    locked.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await request('/api/posts', { method: 'POST', body: JSON.stringify({ body }) })
      if (!active.current) return
      setBody(''); setPage(1); setRevision(n => n + 1); setNotice('投稿しました。')
    } catch (e) { fail(e) }
    finally { locked.current = false; if (active.current) setBusy(false) }
  }
  async function remove(id: number) {
    if (locked.current) return
    locked.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await request(`/api/posts/${id}`, { method: 'DELETE' })
      if (!active.current) return
      setDeleting(null); setRevision(n => n + 1); setNotice('投稿を削除しました。')
    } catch (e) { fail(e) }
    finally { locked.current = false; if (active.current) setBusy(false) }
  }
  return <section className="mt-8 space-y-5" aria-label="投稿タイムライン">
    {!authorId && <form className="card space-y-4" onSubmit={submit}>
      <label htmlFor="post-body" className="block font-semibold">いま、共有したいこと</label>
      <textarea id="post-body" rows={4} maxLength={500} value={body} onChange={e => setBody(e.target.value)} disabled={busy} placeholder="学んだことや、気づいたことを書いてみましょう。" aria-describedby="post-count" />
      <div className="flex items-center justify-between gap-4"><span id="post-count" className="text-xs text-stone-500">{body.length} / 500文字</span><button className="primary" disabled={busy || !body.trim()}>{busy ? '処理中…' : '投稿する'}</button></div>
    </form>}
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}<button className="ml-3 underline" onClick={() => { setError(''); setRevision(n => n + 1) }}>一覧を再読込</button></div>}
    <div className="flex items-center justify-between"><h2 className="font-semibold">{authorId ? 'このユーザーの投稿' : 'みんなの投稿'}</h2><button className="text-xs underline disabled:opacity-50" disabled={loading || busy} onClick={() => { setError(''); setRevision(n => n + 1) }}>更新する</button></div>
    {loading ? <p role="status" className="card text-sm">投稿を読み込んでいます…</p> : result && <>
      {result.docs.length === 0 && <p className="card text-sm text-stone-500">{authorId ? 'このユーザーの投稿はまだありません。' : 'まだ投稿がありません。最初の投稿を書いてみましょう。'}</p>}
      {result.docs.map(post => {
        const author = typeof post.author === 'object' ? post.author : null
        const own = String(author?.id ?? post.author) === String(user.id)
        return <article className="card" key={post.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold">{author?.displayName ?? 'ユーザー'} <span className="font-normal text-stone-500">{author && `@${author.username}`}</span></h3><time className="text-xs text-stone-500" dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString('ja-JP')}</time></div>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">{post.body}</p>
          {own && <div className="mt-4 text-right text-xs">{deleting === post.id ? <div className="flex flex-wrap justify-end gap-3"><span>この投稿を削除しますか？</span><button className="text-red-700 underline" disabled={busy} onClick={() => void remove(post.id)}>削除する</button><button className="underline" disabled={busy} onClick={() => setDeleting(null)}>キャンセル</button></div> : <button className="text-stone-500 underline" disabled={busy} onClick={() => setDeleting(post.id)}>削除</button>}</div>}
        </article>
      })}
      <nav aria-label="投稿のページ" className="flex items-center justify-between text-sm">
        <button disabled={page <= 1 || busy} className="rounded-lg border px-4 py-2 disabled:opacity-30" onClick={() => { setDeleting(null); setPage(p => p - 1) }}>前へ</button>
        <span>{page} / {Math.max(1, result.totalPages)} ページ · {result.totalDocs}件</span>
        <button disabled={!result.hasNextPage || busy} className="rounded-lg border px-4 py-2 disabled:opacity-30" onClick={() => { setDeleting(null); setPage(p => p + 1) }}>次へ</button>
      </nav>
    </>}
  </section>
}
