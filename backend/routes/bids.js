const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { cache, CACHE_KEYS, CHANNELS } = require('../config/redis');

const router = express.Router();

// Place a bid on an auction
router.post('/', [
  authenticateToken,
  body('auctionId').isInt().withMessage('Valid auction ID is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Bid amount must be positive'),
  body('maxBid').optional().isFloat({ min: 0.01 }).withMessage('Max bid must be positive')
], async (req, res) => {
  const client = await require('../config/database').pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { auctionId, amount, maxBid } = req.body;
    const bidderId = req.user.id;

    // Get auction details with row-level locking
    const auctionResult = await client.query(`
      SELECT a.*, u.username as seller_username
      FROM auctions a
      JOIN users u ON a.seller_id = u.id
      WHERE a.id = $1 AND a.status = 'active' AND a.end_time > NOW()
      FOR UPDATE
    `, [auctionId]);

    if (auctionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Auction not found or has ended' });
    }

    const auction = auctionResult.rows[0];

    // Check if bidder is not the seller
    if (auction.seller_id === bidderId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Cannot bid on your own auction' });
    }

    // Validate bid amount
    const minBidIncrement = 1.00; // Minimum bid increment
    const requiredMinBid = parseFloat(auction.current_price) + minBidIncrement;

    if (parseFloat(amount) < requiredMinBid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: `Bid must be at least $${requiredMinBid.toFixed(2)}`,
        minimumBid: requiredMinBid
      });
    }

    // Check if there's a buy now price and bid meets it
    if (auction.buy_now_price && parseFloat(amount) >= parseFloat(auction.buy_now_price)) {
      // Buy now - end auction immediately
      await client.query(`
        UPDATE auctions 
        SET current_price = $1, status = 'sold', winner_id = $2, 
            end_time = NOW(), updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [auction.buy_now_price, bidderId, auctionId]);

      // Record the winning bid
      await client.query(`
        INSERT INTO bids (auction_id, bidder_id, amount, is_winning, created_at)
        VALUES ($1, $2, $3, true, NOW())
      `, [auctionId, bidderId, auction.buy_now_price]);

      await client.query('COMMIT');

      // Clear cache
      await cache.del(CACHE_KEYS.AUCTION_DETAILS(auctionId));
      await cache.del(CACHE_KEYS.AUCTION_FEED(1));

      // Emit real-time update
      const io = req.app.get('io');
      if (io) {
        io.emit('auction_ended', {
          auctionId,
          winnerId: bidderId,
          finalPrice: parseFloat(auction.buy_now_price),
          type: 'buy_now'
        });
      }

      return res.json({
        message: 'Buy now successful! You won the auction.',
        bid: {
          id: null,
          auctionId,
          amount: parseFloat(auction.buy_now_price),
          isWinning: true,
          type: 'buy_now'
        },
        auction: {
          status: 'sold',
          winnerId: bidderId,
          finalPrice: parseFloat(auction.buy_now_price)
        }
      });
    }

    // Get current highest bid for proxy bidding logic
    const currentHighestBidResult = await client.query(`
      SELECT * FROM bids 
      WHERE auction_id = $1 AND is_winning = true
      ORDER BY created_at DESC 
      LIMIT 1
    `, [auctionId]);

    let newCurrentPrice = parseFloat(amount);
    let isWinning = true;
    let isAutoBid = false;

    // Proxy bidding logic
    if (currentHighestBidResult.rows.length > 0) {
      const currentHighestBid = currentHighestBidResult.rows[0];
      const currentMaxBid = parseFloat(currentHighestBid.max_bid || currentHighestBid.amount);
      const newMaxBid = parseFloat(maxBid || amount);

      if (newMaxBid <= currentMaxBid) {
        // Current bidder still wins, but price increases
        newCurrentPrice = Math.min(newMaxBid + minBidIncrement, currentMaxBid);
        isWinning = false;
        
        // Update current auction price
        await client.query(`
          UPDATE auctions 
          SET current_price = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [newCurrentPrice, auctionId]);
      } else {
        // New bidder wins
        newCurrentPrice = Math.min(currentMaxBid + minBidIncrement, newMaxBid);
        
        // Mark previous winning bid as not winning
        await client.query(`
          UPDATE bids SET is_winning = false WHERE auction_id = $1 AND is_winning = true
        `, [auctionId]);
        
        // Update auction
        await client.query(`
          UPDATE auctions 
          SET current_price = $1, bid_count = bid_count + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [newCurrentPrice, auctionId]);
      }
    } else {
      // First bid
      await client.query(`
        UPDATE auctions 
        SET current_price = $1, bid_count = bid_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [newCurrentPrice, auctionId]);
    }

    // Check if auction should be extended (anti-snipe protection)
    const timeRemaining = new Date(auction.end_time) - new Date();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (timeRemaining < fiveMinutes) {
      // Extend auction by 5 minutes
      const newEndTime = new Date(Date.now() + fiveMinutes);
      await client.query(`
        UPDATE auctions SET end_time = $1 WHERE id = $2
      `, [newEndTime, auctionId]);
    }

    // Insert the new bid
    const bidResult = await client.query(`
      INSERT INTO bids (auction_id, bidder_id, amount, max_bid, is_winning, is_auto_bid, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [auctionId, bidderId, amount, maxBid || amount, isWinning, isAutoBid]);

    const newBid = bidResult.rows[0];

    await client.query('COMMIT');

    // Clear cache
    await cache.del(CACHE_KEYS.AUCTION_DETAILS(auctionId));
    await cache.del(CACHE_KEYS.AUCTION_FEED(1));

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('bid_placed', {
        auctionId,
        bidId: newBid.id,
        bidderId,
        bidderUsername: req.user.username,
        amount: parseFloat(amount),
        currentPrice: newCurrentPrice,
        isWinning,
        bidCount: auction.bid_count + 1,
        timeRemaining: Math.max(0, (new Date(auction.end_time) - new Date()) / 1000)
      });
    }

    // Create notification for auction owner
    await client.query(`
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES ($1, 'new_bid', 'New bid on your auction', $2, $3)
    `, [
      auction.seller_id,
      `${req.user.username} placed a bid of $${amount} on "${auction.title}"`,
      JSON.stringify({ auctionId, bidAmount: amount, bidderId })
    ]);

    res.json({
      message: isWinning ? 'Bid placed successfully! You are currently winning.' : 'Bid placed successfully.',
      bid: {
        id: newBid.id,
        auctionId,
        amount: parseFloat(amount),
        maxBid: parseFloat(maxBid || amount),
        isWinning,
        isAutoBid,
        createdAt: newBid.created_at
      },
      auction: {
        currentPrice: newCurrentPrice,
        bidCount: auction.bid_count + 1
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Place bid error:', error);
    res.status(500).json({ message: 'Failed to place bid' });
  } finally {
    client.release();
  }
});

// Get bids for an auction
router.get('/auction/:auctionId', async (req, res) => {
  try {
    const auctionId = parseInt(req.params.auctionId);
    
    if (isNaN(auctionId)) {
      return res.status(400).json({ message: 'Invalid auction ID' });
    }

    // Check cache first
    const cacheKey = CACHE_KEYS.AUCTION_BIDS(auctionId);
    const cachedBids = await cache.get(cacheKey);
    
    if (cachedBids) {
      return res.json(cachedBids);
    }

    const result = await query(`
      SELECT 
        b.id, b.amount, b.is_winning, b.is_auto_bid, b.created_at,
        u.username as bidder_username, u.reputation_score as bidder_reputation
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      WHERE b.auction_id = $1
      ORDER BY b.created_at DESC
      LIMIT 50
    `, [auctionId]);

    const bids = result.rows.map(bid => ({
      id: bid.id,
      amount: parseFloat(bid.amount),
      isWinning: bid.is_winning,
      isAutoBid: bid.is_auto_bid,
      createdAt: bid.created_at,
      bidder: {
        username: bid.bidder_username,
        reputation: bid.bidder_reputation
      }
    }));

    const response = { bids };

    // Cache for 30 seconds
    await cache.set(cacheKey, response, 30);

    res.json(response);
  } catch (error) {
    console.error('Get auction bids error:', error);
    res.status(500).json({ message: 'Failed to get auction bids' });
  }
});

// Get user's bids
router.get('/user/my-bids', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status; // 'active', 'won', 'lost'

    let queryText = `
      SELECT DISTINCT ON (b.auction_id)
        b.id, b.auction_id, b.amount, b.max_bid, b.is_winning, b.created_at,
        a.title as auction_title, a.current_price, a.status as auction_status,
        a.end_time, a.images, a.winner_id,
        u.username as seller_username
      FROM bids b
      JOIN auctions a ON b.auction_id = a.id
      JOIN users u ON a.seller_id = u.id
      WHERE b.bidder_id = $1
    `;

    const queryParams = [req.user.id];
    let paramIndex = 2;

    if (status === 'active') {
      queryText += ` AND a.status = 'active' AND a.end_time > NOW()`;
    } else if (status === 'won') {
      queryText += ` AND a.status IN ('sold', 'ended') AND a.winner_id = $${paramIndex}`;
      queryParams.push(req.user.id);
      paramIndex++;
    } else if (status === 'lost') {
      queryText += ` AND a.status IN ('sold', 'ended') AND (a.winner_id != $${paramIndex} OR a.winner_id IS NULL)`;
      queryParams.push(req.user.id);
      paramIndex++;
    }

    queryText += ` ORDER BY b.auction_id, b.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await query(queryText, queryParams);

    const bids = result.rows.map(bid => ({
      id: bid.id,
      auctionId: bid.auction_id,
      amount: parseFloat(bid.amount),
      maxBid: parseFloat(bid.max_bid),
      isWinning: bid.is_winning,
      createdAt: bid.created_at,
      auction: {
        title: bid.auction_title,
        currentPrice: parseFloat(bid.current_price),
        status: bid.auction_status,
        endTime: bid.end_time,
        images: bid.images,
        winnerId: bid.winner_id,
        seller: bid.seller_username
      }
    }));

    res.json({
      bids,
      pagination: {
        page,
        limit,
        hasMore: bids.length === limit
      }
    });
  } catch (error) {
    console.error('Get user bids error:', error);
    res.status(500).json({ message: 'Failed to get user bids' });
  }
});

