import pg from 'pg';

const { Pool } = pg;

export function createPool(dbConfig) {
  return new Pool(dbConfig);
}
