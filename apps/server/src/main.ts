import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { registerSocketHandlers } from '@poalim/socket-handler';

const app = express();

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

const httpServer = createServer(app);

const allowedOrigins = [
  'http://localhost:4200',
  'https://bank-chat.netlify.app',
];

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // allow non-browser clients / health checks (no Origin header)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

registerSocketHandlers(io);

const port = Number(process.env.PORT ?? 3000);
const host = '0.0.0.0';

httpServer.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
