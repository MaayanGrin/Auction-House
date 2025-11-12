const Auction = require('./models/auction');

class AuctionBroadcaster {

  constructor(io, auctionManager) {
    this.io = io;
    this.auctionManager = auctionManager;
    this.subscribers = new Map();
    this.tickIntervals = new Map();   
    this._sweepInterval = setInterval(() => this._sweepAndBroadcast(), 500);
  }

  addSubscriber(auctionId, socketId) {
    let s = this.subscribers.get(auctionId);
    if (!s) { 
      s = new Set(); 
      this.subscribers.set(auctionId, s); 
    }
    s.add(socketId);
    if (s.size === 1) {
      this._startTick(auctionId);
    }
  }

  removeSubscriber(auctionId, socketId) {
    const s = this.subscribers.get(auctionId);
    if (!s) return;   
    s.delete(socketId);
    if (s.size === 0) {
      this.subscribers.delete(auctionId);
      this._stopTick(auctionId);
    }
  }

  cleanupSocketSubscriptions(socketId) {
    const auctionsToCleanup = [];
    
    for (const [auctionId, subscribers] of this.subscribers) {
      if (subscribers.has(socketId)) {
        subscribers.delete(socketId);
        auctionsToCleanup.push(auctionId);
        
        if (subscribers.size === 0) {
          this.subscribers.delete(auctionId);
          this._stopTick(auctionId);
        }
      }
    }
    
    return auctionsToCleanup;
  }

  getParticipantCount(auctionId) {
    const subscribers = this.subscribers.get(auctionId);
    return subscribers ? subscribers.size : 0;
  }

  broadcastAuctionUpdate(auctionId, payload) {
    if (!this.io) return;
    this.io.to(this._roomName(auctionId)).emit('auction:update', payload);
  }

  broadcastAuctionEvent(auctionId, event, payload) {
    if (!this.io) return;
    this.io.to(this._roomName(auctionId)).emit(event, payload);
  }

  broadcastGlobalUpdate(event, payload) {
    if (!this.io) return;
    //console.log(` global update: ${event}`, payload);
    this.io.emit(event, payload);
  }

  emitToSocket(socketId, event, payload) {
    if (!this.io) return;
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) socket.emit(event, payload);
  }

  broadcastOutbidNotification(outbidUser, auctionTitle, auctionId, newBidder, newBidAmount) {
    if (!this.io) return;
    
    this.io.sockets.sockets.forEach((socket) => {
      const socketUsername = socket.auth?.username || socket.data?.username;
      if (socketUsername === outbidUser) {
        socket.emit('bid:outbid', {
          outbidUser,
          auctionTitle,
          auctionId,
          newBidder,
          newBidAmount,
          timestamp: new Date()
        });
      }
    });
    
  //  console.log(`Outbid notification sent to ${outbidUser}: ${newBidder} bid $${newBidAmount} on "${auctionTitle}"`);
  }

  _startTick(auctionId) {
    
    if (!this.io) return;
    if (this.tickIntervals.get(auctionId)) return;

    const handle = setInterval(async () => {
      await this._sendTick(auctionId);
    }, 1000);

    this.tickIntervals.set(auctionId, handle);
  }

  _stopTick(auctionId) {
    const intervalId = this.tickIntervals.get(auctionId);
    if (intervalId) {
      clearInterval(intervalId);
      this.tickIntervals.delete(auctionId);
    }
  }

  _refreshTick(auctionId) {
    this._stopTick(auctionId);
    if (this.subscribers.has(auctionId)) {
      this._startTick(auctionId);
    }
  }

  async _sendTick(auctionId) {
    const a = await Auction.findById(auctionId).lean();
    if (!a) return;

    const now = new Date();
    const endTime = new Date(a.endTime);
    const timeLeft = endTime - now;

    if (timeLeft <= 0) {
      this._stopTick(auctionId);
      return;
    }

    const timeRemaining = this._formatTimeRemaining(timeLeft);

    this.io.to(this._roomName(auctionId)).emit('auction:tick', {
      auctionId,
      timeRemaining,
      serverTime: now.toISOString(),
      endTime: a.endTime
    });
  }

  _formatTimeRemaining(timeLeft) {
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  async _sweepAndBroadcast() {
    const statusChanges = await this.auctionManager.updateAuctionStatuses();

    for (const change of statusChanges.ended) {
      this.broadcastAuctionEvent(change.auctionId, 'auction:status-change', change);
      this.broadcastGlobalUpdate('auction:status-change', change);
      
      this.broadcastAuctionEvent(change.auctionId, 'auction:ended', { 
        auctionId: change.auctionId, 
        endTime: change.auction.endTime, 
        snapshot: change.auction 
      });
      
      this._stopTick(change.auctionId);
    }

    for (const change of statusChanges.activated) {
      this.broadcastAuctionEvent(change.auctionId, 'auction:status-change', change);
      this.broadcastGlobalUpdate('auction:status-change', change);
    }
  }

  _roomName(auctionId) {
    return `auction_${auctionId}`;
  }

  destroy() {
    if (this._sweepInterval) {
      clearInterval(this._sweepInterval);
    }
     

    for (const [auctionId, intervalId] of this.tickIntervals) {
      clearInterval(intervalId);
    }
    
    this.tickIntervals.clear();
    this.subscribers.clear();
  }
}

module.exports = AuctionBroadcaster;