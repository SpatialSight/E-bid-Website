const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { cache, CACHE_KEYS } = require('../config/redis');

const router = express.Router();

// Add auction to watchlist
router.post('/', [
  authenticateToken,
  body('auctionId').isInt().withMessage('Valid auction ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { auctionId } = req.body;
    const userId = req.user.id;

    // Check if auction exists and is active
    const auctionResult = await query(
      'SELECT id, title, seller_id FROM auctions WHERE id = $1 AND status = $2',
      [auctionId, 'active']
    );

    if (auctionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found or not active' });
    }

    const auction = auctionResult.rows[0];

    // Check if user is not the seller
    if (auction.seller_id === userId) {
      return res.status(400).json({ message: 'Cannot watch your own auction' });
    }

    // Add to watchlist (ignore if already exists)
    const result = await query(
      'INSERT INTO watchlist (user_id, auction_id) VALUES ($1, $2) ON CONFLICT (user_id, auction_id) DO NOTHING RETURNING *',
      [userId, auctionId]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'Auction already in watchlist' });
    }

    // Update auction watch count
    await query(
      'UPDATE auctions SET watch_count = watch_count + 1 WHERE id = $1',
      [auctionId]
    );

    // Clear cache
    await cache.del(CACHE_KEYS.USER_WATCHLIST(userId));
    await cache.del(CACHE_KEYS.AUCTION_DETAILS(auctionId));

    res.status(201).json({
      message: 'Auction added to watchlist',
      watchlistItem: {
        id: result.rows[0].id,
        auctionId,
        createdAt: result.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Add to watchlist error:', error);
    res.status(500).json({ message: 'Failed to add auction to watchlist' });
  }
});

// Remove auction from watchlist
router.delete('/:auctionId', authenticateToken, async (req, res) => {
  try {
    const auctionId = parseInt(req.params.auctionId);
    const userId = req.user.id;

    if (isNaN(auctionId)) {
      return res.status(400).json({ message: 'Invalid auction ID' });
    }

    // Remove from watchlist
    const result = await query(
      'DELETE FROM watchlist WHERE user_id = $1 AND auction_id = $2 RETURNING *',
      [userId, auctionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not in watchlist' });
    }

    // Update auction watch count
    await query(
      'UPDATE auctions SET watch_count = GREATEST(watch_count - 1, 0) WHERE id = $1',
      [auctionId]
    );

    // Clear cache
    await cache.del(CACHE_KEYS.USER_WATCHLIST(userId));
    await cache.del(CACHE_KEYS.AUCTION_DETAILS(auctionId));

    res.json({ message: 'Auction removed from watchlist' });
  } catch (error) {
    console.error('Remove from watchlist error:', error);
    res.status(500).json({ message: 'Failed to remove auction from watchlist' });
  }
});

// Get user's watchlist
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || 'active'; // 'active', 'ended', 'all'

    // Check cache first
    const cacheKey = `${CACHE_KEYS.USER_WATCHLIST(userId)}_${page}_${status}`;
    const cachedWatchlist = await cache.get(cacheKey);
    
    if (cachedWatchlist) {
      return res.json(cachedWatchlist);
    }

    let queryText = `
      SELECT 
        w.id as watchlist_id, w.created_at as watched_at,
        a.id, a.title, a.description, a.condition, a.current_price,
        a.starting_price, a.buy_now_price, a.images, a.end_time,
        a.bid_count, a.status, a.winner_id,
        u.username as seller_username, u.reputation_score as seller_reputation,
        c.name as category_name,
        EXTRACT(EPOCH FROM (a.end_time - NOW())) as time_remaining
      FROM watchlist w
      JOIN auctions a ON w.auction_id = a.id
      JOIN users u ON a.seller_id = u.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE w.user_id = $1
    `;

    const queryParams = [userId];
    let paramIndex = 2;

    // Add status filter
    if (status === 'active') {
      queryText += ` AND a.status = 'active' AND a.end_time > NOW()`;
    } else if (status === 'ended') {
      queryText += ` AND (a.status IN ('ended', 'sold', 'cancelled') OR a.end_time <= NOW())`;
    }

    queryText += ` ORDER BY w.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await query(queryText, queryParams);

    const watchlist = result.rows.map(item => ({
      watchlistId: item.watchlist_id,
      watchedAt: item.watched_at,
      auction: {
        id: item.id,
        title: item.title,
        description: item.description,
        condition: item.condition,
        currentPrice: parseFloat(item.current_price),
        startingPrice: parseFloat(item.starting_price),
        buyNowPrice: item.buy_now_price ? parseFloat(item.buy_now_price) : null,
        images: item.images,
        endTime: item.end_time,
        bidCount: item.bid_count,
        status: item.status,
        winnerId: item.winner_id,
        timeRemaining: Math.max(0, item.time_remaining || 0),
        seller: {
          username: item.seller_username,
          reputation: item.seller_reputation
        },
        category: item.category_name
      }
    }));

    const response = {
      watchlist,
      pagination: {
        page,
        limit,
        hasMore: watchlist.length === limit
      }
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);

    res.json(response);
  } catch (error) {
    console.error('Get watchlist error:', error);
    res.status(500).json({ message: 'Failed to get watchlist' });
  }
});

// Check if auction is in user's watchlist
router.get('/check/:auctionId', authenticateToken, async (req, res) => {
  try {
    const auctionId = parseInt(req.params.auctionId);
    const userId = req.user.id;

    if (isNaN(auctionId)) {
      return res.status(400).json({ message: 'Invalid auction ID' });
    }

    const result = await query(
      'SELECT id FROM watchlist WHERE user_id = $1 AND auction_id = $2',
      [userId, auctionId]
    );

    res.json({
      isWatched: result.rows.length > 0,
      watchlistId: result.rows.length > 0 ? result.rows[0].id : null
    });
  } catch (error) {
    console.error('Check watchlist error:', error);
    res.status(500).json({ message: 'Failed to check watchlist status' });
  }
});

// Get watchlist summary (counts)
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(`
      SELECT 
        COUNT(*) as total_watched,
        COUNT(CASE WHEN a.status = 'active' AND a.end_time > NOW() THEN 1 END) as active_watched,
        COUNT(CASE WHEN a.status IN ('ended', 'sold') AND a.winner_id = $1 THEN 1 END) as won_from_watchlist,
        COUNT(CASE WHEN a.end_time <= NOW() + INTERVAL '1 hour' AND a.status = 'active' THEN 1 END) as ending_soon
      FROM watchlist w
      JOIN auctions a ON w.auction_id = a.id
      WHERE w.user_id = $1
    `, [userId]);

    const summary = result.rows[0];

    res.json({
      totalWatched: parseInt(summary.total_watched),
      activeWatched: parseInt(summary.active_watched),
      wonFromWatchlist: parseInt(summary.won_from_watchlist),
      endingSoon: parseInt(summary.ending_soon)
    });
  } catch (error) {
    console.error('Get watchlist summary error:', error);
    res.status(500).json({ message: 'Failed to get watchlist summary' });
  }
});

// Get auctions ending soon from watchlist (for notifications)
router.get('/ending-soon', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const hoursAhead = parseInt(req.query.hours) || 1; // Default 1 hour

    const result = await query(`
      SELECT 
        a.id, a.title, a.current_price, a.end_time, a.images,
        EXTRACT(EPOCH FROM (a.end_time - NOW())) as time_remaining
      FROM watchlist w
      JOIN auctions a ON w.auction_id = a.id
      WHERE w.user_id = $1 
        AND a.status = 'active'
        AND a.end_time > NOW()
        AND a.end_time <= NOW() + INTERVAL '${hoursAhead} hours'
      ORDER BY a.end_time ASC
    `, [userId]);

    const endingSoon = result.rows.map(auction => ({
      id: auction.id,
      title: auction.title,
      currentPrice: parseFloat(auction.current_price),
      endTime: auction.end_time,
      images: auction.images,
      timeRemaining: Math.max(0, auction.time_remaining)
    }));

    res.json({ endingSoon });
  } catch (error) {
    console.error('Get ending soon error:', error);
    res.status(500).json({ message: 'Failed to get ending soon auctions' });
  }
});

module.exports = router;