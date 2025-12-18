import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { registerSocketHandlers } from '@poalim/socket-handler';

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*' },
});

registerSocketHandlers(io);

const PORT = Number(process.env.PORT ?? 3000);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
