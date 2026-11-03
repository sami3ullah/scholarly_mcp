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
 * How much of a read-only file SQLite maps into memory: SQLite's own ceiling, more than the
 * full index needs. Reading mapped pages skips a copy per page, which is most of the cost of
 * a scan over every vector (ADR 0040).
 */
const READONLY_MMAP_BYTES = 2_147_418_112;

/**
 * Opens a SQLite file with sqlite-vec loaded and foreign keys on. A read-only open fails when
 * the file does not exist instead of creating an empty one, and maps the file into memory:
 * index files are never changed in place, only replaced by a rename (ADR 0022), so a mapping
 * can never see a truncated file.
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
    if (readonly) db.pragma(`mmap_size = ${String(READONLY_MMAP_BYTES)}`);
    if (!readonly && options.wal === true) db.pragma('journal_mode = WAL');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
