import Database from "better-sqlite3";
import { mkdir } from "fs/promises";
import path from "path";
const createDatabase = (dbPath) => {
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
    return db;
};
export const createSqliteStorage = async (dbPath) => {
    await mkdir(path.dirname(dbPath), { recursive: true });
    const db = createDatabase(dbPath);
    return {
        projects: {
            create: ({ id, name, path: projectPath }) => {
                db.prepare(`INSERT INTO projects (id, name, path) VALUES (@id, @name, @path)`).run({ id, name, path: projectPath });
                return db
                    .prepare(`SELECT * FROM projects WHERE id = @id`)
                    .get({ id });
            },
            getAll: () => {
                return db
                    .prepare(`SELECT * FROM projects ORDER BY created_at DESC`)
                    .all({});
            },
            getById: (id) => {
                return db
                    .prepare(`SELECT * FROM projects WHERE id = @id`)
                    .get({ id });
            },
            getByPath: (projectPath) => {
                return db
                    .prepare(`SELECT * FROM projects WHERE path = @path`)
                    .get({ path: projectPath });
            },
            delete: (id) => {
                db.prepare(`DELETE FROM projects WHERE id = @id`).run({ id });
            },
        },
        close: () => {
            db.close();
        },
    };
};
