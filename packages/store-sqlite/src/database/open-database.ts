import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

/** A better-sqlite3 connection with sqlite-vec loaded. */
export type Db = Database.Database;

export interface OpenDatabaseOptions {
  /** Read-only connections are what the server uses (key design decision 3). */
  readonly readonly?: boolean;
  /** WAL lets the server read while another process writes, for the runtime database. */
  readonly wal?: boolean;
  /** Fails instead of creating an empty file; always true for read-only opens. */
  readonly mustExist?: boolean;
}

/**
 * Opens a SQLite file with sqlite-vec loaded and foreign keys on. A read-only open fails when
 * the file does not exist instead of creating an empty one.
 */
export function openDatabase(path: string, options: OpenDatabaseOptions = {}): Db {
  const readonly = options.readonly === true;
  const db = new Database(path, {
    readonly,
    fileMustExist: readonly || options.mustExist === true,
  });
  try {
    sqliteVec.load(db);
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    if (!readonly && options.wal === true) db.pragma('journal_mode = WAL');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
