import { openDB, type IDBPDatabase } from 'idb'
import type { Conversation } from '../types'

const DB_NAME = 'treechat-db'
const DB_VERSION = 1
const STORE_NAME = 'conversations'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  const db = await getDb()
  await db.put(STORE_NAME, conversation)
}

export async function loadAllConversations(): Promise<Conversation[]> {
  const db = await getDb()
  const all = await db.getAll(STORE_NAME)
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, id)
}
