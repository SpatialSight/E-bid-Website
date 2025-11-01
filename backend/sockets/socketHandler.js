const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Store active connections
const activeConnections = new Map();
const auctionRooms = new Map(); // Track users watching specific auctions

const socketHandler = (io) => {
  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        // Allow anonymous connections for browsing
        socket.userId = null;
        socket.isAuthenticated = false;
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Verify user exists and is active
      const userResult = await query(
        'SELECT id, username, role, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
        return next(new Error('Authentication failed'));
      }

      socket.userId = decoded.userId;
      socket.username = userResult.rows[0].username;
      socket.userRole = userResult.rows[0].role;
      socket.isAuthenticated = true;
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (User: ${socket.username || 'Anonymous'})`);

    // Store connection
    if (socket.userId) {
      activeConnections.set(socket.userId, socket);
    }

    // Join user to their personal notification room
    if (socket.userId) {
      socket.join(`user_${socket.userId}`);
    }

    // Handle joining auction room for real-time updates
    socket.on('join_auction', (auctionId) => {
      try {
        const roomName = `auction_${auctionId}`;
        socket.join(roomName);
        
        // Track user in auction room
        if (!auctionRooms.has(auctionId)) {
          auctionRooms.set(auctionId, new Set());
        }
        auctionRooms.get(auctionId).add(socket.userId || socket.id);
        
        console.log(`User ${socket.username || 'Anonymous'} joined auction ${auctionId}`);
        
        // Send current auction status
        socket.emit('auction_joined', { auctionId, status: 'connected' });
        
        // Notify others in the room about new viewer
        socket.to(roomName).emit('viewer_joined', {
          auctionId,
          viewerCount: auctionRooms.get(auctionId).size
        });
      } catch (error) {
        console.error('Join auction error:', error);
        socket.emit('error', { message: 'Failed to join auction' });
      }
    });

    // Handle leaving auction room
    socket.on('leave_auction', (auctionId) => {
      try {
        const roomName = `auction_${auctionId}`;
        socket.leave(roomName);
        
        // Remove user from auction room tracking
        if (auctionRooms.has(auctionId)) {
          auctionRooms.get(auctionId).delete(socket.userId || socket.id);
          
          if (auctionRooms.get(auctionId).size === 0) {
            auctionRooms.delete(auctionId);
          } else {
            // Notify others about viewer leaving
            socket.to(roomName).emit('viewer_left', {
              auctionId,
              viewerCount: auctionRooms.get(auctionId).size
            });
          }
        }
        
        console.log(`User ${socket.username || 'Anonymous'} left auction ${auctionId}`);
      } catch (error) {
        console.error('Leave auction error:', error);
      }
    });

    // Handle real-time bid placement (validation happens in API)
    socket.on('place_bid', async (data) => {
      try {
        if (!socket.isAuthenticated) {
          socket.emit('bid_error', { message: 'Authentication required to bid' });
          return;
        }

        const { auctionId, amount, maxBid } = data;
        
        // Emit optimistic update to the bidder
        socket.emit('bid_optimistic', {
          auctionId,
          amount,
          status: 'processing'
        });

        // The actual bid processing happens in the API route
        // This is just for real-time feedback
        
      } catch (error) {
        console.error('Socket bid error:', error);
        socket.emit('bid_error', { message: 'Failed to process bid' });
      }
    });

    // Handle auction watching/unwatching
    socket.on('watch_auction', async (auctionId) => {
      try {
        if (!socket.isAuthenticated) {
          socket.emit('watch_error', { message: 'Authentication required' });
          return;
        }

        // Add to watchlist (this could also be done via API)
        await query(
          'INSERT INTO watchlist (user_id, auction_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [socket.userId, auctionId]
        );

        // Update watch count
        await query(
          'UPDATE auctions SET watch_count = watch_count + 1 WHERE id = $1',
          [auctionId]
        );

        socket.emit('auction_watched', { auctionId, status: 'added' });
        
        // Notify auction room about new watcher
        io.to(`auction_${auctionId}`).emit('watch_count_updated', {
          auctionId,
          increment: 1
        });

      } catch (error) {
        console.error('Watch auction error:', error);
        socket.emit('watch_error', { message: 'Failed to watch auction' });
      }
    });

    socket.on('unwatch_auction', async (auctionId) => {
      try {
        if (!socket.isAuthenticated) {
          return;
        }

        // Remove from watchlist
        const result = await query(
          'DELETE FROM watchlist WHERE user_id = $1 AND auction_id = $2',
          [socket.userId, auctionId]
        );

        if (result.rowCount > 0) {
          // Update watch count
          await query(
            'UPDATE auctions SET watch_count = GREATEST(watch_count - 1, 0) WHERE id = $1',
            [auctionId]
          );

          socket.emit('auction_unwatched', { auctionId, status: 'removed' });
          
          // Notify auction room about removed watcher
          io.to(`auction_${auctionId}`).emit('watch_count_updated', {
            auctionId,
            increment: -1
          });
        }

      } catch (error) {
        console.error('Unwatch auction error:', error);
      }
    });

    // Handle typing indicators for comments (future feature)
    socket.on('typing_start', (auctionId) => {
      if (socket.isAuthenticated) {
        socket.to(`auction_${auctionId}`).emit('user_typing', {
          auctionId,
          username: socket.username,
          userId: socket.userId
        });
      }
    });

    socket.on('typing_stop', (auctionId) => {
      if (socket.isAuthenticated) {
        socket.to(`auction_${auctionId}`).emit('user_stopped_typing', {
          auctionId,
          userId: socket.userId
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
      
      // Clean up user connection
      if (socket.userId) {
        activeConnections.delete(socket.userId);
      }

      // Clean up auction room tracking
      for (const [auctionId, viewers] of auctionRooms.entries()) {
        if (viewers.has(socket.userId || socket.id)) {
          viewers.delete(socket.userId || socket.id);
          
          // Notify room about viewer leaving
          socket.to(`auction_${auctionId}`).emit('viewer_left', {
            auctionId,
            viewerCount: viewers.size
          });
          
          if (viewers.size === 0) {
            auctionRooms.delete(auctionId);
          }
        }
      }
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  // Utility functions for emitting events from other parts of the app
  io.emitToBidders = (auctionId, event, data) => {
    io.to(`auction_${auctionId}`).emit(event, data);
  };

  io.emitToUser = (userId, event, data) => {
    io.to(`user_${userId}`).emit(event, data);
  };

  io.emitBidUpdate = (auctionId, bidData) => {
    io.to(`auction_${auctionId}`).emit('bid_placed', bidData);
  };

  io.emitAuctionEnded = (auctionId, endData) => {
    io.to(`auction_${auctionId}`).emit('auction_ended', endData);
  };

  io.emitAuctionExtended = (auctionId, newEndTime) => {
    io.to(`auction_${auctionId}`).emit('auction_extended', {
      auctionId,
      newEndTime,
      message: 'Auction extended due to last-minute bidding'
    });
  };

  // Periodic cleanup of inactive connections
  setInterval(() => {
    const now = Date.now();
    for (const [userId, socket] of activeConnections.entries()) {
      if (now - socket.handshake.time > 24 * 60 * 60 * 1000) { // 24 hours
        socket.disconnect();
        activeConnections.delete(userId);
      }
    }
  }, 60 * 60 * 1000); // Run every hour

  console.log('✅ Socket.IO handler initialized');
};

module.exports = socketHandler;