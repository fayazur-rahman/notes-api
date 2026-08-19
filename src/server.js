import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { NotesRepository } from './notesRepository.js';

const config = loadConfig();
const pool = createPool(config.db);
const notesRepository = new NotesRepository(pool);

await notesRepository.initialize();

const app = createApp(notesRepository);
const server = app.listen(config.port, () => {
  console.log(`Notes API listening on port ${config.port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close(async () => {
    try {
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error('Error while closing database pool', error);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
