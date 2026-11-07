import { DatabaseSync } from 'node:sqlite';
import { TransactionRunner } from '../../application/ports';

/** Схема БД. Нові зміни додаються як наступні елементи масиву (міграції). */
const MIGRATIONS: string[] = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     login TEXT NOT NULL UNIQUE COLLATE NOCASE,
     email TEXT NOT NULL UNIQUE,
     display_name TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('USER','MODERATOR','ADMIN')),
     status TEXT NOT NULL CHECK (status IN ('ACTIVE','BLOCKED')),
     failed_logins INTEGER NOT NULL DEFAULT 0,
     locked_until TEXT,
     created_at TEXT NOT NULL
   );
   CREATE TABLE routes (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     mode TEXT NOT NULL,
     visibility TEXT NOT NULL,
     status TEXT NOT NULL,
     hidden_reason TEXT,
     waypoints TEXT NOT NULL DEFAULT '[]',
     search_text TEXT NOT NULL DEFAULT '',
     start_lat REAL,
     start_lon REAL,
     length_km REAL NOT NULL DEFAULT 0,
     rating_avg REAL NOT NULL DEFAULT 0,
     rating_count INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX idx_routes_listing ON routes(status, visibility, created_at);
   CREATE INDEX idx_routes_owner ON routes(owner_id);
   CREATE INDEX idx_routes_start ON routes(start_lat, start_lon);
   CREATE TABLE route_tags (
     route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     tag TEXT NOT NULL,
     PRIMARY KEY (route_id, tag)
   );
   CREATE INDEX idx_route_tags_tag ON route_tags(tag);
   CREATE TABLE pois (
     id TEXT PRIMARY KEY,
     route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     name TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     category TEXT NOT NULL,
     lat REAL NOT NULL,
     lon REAL NOT NULL,
     sharing TEXT NOT NULL
   );
   CREATE INDEX idx_pois_route ON pois(route_id);
   CREATE INDEX idx_pois_sharing ON pois(sharing);
   CREATE TABLE ratings (
     route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
     created_at TEXT NOT NULL,
     PRIMARY KEY (route_id, user_id)
   );
   CREATE TABLE comments (
     id TEXT PRIMARY KEY,
     route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
     author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     text TEXT NOT NULL,
     status TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE INDEX idx_comments_route ON comments(route_id, created_at);
   CREATE TABLE complaints (
     id TEXT PRIMARY KEY,
     reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     target_type TEXT NOT NULL,
     target_id TEXT NOT NULL,
     reason TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL,
     decision TEXT,
     resolved_by TEXT,
     created_at TEXT NOT NULL,
     resolved_at TEXT
   );
   CREATE INDEX idx_complaints_status ON complaints(status, created_at);
   CREATE TABLE notifications (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     type TEXT NOT NULL,
     message TEXT NOT NULL,
     link TEXT,
     is_read INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   );
   CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at);`,
  // 2: профіль користувача та відкликання токенів після зміни пароля
  `ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
   ALTER TABLE users ADD COLUMN city TEXT NOT NULL DEFAULT '';
   ALTER TABLE users ADD COLUMN password_changed_at TEXT;
   CREATE INDEX idx_comments_author ON comments(author_id);
   CREATE INDEX idx_ratings_user ON ratings(user_id);`,
];

/** Обгортка над вбудованим модулем node:sqlite: відкриття, міграції, транзакції. */
export class SqliteDatabase implements TransactionRunner {
  readonly db: DatabaseSync;
  private depth = 0;

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
    const row = this.db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
    let version = row?.version ?? 0;
    if (!row) this.db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
    while (version < MIGRATIONS.length) {
      this.run(() => {
        this.db.exec(MIGRATIONS[version]);
        this.db.prepare('UPDATE schema_version SET version = ?').run(version + 1);
      });
      version++;
    }
  }

  /** Виконує роботу в транзакції; вкладені виклики приєднуються до зовнішньої транзакції. */
  run<T>(work: () => T): T {
    if (this.depth > 0) return work();   // вкладений виклик
    this.db.exec('BEGIN');
    this.depth++;
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    } finally {
      this.depth--;
    }
  }

  close(): void {
    this.db.close();
  }
}
