import { provider, settings } from '../src/oidc/provider'
try {
  const s = settings()
  if (!s) throw new Error('Set OKTA_ISSUER, OKTA_CLIENT_ID and OKTA_CLIENT_SECRET in apps/backend/.env.')
  const config = await provider()
  console.log('OIDC discovery succeeded.')
  console.log(`Issuer: ${config.serverMetadata().issuer}`)
  console.log(`Register sign-in redirect URI: ${s.redirectURI}`)
  console.log('Client credentials and assigned-user login still need a real browser sign-in. No secrets were printed.')
} catch {
  console.error('Okta configuration/discovery failed. Check the .env values, issuer URL and network. Secrets are not printed.')
  process.exitCode = 1
}
