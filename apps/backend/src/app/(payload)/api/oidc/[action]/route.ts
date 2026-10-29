import { getPayload } from 'payload'
import config from '../../../../../payload.config'
import { provider, settings } from '../../../../../oidc/provider'
import { finishLogin, startLogin } from '../../../../../oidc/flow'
export const runtime = 'nodejs'
type Context = { params: Promise<{ action: string }> }
export async function GET(request: Request, { params }: Context) {
  const { action } = await params
  try {
    const s = settings()
    if (action === 'status') return Response.json({ enabled: Boolean(s) }, { headers: { 'Cache-Control': 'no-store' } })
    if (action !== 'callback') return new Response('Not found', { status: 404 })
    if (!s) return new Response('Okta is not configured', { status: 503 })
    return finishLogin(request, await getPayload({ config }), s, await provider())
  } catch { return new Response('Okta connection unavailable. Return to the app and retry.', { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
export async function POST(request: Request, { params }: Context) {
  if ((await params).action !== 'login') return new Response('Not found', { status: 404 })
  try {
    const s = settings()
    if (!s) return new Response('Okta is not configured', { status: 503 })
    if (request.headers.get('origin') !== s.appURL) return new Response('Forbidden', { status: 403 })
    return startLogin(request, await getPayload({ config }), s, await provider())
  } catch { return new Response('Okta connection unavailable. Return to the app and retry.', { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
