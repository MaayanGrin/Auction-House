Mini Real-Time Auction House

A full-stack real-time auction platform built with Angular frontend and Node.js backend, featuring live bidding, WebSocket communication, and advanced concurrency control.

Quick Start:

Prerequisites:
-Node.js (v16+)
-npm or yarn
-MongoDB (local or cloud)

Installation:
Clone the repository
git clone https://github.com/MaayanGrin/Auction-House.git
cd auction_challenge

Install dependencies:

# Backend 
cd server
npm install
# Frontend
cd client
npm install

Start the application:

# Terminal 1 - Backend
cd server

choose one :
npm start || npm start:dev

# Terminal 2 - Frontend  
cd client
npm start || ng s

Access the application:
Frontend: http://localhost:4200
Backend API: http://localhost:3000


Architecture & Decisions
General Architecture

Backend: Node.js with Express handles HTTP requests and real-time socket events.

Database: MongoDB stores all persistent data.

Client: Subscribes to events using Subject/Observable, and also emits events to the server.

Real-time Approach

Real-time communication is handled via Socket.io.

Clients listen to server events and emit events back, ensuring live updates across all connected clients.

We use Subjects and Observables on the client to manage subscriptions and propagate events reactively.

Concurrency Control

Database updates are atomic, ensuring that no two updates conflict.

The backend handles all write operations to prevent race conditions.

Event-driven updates ensure consistency between clients and the database.

Optional HTTP endpoints exist, but the main flow is event-driven.

Other Decisions

MongoDB: Chosen for flexibility and atomic operations.

Node + Express: Lightweight and scalable backend for real-time applications.

Socket.io: Enables bidirectional real-time communication.

Subjects and Observables on Client: Simplifies handling multiple event streams and subscriptions, enabling reactive data management.


