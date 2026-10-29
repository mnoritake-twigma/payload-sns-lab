import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
const database = new DatabaseSync(fileURLToPath(new URL('../apps/backend/data/sns.db', import.meta.url)), { readOnly: true })
console.log('SQLite schema (no user data or credentials):')
for (const row of database.prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
  console.log(`\n${row.name}\n${row.sql || '(automatic index)'}`)
}
database.close()
