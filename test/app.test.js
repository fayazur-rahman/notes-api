import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createApp } from '../src/app.js';

const servers = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise((resolve) => server.close(resolve)),
    ),
  );
});

class InMemoryNotesRepository {
  constructor() {
    this.notes = [];
    this.nextId = 1;
  }

  async health() {}

  async create({ title, body }) {
    const note = {
      id: this.nextId++,
      title,
      body,
      created_at: new Date().toISOString(),
    };
    this.notes.push(note);
    return note;
  }

  async list() {
    return [...this.notes];
  }

  async getById(id) {
    return this.notes.find((note) => note.id === id) ?? null;
  }

  async deleteById(id) {
    const index = this.notes.findIndex((note) => note.id === id);
    if (index === -1) return false;
    this.notes.splice(index, 1);
    return true;
  }
}

async function startTestServer(repository = new InMemoryNotesRepository()) {
  const server = createApp(repository).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test('GET /health returns 200', async () => {
  const baseUrl = await startTestServer();
  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('notes can be created, listed, fetched, and deleted', async () => {
  const baseUrl = await startTestServer();

  const createResponse = await fetch(`${baseUrl}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'First note', body: 'Hello API' }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.id, 1);
  assert.equal(created.title, 'First note');

  const listResponse = await fetch(`${baseUrl}/notes`);
  assert.equal(listResponse.status, 200);
  const notes = await listResponse.json();
  assert.equal(notes.length, 1);

  const getResponse = await fetch(`${baseUrl}/notes/1`);
  assert.equal(getResponse.status, 200);
  assert.equal((await getResponse.json()).body, 'Hello API');

  const deleteResponse = await fetch(`${baseUrl}/notes/1`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 204);

  const missingResponse = await fetch(`${baseUrl}/notes/1`);
  assert.equal(missingResponse.status, 404);
});
