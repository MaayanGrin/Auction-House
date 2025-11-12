require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const AuctionManager = require('./AuctionManager');
const AuctionBroadcaster = require('./AuctionBroadcaster');
const socketHandlers = require('./sockets/socketHandlers');
const auctionsRoutes = require('./routes/auctions');
const authRoutes = require('./routes/auth');

const PORT = process.env.PORT || 3000;
const MONGO = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/auctiondb';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });

mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Mongo connect err', err));


const auctionManager = new AuctionManager();
const auctionBroadcaster = new AuctionBroadcaster(io, auctionManager);


auctionManager.setBroadcaster(auctionBroadcaster);

app.use('/api/auctions', auctionsRoutes(auctionManager, auctionBroadcaster));
app.use('/api/auth', authRoutes());


socketHandlers(io, auctionManager, auctionBroadcaster);

server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});


process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  auctionBroadcaster.destroy();
  server.close();
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  auctionBroadcaster.destroy();
  server.close();
});
