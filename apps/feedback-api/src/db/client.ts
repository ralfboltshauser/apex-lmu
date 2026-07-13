import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let sqlClient: ReturnType<typeof postgres> | null = null
let database: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (database) return database
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not configured')
  sqlClient = postgres(url, { max: 5, prepare: false, idle_timeout: 20 })
  database = drizzle(sqlClient, { schema })
  return database
}

export async function closeDb() {
  await sqlClient?.end({ timeout: 5 })
  sqlClient = null
  database = null
}
