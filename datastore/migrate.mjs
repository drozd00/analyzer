#!/usr/bin/env node
import { Client } from 'pg'
import { runMigrations } from './lib/run-migrations.mjs'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required.')
}

const client = new Client({ connectionString })
await runMigrations(client)
