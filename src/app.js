import express from 'express';

function parseId(rawId) {
  if (!/^\d+$/.test(rawId)) return null;
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function createApp(notesRepository) {
  const app = express();
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', async (_req, res, next) => {
    try {
      await notesRepository.health();
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  });

  app.post('/notes', async (req, res, next) => {
    try {
      const { title, body } = req.body ?? {};

      if (typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'title is required' });
      }
      if (title.length > 200) {
        return res.status(400).json({ error: 'title must be 200 characters or fewer' });
      }
      if (typeof body !== 'string' || body.trim() === '') {
        return res.status(400).json({ error: 'body is required' });
      }

      const note = await notesRepository.create({
        title: title.trim(),
        body: body.trim(),
      });
      return res.status(201).json(note);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/notes', async (_req, res, next) => {
    try {
      const notes = await notesRepository.list();
      res.status(200).json(notes);
    } catch (error) {
      next(error);
    }
  });

  app.get('/notes/:id', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
      }

      const note = await notesRepository.getById(id);
      if (!note) {
        return res.status(404).json({ error: 'note not found' });
      }

      return res.status(200).json(note);
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/notes/:id', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'id must be a positive integer' });
      }

      const deleted = await notesRepository.deleteById(id);
      if (!deleted) {
        return res.status(404).json({ error: 'note not found' });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}
