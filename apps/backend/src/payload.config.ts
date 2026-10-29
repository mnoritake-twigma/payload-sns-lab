import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { Users } from './collections/Users'
import { Posts } from './collections/Posts'
import { Follows } from './collections/Follows'
import { AuthIdentities, OidcSessions, OidcFlows } from './collections/ExternalAuth'

const dirname = path.dirname(fileURLToPath(import.meta.url))
if (!process.env.PAYLOAD_SECRET || process.env.PAYLOAD_SECRET.length < 32) {
  throw new Error('PAYLOAD_SECRET must contain at least 32 characters. Run npm run setup first.')
}

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET,
  serverURL: process.env.PAYLOAD_PUBLIC_URL || 'http://localhost:4310',
  admin: { user: 'users', importMap: { baseDir: dirname } },
  collections: [Users, Posts, Follows, AuthIdentities, OidcSessions, OidcFlows],
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || 'file:./data/sns.db' },
    migrationDir: path.resolve(dirname, 'migrations'),
    push: false,
    wal: true,
    busyTimeout: 5000,
  }),
  csrf: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4310', 'http://127.0.0.1:4310'],
  cors: [],
  graphQL: { disable: true },
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
