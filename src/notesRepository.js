export class NotesRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async health() {
    await this.pool.query('SELECT 1');
  }

  async create({ title, body }) {
    const result = await this.pool.query(
      `INSERT INTO notes (title, body)
       VALUES ($1, $2)
       RETURNING id, title, body, created_at`,
      [title, body],
    );
    return result.rows[0];
  }

  async list() {
    const result = await this.pool.query(
      `SELECT id, title, body, created_at
       FROM notes
       ORDER BY id ASC`,
    );
    return result.rows;
  }

  async getById(id) {
    const result = await this.pool.query(
      `SELECT id, title, body, created_at
       FROM notes
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async deleteById(id) {
    const result = await this.pool.query(
      'DELETE FROM notes WHERE id = $1',
      [id],
    );
    return result.rowCount > 0;
  }
}
