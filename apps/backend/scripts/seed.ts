import { getPayload } from 'payload'
import config from '../src/payload.config'

const adminPassword = process.env.SEED_ADMIN_PASSWORD
const memberPassword = process.env.SEED_MEMBER_PASSWORD
if (!adminPassword || !memberPassword || Math.min(adminPassword.length, memberPassword.length) < 12) {
  throw new Error('Set seed passwords of at least 12 characters in .env. Run npm run setup.')
}

const payload = await getPayload({ config })
try {
  for (const [username, displayName, role] of [
    ['admin', '管理者', 'admin'], ['alice', 'Alice', 'member'], ['bob', 'Bob', 'member'],
  ] as const) {
    const existing = await payload.find({ collection: 'users', where: { username: { equals: username } }, limit: 1, overrideAccess: true })
    if (existing.totalDocs) {
      console.log(`Skipped existing user: ${username}`)
      continue
    }
    await payload.create({
      collection: 'users', overrideAccess: true,
      data: { username, displayName, role, email: `${username}@example.test`, password: role === 'admin' ? adminPassword : memberPassword },
    })
    console.log(`Created user: ${username} (${role})`)
  }
} finally {
  await payload.destroy()
}
