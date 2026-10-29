export type User = { id: number | string; username: string; displayName: string; role: 'member' | 'admin'; authProvider?: 'local' | 'okta' }
export type Trace = { method: string; path: string; status: number; at: string }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options, credentials: 'include', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  // Only record route and status. Passwords, cookies and response data are never logged.
  window.dispatchEvent(new CustomEvent<Trace>('api-trace', { detail: {
    method: options.method || 'GET', path, status: response.status,
    at: new Date().toLocaleTimeString('ja-JP', { hour12: false }),
  } }))
  if (!response.ok) throw new ApiError(response.status,
    response.status === 401 ? 'ユーザー名またはパスワードを確認してください。' : '操作を完了できませんでした。もう一度お試しください。')
  return response.json() as Promise<T>
}

export const auth = {
  me: (signal?: AbortSignal) => request<{ user: User | null }>('/api/users/me', { signal }),
  login: (username: string, password: string) => request<{ user: User }>('/api/users/login', {
    method: 'POST', body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
  }),
  logout: () => request('/api/users/logout', { method: 'POST', body: '{}' }),
}
