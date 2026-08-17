import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schema } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.join(__dirname, '..', '..', 'data', 'platform.db');

type SqliteDatabase = InstanceType<typeof Database>;

// Lightweight column migrations for tables created before a schema extension.
// CREATE TABLE IF NOT EXISTS never alters existing tables, so databases created
// by older versions need an explicit ALTER TABLE to pick up new columns.
const migrations: { table: string; column: string; ddl: string }[] = [
  { table: 'lessons', column: 'files', ddl: "ALTER TABLE lessons ADD COLUMN files TEXT NOT NULL DEFAULT '[]'" },
  { table: 'lessons', column: 'video_required', ddl: 'ALTER TABLE lessons ADD COLUMN video_required INTEGER NOT NULL DEFAULT 0' },
  { table: 'lessons', column: 'instructor_resources', ddl: "ALTER TABLE lessons ADD COLUMN instructor_resources TEXT NOT NULL DEFAULT '[]'" },
  { table: 'capstone_deliverables', column: 'lesson_id', ddl: 'ALTER TABLE capstone_deliverables ADD COLUMN lesson_id TEXT' },
  { table: 'capstone_deliverables', column: 'instructor_files', ddl: "ALTER TABLE capstone_deliverables ADD COLUMN instructor_files TEXT NOT NULL DEFAULT '[]'" },
];

function applyMigrations(db: SqliteDatabase) {
  for (const migration of migrations) {
    const columns = db.prepare(`PRAGMA table_info(${migration.table})`).all() as { name: string }[];
    if (!columns.some((column) => column.name === migration.column)) db.exec(migration.ddl);
  }
}

export function openDb(file: string = process.env.DB_FILE || defaultPath): SqliteDatabase {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  applyMigrations(db);
  return db;
}

let defaultDb: SqliteDatabase | null = null;

export function initDatabase(file?: string): SqliteDatabase {
  defaultDb = openDb(file);
  console.log('Database initialized successfully');
  return defaultDb;
}

export function getDb(): SqliteDatabase {
  if (!defaultDb) defaultDb = openDb();
  return defaultDb;
}

export function closeDatabase() {
  if (defaultDb) {
    defaultDb.close();
    defaultDb = null;
  }
}