// Get bid history for a specific auction (for sellers and admins)
router.get('/auction/:auctionId/history', authenticateToken, async (req, res) => {
  try {
    const auctionId = parseInt(req.params.auctionId);
    
    if (isNaN(auctionId)) {
      return res.status(400).json({ message: 'Invalid auction ID' });
    }

    // Check if user is the seller or admin/moderator
    const auctionResult = await query(
      'SELECT seller_id FROM auctions WHERE id = $1',
      [auctionId]
    );

    if (auctionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    const auction = auctionResult.rows[0];
    
    if (auction.seller_id !== req.user.id && !['admin', 'moderator'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const result = await query(`
      SELECT 
        b.id, b.amount, b.max_bid, b.is_winning, b.is_auto_bid, b.created_at,
        u.username as bidder_username, u.email as bidder_email,
        u.reputation_score as bidder_reputation
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      WHERE b.auction_id = $1
      ORDER BY b.created_at DESC
    `, [auctionId]);

    const bids = result.rows.map(bid => ({
      id: bid.id,
      amount: parseFloat(bid.amount),
      maxBid: parseFloat(bid.max_bid),
      isWinning: bid.is_winning,
      isAutoBid: bid.is_auto_bid,
      createdAt: bid.created_at,
      bidder: {
        username: bid.bidder_username,
        email: bid.bidder_email,
        reputation: bid.bidder_reputation
      }
    }));

    res.json({ bids });
  } catch (error) {
    console.error('Get bid history error:', error);
    res.status(500).json({ message: 'Failed to get bid history' });
  }
});

module.exports = router;