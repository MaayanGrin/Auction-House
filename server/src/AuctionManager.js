const Auction = require('./models/auction');

class AuctionManager {
  constructor() {
    this.locks = new Map();
    this.broadcaster = null; 
  }

  setBroadcaster(broadcaster) {
    this.broadcaster = broadcaster;
  }

  async listAuctions() {
    const now = new Date();
    const all = await Auction.find().lean();
    const active = [], ended = [], scheduled = [];
    
    all.forEach(a => {
      const startTime = new Date(a.startTime || a.createdAt);
      const endTime = new Date(a.endTime);
      
      if (endTime <= now || a.status === 'ended') {
        ended.push(this._formatAuctionData(a));
      } else if (startTime > now) {
        scheduled.push(this._formatAuctionData(a));
      } else {
        active.push(this._formatAuctionData(a));
      }
    });
    
    return { active, scheduled, ended };
  }

  async createAuction(data) {
    const auctionData = {
      ...data,
      startTime: data.startTime || new Date(),
      status: data.status || 'active'
    };
    const a = new Auction(auctionData);
    await a.save();
    return this._formatAuctionData(a);
  }

  async getAuction(id) {
    const a = await Auction.findById(id).lean();
    if (!a) return null;
    return this._formatAuctionData(a);
  }

  async getBids(auctionId) {
    const auction = await Auction.findById(auctionId).lean();
    if (!auction) return [];
    return (auction.bids || []).reverse();
  }

  async placeBid(auctionId, { bidder, amount, clientId, time = Date.now() }, participantCount = 0) {
    const auction = await Auction.findById(auctionId);
   
    if (!auction) throw { status: 404, message: 'Auction not found' };

    return this.withLock(auctionId, async () => {
      const now = Date.now();
      
      if (auction.status === 'scheduled') {
        throw { status: 400, message: 'Auction has not started yet' };
      }
      
      if (auction.endTime.getTime() <= now || auction.status === 'ended') {
        auction.status = 'ended';
        await auction.save();
        throw { status: 400, message: 'Auction has ended' };
      }
      
      const currentHighest = auction.highest;
      const minAmount = currentHighest ? (currentHighest.amount + 1) : auction.startingPrice;
      if (Number(amount) < minAmount) throw { status: 400, message: `Bid must be >= ${minAmount}` };

      const previousHighestBidder = currentHighest ? currentHighest.bidder : null;

      const bid = {
        clientId: clientId || null,
        bidder: bidder || 'Anonymous',
        amount: Number(amount),
        time: new Date(time)
      };
        auction.bids.push(bid);
      auction.highest = bid;

        const msLeft = auction.endTime.getTime() - now;
     let extended = false;
       let newEndTime = auction.endTime;
      if (msLeft <= 10000) {
        newEndTime = new Date(auction.endTime.getTime() + 15000);
         auction.endTime = newEndTime;
        extended = true;
      }

      await auction.save();
      

      const savedBid = auction.bids[auction.bids.length - 1];
      

      if (previousHighestBidder && previousHighestBidder !== bidder && this.broadcaster) {
        this.broadcaster.broadcastOutbidNotification(
          previousHighestBidder,
          auction.title,
          auction._id.toString(),
          bidder,
          Number(amount)
        );
      }
      
      return { 
        bid: { ...savedBid.toObject(), id: savedBid._id }, 
        extended, 
        newEndTime, 
        previousHighest: currentHighest ? { ...currentHighest, id: currentHighest._id } : null,
        auctionSnapshot: this._formatAuctionData(auction, participantCount)
      };
    });
  }

  async withLock(auctionId, fn) {
    const prev = this.locks.get(auctionId) || Promise.resolve();
    let release;
    const next = new Promise(res => (release = res));
    this.locks.set(auctionId, prev.then(() => next));
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(auctionId) === next) this.locks.delete(auctionId);
    }
  }

  async updateAuctionStatuses() {
    const now = new Date();
    const results = { ended: [], activated: [] };

    const running = await Auction.find({ status: 'active', endTime: { $lte: now } });
    for (const a of running) {
      const oldStatus = a.status;
      a.status = 'ended';
      await a.save();
      results.ended.push({
        auctionId: a._id.toString(),
        oldStatus,
        newStatus: 'ended',
        auction: this._formatAuctionData(a)
      });
    }
    const scheduled = await Auction.find({ status: 'scheduled', startTime: { $lte: now } });
    for (const a of scheduled) {
      const oldStatus = a.status;
      a.status = 'active';
      await a.save();
      results.activated.push({
        auctionId: a._id.toString(),
        oldStatus,
        newStatus: 'active',
        auction: this._formatAuctionData(a)
      });
    }

    return results;
  }

  _formatAuctionData(a, participantCount = 0) {
    return {
      id: a._id.toString(),
      title: a.title,
      description: a.description,
      currency: a.currency,
      startingPrice: a.startingPrice,
      reservePrice: a.reservePrice,
      bids: (a.bids || []).slice(-100).reverse(),
      highest: a.highest || null,
      endTime: a.endTime,
      startTime: a.startTime || a.createdAt,
      status: a.status,
      createdAt: a.createdAt,
      participantsOnline: participantCount
    };
  }
}

module.exports = AuctionManager;