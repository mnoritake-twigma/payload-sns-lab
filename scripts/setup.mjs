import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const backend = new URL('../apps/backend/', import.meta.url)
await mkdir(new URL('data/', backend), { recursive: true })
const env = [
  `PAYLOAD_SECRET=${randomBytes(32).toString('hex')}`,
  'DATABASE_URL=file:./data/sns.db',
  'PAYLOAD_PUBLIC_URL=http://localhost:4310',
  `SEED_ADMIN_PASSWORD=${randomBytes(18).toString('base64url')}`,
  `SEED_MEMBER_PASSWORD=${randomBytes(18).toString('base64url')}`,
].join('\n') + '\n'
try {
  await writeFile(new URL('.env', backend), env, { flag: 'wx', mode: 0o600 })
  console.log(`Created ${fileURLToPath(new URL('.env', backend))}`)
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  console.log('Existing .env preserved. No secrets or passwords changed.')
}
console.log('Next: npm run migrate && npm run seed && npm run dev')
