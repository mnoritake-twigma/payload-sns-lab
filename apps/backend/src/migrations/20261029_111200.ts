import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`auth_identities\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`issuer\` text NOT NULL,
  	\`subject\` text NOT NULL,
  	\`user_id\` integer NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`auth_identities_user_idx\` ON \`auth_identities\` (\`user_id\`);`)
  await db.run(sql`CREATE INDEX \`auth_identities_updated_at_idx\` ON \`auth_identities\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`auth_identities_created_at_idx\` ON \`auth_identities\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`issuer_subject_idx\` ON \`auth_identities\` (\`issuer\`,\`subject\`);`)
  await db.run(sql`CREATE TABLE \`oidc_sessions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`token_hash\` text NOT NULL,
  	\`user_id\` integer NOT NULL,
  	\`expires_at\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`oidc_sessions_token_hash_idx\` ON \`oidc_sessions\` (\`token_hash\`);`)
  await db.run(sql`CREATE INDEX \`oidc_sessions_user_idx\` ON \`oidc_sessions\` (\`user_id\`);`)
  await db.run(sql`CREATE INDEX \`oidc_sessions_expires_at_idx\` ON \`oidc_sessions\` (\`expires_at\`);`)
  await db.run(sql`CREATE INDEX \`oidc_sessions_updated_at_idx\` ON \`oidc_sessions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`oidc_sessions_created_at_idx\` ON \`oidc_sessions\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`oidc_flows\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`state_hash\` text NOT NULL,
  	\`expires_at\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`oidc_flows_state_hash_idx\` ON \`oidc_flows\` (\`state_hash\`);`)
  await db.run(sql`CREATE INDEX \`oidc_flows_expires_at_idx\` ON \`oidc_flows\` (\`expires_at\`);`)
  await db.run(sql`CREATE INDEX \`oidc_flows_updated_at_idx\` ON \`oidc_flows\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`oidc_flows_created_at_idx\` ON \`oidc_flows\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`auth_provider\` text DEFAULT 'local' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`auth_identities_id\` integer REFERENCES auth_identities(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`oidc_sessions_id\` integer REFERENCES oidc_sessions(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`oidc_flows_id\` integer REFERENCES oidc_flows(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_auth_identities_id_idx\` ON \`payload_locked_documents_rels\` (\`auth_identities_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_oidc_sessions_id_idx\` ON \`payload_locked_documents_rels\` (\`oidc_sessions_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_oidc_flows_id_idx\` ON \`payload_locked_documents_rels\` (\`oidc_flows_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`auth_identities\`;`)
  await db.run(sql`DROP TABLE \`oidc_sessions\`;`)
  await db.run(sql`DROP TABLE \`oidc_flows\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`posts_id\` integer,
  	\`follows_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`posts_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`follows_id\`) REFERENCES \`follows\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "posts_id", "follows_id") SELECT "id", "order", "parent_id", "path", "users_id", "posts_id", "follows_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`posts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_follows_id_idx\` ON \`payload_locked_documents_rels\` (\`follows_id\`);`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`auth_provider\`;`)
}
