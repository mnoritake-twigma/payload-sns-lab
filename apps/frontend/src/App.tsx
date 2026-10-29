import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { People } from './People'
import { Timeline } from './Timeline'
import { auth, ApiError, type Trace, type User } from './api'

function Flow() {
  return <div className="space-y-3" aria-label="アプリの構成">
    {[
      ['01', 'ブラウザー', 'React · Vite · Tailwind CSS'],
      ['02', 'バックエンド', 'Payload · Next.js · REST API'],
      ['03', 'データベース', 'SQLite · ローカルファイル'],
    ].map(([n, name, detail], i) => <div key={n}>
      {i > 0 && <div className="ml-6 py-1 text-stone-400" aria-hidden="true">↓</div>}
      <div className="flex items-center gap-4 rounded-xl border border-stone-200 bg-white p-4">
        <span className="mono text-xs text-stone-400">{n}</span>
        <div><p className="text-sm font-semibold">{name}</p><p className="mt-1 text-xs text-stone-500">{detail}</p></div>
      </div>
    </div>)}
  </div>
}

export function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [socialView, setSocialView] = useState<'posts' | 'people'>('posts')
  const [view, setView] = useState<'account' | 'architecture'>('account')
  const [traces, setTraces] = useState<Trace[]>([])
  const authGeneration = useRef(0)

  useEffect(() => {
    function trace(event: Event) { setTraces(prev => [(event as CustomEvent<Trace>).detail, ...prev].slice(0, 5)) }
    window.addEventListener('api-trace', trace)
    return () => window.removeEventListener('api-trace', trace)
  }, [])

  async function restore(signal?: AbortSignal) {
    const generation = authGeneration.current
    try {
      const result = await auth.me(signal)
      if (signal?.aborted || generation !== authGeneration.current) return
      if (user && !result.user) setNotice('セッションが終了しました。もう一度ログインしてください。')
      setUser(result.user)
      setError('')
    } catch (e) {
      if (signal?.aborted || generation !== authGeneration.current) return
      setError('バックエンドに接続できません。起動状態を確認して、再接続してください。')
    } finally { if (!signal?.aborted && generation === authGeneration.current) setChecking(false) }
  }

  useEffect(() => {
    const controller = new AbortController()
    void restore(controller.signal)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    const refresh = () => { if (document.visibilityState === 'visible') void restore(controller.signal) }
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [user?.id])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    authGeneration.current += 1
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await auth.login(username, password)
      setUser(result.user); setPassword(''); setView('account'); setSocialView('posts')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'バックエンドに接続できません。接続を確認してください。')
    } finally { setBusy(false) }
  }

  async function logout() {
    authGeneration.current += 1
    setBusy(true); setError('')
    try {
      await auth.logout()
      setUser(null); setPassword(''); setNotice('ログアウトしました。')
    } catch { setError('ログアウトできませんでした。接続を確認して、もう一度お試しください。') }
    finally { setBusy(false) }
  }

  return <div className="min-h-screen">
    <header className="border-b border-stone-200 bg-white/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 sm:px-10">
        <a href="/" className="flex items-center gap-3 font-semibold tracking-tight"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-950 font-mono text-lg text-lime-200">p</span>Payload <span className="font-normal text-stone-500">SNS Lab</span></a>
        <span className="mono rounded-full border border-stone-200 px-3 py-1.5 text-[10px] tracking-widest text-stone-500">WAVE 03 / FOLLOWS</span>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10 sm:py-16">
      <div className="mb-10 flex items-center gap-2 text-xs text-stone-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />学びながらつくる、小さなSNS</div>
      <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
        <section>
          <p className="mono mb-4 text-xs tracking-[.2em] text-emerald-800">{user ? 'YOUR ACCOUNT' : 'WELCOME TO THE LAB'}</p>
          <h1 className="text-3xl font-semibold leading-snug tracking-tight sm:text-4xl">{user ? `${user.displayName}さん、こんにちは。` : <>つながりの、<br />最初の一歩。</>}</h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-stone-500">{user ? 'Payloadが認証したアカウントです。再読込しても、Cookieを使ってログイン状態を確認できます。' : 'まずはログインから。アカウントの認証を通して、画面とバックエンドがつながる仕組みを確かめましょう。'}</p>
          <div className="mt-8" aria-live="polite">
            {notice && <p role="status" className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
            {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button className="mt-2 block underline" onClick={() => { setChecking(true); void restore() }}>再接続する</button></div>}
          </div>
          {checking ? <div className="card mt-8" role="status">ログイン状態を確認しています…</div> : !user ?
            <form onSubmit={login} className="card mt-6 space-y-5">
              <h2 className="text-base font-semibold">アカウントにログイン</h2>
              <div><label htmlFor="username" className="mb-2 block text-xs font-semibold">ユーザー名</label><input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e => setUsername(e.target.value)} required maxLength={32} placeholder="alice" /></div>
              <div><label htmlFor="password" className="mb-2 block text-xs font-semibold">パスワード</label><input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
              <button className="primary w-full" type="submit" disabled={busy}>{busy ? 'ログインしています…' : 'ログインする　→'}</button>
              <p className="text-xs leading-6 text-stone-500">検証用のアカウントを使用してください。<br />OktaログインはWave 4で追加します。</p>
            </form> : <div className="card mt-6">
              <nav className="mb-7 flex gap-5 border-b border-stone-200" aria-label="アカウント情報">
                <button className={`tab ${view === 'account' ? 'selected' : ''}`} aria-pressed={view === 'account'} onClick={() => setView('account')}>アカウント</button>
                <button className={`tab ${view === 'architecture' ? 'selected' : ''}`} aria-pressed={view === 'architecture'} onClick={() => setView('architecture')}>接続のしくみ</button>
              </nav>
              {view === 'account' ? <>
                <div className="mb-6 flex items-center gap-4"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-lg font-semibold text-emerald-900">{user.displayName.slice(0,1)}</span><div><h2 className="font-semibold">{user.displayName}</h2><p className="mono mt-1 text-xs text-stone-500">@{user.username}</p></div><span className="ml-auto rounded-full bg-stone-100 px-3 py-1 text-xs">{user.role === 'admin' ? '管理者' : '一般ユーザー'}</span></div>
                <dl className="space-y-4 text-sm"><div className="flex justify-between"><dt className="text-stone-500">ログイン方法</dt><dd>ユーザー名・パスワード</dd></div><div className="flex justify-between"><dt className="text-stone-500">セッション</dt><dd className="text-emerald-800">認証済み</dd></div><div className="flex justify-between"><dt className="text-stone-500">有効期限</dt><dd>ログインから1時間</dd></div></dl>
                {user.role === 'admin' && <a className="mt-6 block text-sm text-emerald-800 underline underline-offset-4" href={`${window.location.protocol}//${window.location.hostname}:4310/admin`} target="_blank" rel="noreferrer">Payload管理画面を開く ↗</a>}
              </> : <div className="space-y-4 text-sm leading-7 text-stone-600"><p>画面が <code>POST /api/users/login</code> を呼び出すと、Payloadがパスワードを検証し、HttpOnly Cookieを発行します。</p><p>再読込時は <code>GET /api/users/me</code> で現在のユーザーを取得します。Reactはパスワードやトークンを保存しません。</p><p>ログアウト時はPayloadにセッションの終了を依頼します。DB操作と権限の判定はバックエンドで行います。</p></div>}
              <button className="mt-8 w-full rounded-lg border border-stone-300 px-4 py-3 text-sm hover:bg-stone-50 disabled:opacity-50" onClick={() => void logout()} disabled={busy}>{busy ? 'ログアウトしています…' : 'ログアウト'}</button>
            </div>}
          {user && !checking && <>
            <nav className="mt-8 flex gap-6 border-b border-stone-200" aria-label="SNSメニュー"><button className={`tab ${socialView === 'posts' ? 'selected' : ''}`} onClick={() => setSocialView('posts')}>投稿</button><button className={`tab ${socialView === 'people' ? 'selected' : ''}`} onClick={() => setSocialView('people')}>ユーザー・フォロー</button></nav>
            {socialView === 'posts' ? <Timeline key={user.id} user={user} onUnauthorized={() => void restore()} /> : <People key={user.id} user={user} onUnauthorized={() => void restore()} />}
          </>}
        </section>
        <aside className="lg:pt-3">
          <div className="mb-5 flex items-center justify-between"><h2 className="text-sm font-semibold">このアプリの構成</h2><span className="mono text-[10px] tracking-widest text-stone-400">ARCHITECTURE</span></div>
          <Flow />
          <div className="mt-8 rounded-xl bg-emerald-950 p-6 text-white"><p className="mono mb-3 text-[10px] tracking-widest text-lime-200">WAVE 03</p><h2 className="text-base font-semibold">いま確かめること</h2><p className="mt-3 text-sm leading-7 text-emerald-100/80">ユーザーを探して、フォローと解除。2人の関連をSQLiteに保存し、重複はDBの一意制約で防ぎます。OktaログインはWave 4で追加します。</p></div>
        </aside>
      </div>
      <section className="mt-14 border-t border-stone-200 pt-6" aria-label="API通信履歴">
        <div className="flex items-center justify-between"><h2 className="text-xs font-semibold text-stone-600">APIとのやりとり</h2><span className="text-[10px] text-stone-400">パスワード・Cookieは表示しません</span></div>
        <div className="mono mt-4 space-y-2 text-[11px] text-stone-500">{traces.length ? traces.map((t, i) => <div key={`${t.at}-${i}`} className="flex flex-wrap gap-x-4 gap-y-1"><span className="text-stone-400">{t.at}</span><span>{t.method}</span><span>{t.path}</span><span className={t.status < 400 ? 'text-emerald-700' : 'text-red-700'}>{t.status}</span></div>) : <p>通信すると、ここに履歴が表示されます。</p>}</div>
      </section>
      <footer className="mt-10 flex justify-between text-[10px] text-stone-400"><span>Payload SNS Lab</span><span>React + Payload + SQLite</span></footer>
    </main>
  </div>
}
