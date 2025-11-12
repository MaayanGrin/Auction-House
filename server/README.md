# Auction Server

## Setup
- Copy .env.sample -> .env and edit if needed
- npm install
- Ensure local MongoDB is running (default mongodb://127.0.0.1:27017)
- npm start

Server exposes:
- REST: POST /api/auctions, GET /api/auctions, GET /api/auctions/:id, POST /api/auctions/:id/bid (optional)
- Socket.IO for real-time events
