import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { registerSocketHandlers } from '@poalim/socket-handler';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:4200'],
    methods: ['GET', 'POST'],
  },
});

registerSocketHandlers(io);

httpServer.listen(3000, () => {
  console.log('Server listening on http://localhost:3000');
});
