module.exports = (io, auctionManager, auctionBroadcaster) => {
 
  io.engine.on("connection_error", (err) => {
    console.log("Connection error:", err.message);
  });

  io.on('connection', (socket) => {
    const username = socket.handshake.auth?.username || `User_${socket.id.slice(0,6)}`;
    console.log(`${username} connected (${socket.id})`);
    
    if (!socket.auth) socket.auth = {};
    socket.auth.username = username;
    socket.data.username = username;
    socket.data.connectedAt = new Date();
    socket.emit('connected', { socketId: socket.id, username });

    socket.on('error', (error) => {
      console.log(`Socket error for ${username}:`, error);
    });

    socket.on('ping', () => {socket.emit('pong');});

    socket.on('auction:join', async (payload, ack) => {
      try {
        const auctionId = payload && payload.auctionId;
        if (!auctionId) {
          if (ack) ack({ success: false, error: 'Missing auction ID' });
          return;
        }
        
        socket.join(`auction_${auctionId}`);
      
        auctionBroadcaster.addSubscriber(auctionId, socket.id);
        
        const auction = await auctionManager.getAuction(auctionId);
        if (auction) {
          const participantCount = auctionBroadcaster.getParticipantCount(auctionId);
          
          const response = {
            success: true,
            auction: auction,
            participantsOnline: participantCount
          };
          
          if (ack) ack(response);
          
          auctionBroadcaster.broadcastAuctionUpdate(auctionId, {
            auctionId,
            data: {
              participantsOnline: participantCount
            }
          });
          
          socket.emit('auction:update', { 
            auctionId, 
            data: {
              highest: auction.highest, 
              bids: auction.bids, 
              endTime: auction.endTime,
              participantsOnline: participantCount
            }
          });
        } 
        else {
          if (ack) ack({ success: false, error: 'Auction not found' });
          socket.emit('error', { message: 'not found' });
        }
      } catch (error) {
        console.error('Error joining auction:', error);
        if (ack) ack({ success: false, error: 'Failed to join auction' });
      }
    });

    socket.on('auction:leave', (payload) => {
      const auctionId = payload && payload.auctionId;
      if (!auctionId) return;
      
      socket.leave(`auction_${auctionId}`);
      auctionBroadcaster.removeSubscriber(auctionId, socket.id);
      
      const participantCount = auctionBroadcaster.getParticipantCount(auctionId);
      auctionBroadcaster.broadcastAuctionUpdate(auctionId, {
        auctionId,
        data: {
          participantsOnline: participantCount
        }
      });
    });


    socket.on('join-auction', async (payload) => {
      socket.emit('auction:join', payload);
    });

    socket.on('leave-auction', (payload) => {
      socket.emit('auction:leave', payload);
    });

    
    socket.on('bid:place', async (payload, ack) => {
   
      try {

        if (!payload || !payload.auctionId || payload.amount == null) {
          if (ack) return ack({ success: false, error: 'missing auctionId or amount' });
          return;
        }
        
        const auctionId = payload.auctionId;
        const amount = Number(payload.amount);
        const bidder = socket.data.username || payload.bidder || 'Anonymous';
        const clientId = payload.clientId || socket.id;

        const participantCount = auctionBroadcaster.getParticipantCount(auctionId);
        const result = await auctionManager.placeBid(auctionId, { bidder, amount, clientId }, participantCount);
        
     

        const auction = await auctionManager.getAuction(auctionId);
        
        auctionBroadcaster.broadcastAuctionUpdate(auctionId, { 
          auctionId, 
          data: {
            highest: auction.highest, 
            bids: auction.bids, 
            extended: result.extended, 
            newEndTime: result.newEndTime,
            participantsOnline: auctionBroadcaster.getParticipantCount(auctionId)
          }
        });
        

        auctionBroadcaster.broadcastGlobalUpdate('auction:bid-update', {
          auctionId,
          auction: auction,
          bidder,
          amount: result.bid.amount
        });
        

        
        if (ack) ack({ 
          success: true, 
          data: {
            bid: result.bid, 
            extended: result.extended, 
            newEndTime: result.newEndTime 
          }
        });
      }
       catch (err) {
        console.error('Bidplacement error:', err);
        if (ack) ack({ 
          success: false,
          error: err.message || 'failed to place bid'
        });
      }
    });


    socket.on('place-bid', async (payload, ack) => {
      socket.emit('bid:place', payload, ack);
    });


   
    socket.on('disconnect', (reason) => {
      console.log(`${username} disconnected (${socket.id}): ${reason}`);
      
      const cleanedAuctions = auctionBroadcaster.cleanupSocketSubscriptions(socket.id);
      
      cleanedAuctions.forEach(auctionId => {
        auctionBroadcaster.broadcastAuctionUpdate(auctionId, {
          auctionId,
          data: { participantsOnline: auctionBroadcaster.getParticipantCount(auctionId) }
        });
      });
      

      socket.broadcast.emit('user:disconnected', { username });
    });

    socket.on('connect_error', (error) => {
      console.log(`Connection error for ${username}:`, error);
    });
  });
};