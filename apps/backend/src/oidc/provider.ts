import * as oidc from 'openid-client'

export function settings() {
  const issuer = process.env.OKTA_ISSUER
  const clientId = process.env.OKTA_CLIENT_ID
  const clientSecret = process.env.OKTA_CLIENT_SECRET
  const appURL = new URL(process.env.APP_URL || 'http://127.0.0.1:5173').origin
  if (!issuer || !clientId || !clientSecret) return null
  const url = new URL(issuer)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid issuer configuration')
  const app = new URL(appURL)
  if (app.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['127.0.0.1', 'localhost'].includes(app.hostname))) throw new Error('APP_URL requires HTTPS')
  return { issuer, clientId, clientSecret, appURL, redirectURI: `${appURL}/api/oidc/callback` }
}
let cached: Promise<oidc.Configuration> | undefined
export function provider() {
  const s = settings()
  if (!s) throw new Error('Okta is not configured')
  if (!cached) cached = oidc.discovery(new URL(s.issuer), s.clientId, {
    client_secret: s.clientSecret, id_token_signed_response_alg: 'RS256',
  }, oidc.ClientSecretBasic(s.clientSecret), { execute: [oidc.enableNonRepudiationChecks], timeout: 10 }).catch(e => { cached = undefined; throw e })
  return cached
}
