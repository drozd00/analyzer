import type { Client, Pool, PoolClient, PoolConfig } from 'pg'

export type { Pool, PoolClient } from 'pg'

export interface DatabaseOptions extends PoolConfig {
  connectionString: string
}

export function createDatabase(options: DatabaseOptions): Pool

export function runTransaction<T>(
  database: Pool,
  action: (client: PoolClient) => Promise<T>,
): Promise<T>

export interface MigrationSource {
  name: string
  sql: string
}

export interface MigrationOptions {
  directory?: URL
  /** Load bundled SQL instead of reading the migration directory. */
  load?: () => Promise<MigrationSource[]>
  log?: (message: string) => void
}

/** Apply SQL migrations, then close the dedicated, initially unconnected client. */
export function runMigrations(client: Client, options?: MigrationOptions): Promise<void>
