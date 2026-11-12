import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'

/** Read SQL files in filename order, hashing their original contents. */
export async function loadMigrations(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const names = []

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.sql')) {
      names.push(entry.name)
    }
  }

  const sources = []
  for (const name of names) {
    const file = new URL(encodeURIComponent(name), directory)
    const sql = await readFile(file, 'utf8')
    sources.push({ name, sql })
  }

  return prepareMigrations(sources)
}

/** Give filesystem and bundled SQL identical ordering and byte-preserving checksums. */
export function prepareMigrations(sources) {
  const migrations = []
  const names = new Set()

  for (const source of sources) {
    const { name, sql } = source
    const hasValidName =
      typeof name === 'string' &&
      name.endsWith('.sql') &&
      !name.includes('/') &&
      !name.includes('\\')

    if (!hasValidName) {
      throw new Error('Migration names must be SQL filenames without directories.')
    }

    if (names.has(name)) {
      throw new Error(`Duplicate migration: ${name}`)
    }

    if (typeof sql !== 'string') {
      throw new Error(`Migration must contain SQL text: ${name}`)
    }

    names.add(name)

    const hash = createHash('sha256')
    hash.update(sql)
    const sha256 = hash.digest('hex')
    migrations.push({ name, sql, sha256 })
  }

  migrations.sort((left, right) => {
    if (left.name < right.name) {
      return -1
    }

    if (left.name > right.name) {
      return 1
    }

    return 0
  })

  return migrations
}
