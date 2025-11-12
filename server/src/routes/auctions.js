const express = require('express');
const router = express.Router();

module.exports = (auctionManager, auctionBroadcaster) => {

  router.post('/', async (req, res) => {
    try {
      const { title, description, startingPrice, currency, endTime, reservePrice, startTime } = req.body;
      if (!title || startingPrice == null || !currency || !endTime) {
        return res.status(400).json({ error: 'missing fields' });
      }
      
      const actualStartTime = startTime ? new Date(startTime) : new Date();
      const now = new Date();
      const status = actualStartTime > now ? 'scheduled' : 'active';
      
      const auctionData = { 
        title, 
        description, 
        startingPrice, 
        currency, 
        endTime, 
        reservePrice,
        startTime: actualStartTime,
        status
      };
      
      const auction = await auctionManager.createAuction(auctionData);  
      auctionBroadcaster.broadcastGlobalUpdate('auction:created', { auction });
      
      res.json(auction);
    } 
    catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'server error' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const list = await auctionManager.listAuctions();
      res.json(list);
    }
     catch (err) { 
      res.status(500).json({ error: 'server error' }); 
    }
  });


  router.get('/:id', async (req, res) => {
    try {
      const auction = await auctionManager.getAuction(req.params.id);
      if (!auction) return res.status(404).json({ error: 'not found' });
      res.json(auction);
    } 
    catch (err) {
      res.status(500).json({ error: 'server error' });
    }
  });


  router.get('/:id/bids', async (req, res) => {
    try {
      const auction = await auctionManager.getAuction(req.params.id);
      if (!auction) return res.status(404).json({ error: 'Auction not found' });
      res.json({ bids: auction.bids || [] });
    }
     catch (err) {
      res.status(500).json({ error: 'server error' });
    }
  });


  router.post('/:id/bid', async (req, res) => {
    try {
      const auctionId = req.params.id;
      const { bidder, amount, clientId } = req.body;
      if (amount == null) return res.status(400).json({ error: 'missing amount' });
      
      const participantCount = auctionBroadcaster.getParticipantCount(auctionId);
      const result = await auctionManager.placeBid(auctionId, { bidder, amount, clientId }, participantCount);
      
      auctionBroadcaster.broadcastAuctionUpdate(auctionId, { 
        auctionId, 
        highest: result.auctionSnapshot?.highest || result.bid, 
        bids: result.auctionSnapshot?.bids, 
        extended: result.extended, 
        newEndTime: result.newEndTime 
      });
      
      if (result.previousHighest && result.previousHighest.clientId) {
        auctionBroadcaster.emitToSocket(result.previousHighest.clientId, 'bid:you-were-outbid', { 
          auctionId, 
          by: result.bid.bidder, 
          amount: result.bid.amount 
        });
      }
      
      res.json({ 
        success: true, 
        bid: result.bid, 
        extended: result.extended, 
        newEndTime: result.newEndTime 
      });
    } 
    catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'failed' });
    }
  });

  return router;
};