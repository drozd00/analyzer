import { definePlugin } from 'nitro'
import { useKV } from 'nitro/kv'
import { Client } from 'pg'
import { runMigrations } from '@datastore/index.mjs'
import type { MigrationSource } from '@datastore/index.mjs'
import { closeDatabase } from '@server/utils/database'

function decodeMigration(contents: string | Uint8Array): string {
  if (typeof contents === 'string') {
    return contents
  }

  return Buffer.from(contents).toString('utf8')
}

async function loadBundledMigrations(): Promise<MigrationSource[]> {
  const assets = useKV('assets:migrations')
  const names = await assets.getKeys()
  const migrations: MigrationSource[] = []

  for (const name of names) {
    if (!name.endsWith('.sql')) {
      continue
    }

    const contents = await assets.getItemRaw<string | Uint8Array>(name)
    if (contents === null || contents === undefined) {
      throw new Error(`Bundled migration is missing: ${name}`)
    }

    migrations.push({ name, sql: decodeMigration(contents) })
  }

  if (migrations.length === 0) {
    throw new Error('No bundled SQL migrations were found.')
  }

  return migrations
}

export default definePlugin(async (nitroApp) => {
  nitroApp.hooks.hook('close', closeDatabase)

  try {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is required.')
    }

    const client = new Client({ connectionString, connectionTimeoutMillis: 5000 })
    await runMigrations(client, { load: loadBundledMigrations })
  } catch (error) {
    console.error('Datastore startup migrations failed.', error)
    process.exit(1)
  }
})
