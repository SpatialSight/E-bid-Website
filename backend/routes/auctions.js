const express = require('express');
const { body, validationResult, query: expressQuery } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { query } = require('../config/database');
const { authenticateToken, requireSeller, optionalAuth } = require('../middleware/auth');
const { cache, CACHE_KEYS } = require('../config/redis');

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/auctions');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `auction-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
    files: 10 // Maximum 10 images per auction
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, JPG, PNG, WebP) are allowed'));
    }
  }
});

// Get auction feed (TikTok-style vertical browsing)
router.get('/feed', optionalAuth, [
  expressQuery('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  expressQuery('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  expressQuery('category').optional().isInt().withMessage('Category must be a valid ID'),
  expressQuery('condition').optional().isIn(['new', 'like_new', 'good', 'fair', 'poor']).withMessage('Invalid condition'),
  expressQuery('maxPrice').optional().isFloat({ min: 0 }).withMessage('Max price must be positive'),
  expressQuery('sort').optional().isIn(['newest', 'ending_soon', 'price_low', 'price_high', 'popular']).withMessage('Invalid sort option')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const category = req.query.category;
    const condition = req.query.condition;
    const maxPrice = req.query.maxPrice;
    const sort = req.query.sort || 'newest';

    // Development mode - return mock data if database not available
    if (process.env.NODE_ENV !== 'production') {
      const mockAuctions = {
        auctions: [
          {
            id: 1,
            title: 'iPhone 14 Pro Max - Excellent Condition',
            description: 'Barely used iPhone 14 Pro Max in pristine condition. Includes original box and accessories.',
            condition: 'like_new',
            currentPrice: 850.00,
            startingPrice: 500.00,
            buyNowPrice: 1000.00,
            shippingCost: 15.00,
            images: ['/uploads/auctions/iphone-1.jpg', '/uploads/auctions/iphone-2.jpg'],
            endTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days from now
            bidCount: 12,
            viewCount: 245,
            watchCount: 18,
            status: 'active',
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
            isFeatured: true,
            sellerUsername: 'techseller123',
            sellerReputation: 4.8,
            categoryName: 'Electronics',
            categoryIcon: '📱',
            isWatched: false,
            timeRemaining: 172800 // 2 days in seconds
          },
          {
            id: 2,
            title: 'Vintage Nike Air Jordan 1 - Size 10',
            description: 'Classic Air Jordan 1 in great condition. Perfect for collectors or everyday wear.',
            condition: 'good',
            currentPrice: 320.00,
            startingPrice: 200.00,
            buyNowPrice: 450.00,
            shippingCost: 12.00,
            images: ['/uploads/auctions/jordan-1.jpg'],
            endTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days from now
            bidCount: 8,
            viewCount: 156,
            watchCount: 22,
            status: 'active',
            createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
            isFeatured: false,
            sellerUsername: 'sneakerhead',
            sellerReputation: 4.6,
            categoryName: 'Fashion',
            categoryIcon: '👕',
            isWatched: true,
            timeRemaining: 432000 // 5 days in seconds
          },
          {
            id: 3,
            title: 'MacBook Pro 16" M2 - Like New',
            description: 'Powerful MacBook Pro with M2 chip. Perfect for professionals and creatives.',
            condition: 'like_new',
            currentPrice: 1850.00,
            startingPrice: 1500.00,
            buyNowPrice: 2200.00,
            shippingCost: 25.00,
            images: ['/uploads/auctions/macbook-1.jpg', '/uploads/auctions/macbook-2.jpg'],
            endTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day from now
            bidCount: 15,
            viewCount: 389,
            watchCount: 35,
            status: 'active',
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
            isFeatured: true,
            sellerUsername: 'applefan',
            sellerReputation: 4.9,
            categoryName: 'Electronics',
            categoryIcon: '📱',
            isWatched: false,
            timeRemaining: 86400 // 1 day in seconds
          }
        ],
        pagination: {
          currentPage: page,
          totalPages: 1,
          totalItems: 3,
          hasNext: false,
          hasPrev: false
        }
      };
      return res.json(mockAuctions);
    }

    // Check cache first
    const cacheKey = `${CACHE_KEYS.AUCTION_FEED(page)}_${category || 'all'}_${condition || 'all'}_${maxPrice || 'all'}_${sort}`;
    const cachedFeed = await cache.get(cacheKey);
    
    if (cachedFeed) {
      return res.json(cachedFeed);
    }

    // Build query
    let queryText = `
      SELECT 
        a.id, a.title, a.description, a.condition, a.current_price, 
        a.starting_price, a.buy_now_price, a.shipping_cost, a.images,
        a.end_time, a.bid_count, a.view_count, a.watch_count, a.status,
        a.created_at, a.is_featured,
        u.username as seller_username, u.reputation_score as seller_reputation,
        c.name as category_name, c.icon as category_icon,
        CASE WHEN w.id IS NOT NULL THEN true ELSE false END as is_watched,
        EXTRACT(EPOCH FROM (a.end_time - NOW())) as time_remaining
      FROM auctions a
      JOIN users u ON a.seller_id = u.id
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN watchlist w ON a.id = w.auction_id AND w.user_id = $1
      WHERE a.status = 'active' AND a.end_time > NOW()
    `;

    const queryParams = [req.user?.id || null];
    let paramIndex = 2;

    // Add filters
    if (category) {
      queryText += ` AND a.category_id = $${paramIndex}`;
      queryParams.push(category);
      paramIndex++;
    }

    if (condition) {
      queryText += ` AND a.condition = $${paramIndex}`;
      queryParams.push(condition);
      paramIndex++;
    }

    if (maxPrice) {
      queryText += ` AND a.current_price <= $${paramIndex}`;
      queryParams.push(maxPrice);
      paramIndex++;
    }

    // Add sorting
    switch (sort) {
      case 'ending_soon':
        queryText += ' ORDER BY a.end_time ASC';
        break;
      case 'price_low':
        queryText += ' ORDER BY a.current_price ASC';
        break;
      case 'price_high':
        queryText += ' ORDER BY a.current_price DESC';
        break;
      case 'popular':
        queryText += ' ORDER BY (a.bid_count + a.watch_count) DESC, a.created_at DESC';
        break;
      default: // newest
        queryText += ' ORDER BY a.is_featured DESC, a.created_at DESC';
    }

    queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await query(queryText, queryParams);

    // Update view counts for returned auctions
    if (result.rows.length > 0) {
      const auctionIds = result.rows.map(auction => auction.id);
      await query(
        'UPDATE auctions SET view_count = view_count + 1 WHERE id = ANY($1)',
        [auctionIds]
      );
    }

    const auctions = result.rows.map(auction => ({
      id: auction.id,
      title: auction.title,
      description: auction.description,
      condition: auction.condition,
      currentPrice: parseFloat(auction.current_price),
      startingPrice: parseFloat(auction.starting_price),
      buyNowPrice: auction.buy_now_price ? parseFloat(auction.buy_now_price) : null,
      shippingCost: parseFloat(auction.shipping_cost),
      images: auction.images,
      endTime: auction.end_time,
      bidCount: auction.bid_count,
      viewCount: auction.view_count + 1, // Include the current view
      watchCount: auction.watch_count,
      status: auction.status,
      createdAt: auction.created_at,
      isFeatured: auction.is_featured,
      isWatched: auction.is_watched,
      timeRemaining: Math.max(0, auction.time_remaining),
      seller: {
        username: auction.seller_username,
        reputation: auction.seller_reputation
      },
      category: {
        name: auction.category_name,
        icon: auction.category_icon
      }
    }));

    const response = {
      auctions,
      pagination: {
        page,
        limit,
        hasMore: auctions.length === limit
      }
    };

    // Cache for 2 minutes
    await cache.set(cacheKey, response, 120);

    res.json(response);
  } catch (error) {
    console.error('Get auction feed error:', error);
    res.status(500).json({ message: 'Failed to get auction feed' });
  }
});

// Get single auction details
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const auctionId = parseInt(req.params.id);
    
    if (isNaN(auctionId)) {
      return res.status(400).json({ message: 'Invalid auction ID' });
    }

    // Check cache first
    const cacheKey = CACHE_KEYS.AUCTION_DETAILS(auctionId);
    const cachedAuction = await cache.get(cacheKey);
    
    if (cachedAuction) {
      // Update view count
      await query('UPDATE auctions SET view_count = view_count + 1 WHERE id = $1', [auctionId]);
      cachedAuction.viewCount += 1;
      return res.json(cachedAuction);
    }

    const result = await query(`
      SELECT 
        a.*, 
        u.username as seller_username, u.full_name as seller_name,
        u.reputation_score as seller_reputation, u.whatsapp as seller_whatsapp,
        u.total_sales as seller_total_sales,
        c.name as category_name, c.icon as category_icon,
        CASE WHEN w.id IS NOT NULL THEN true ELSE false END as is_watched,
        EXTRACT(EPOCH FROM (a.end_time - NOW())) as time_remaining
      FROM auctions a
      JOIN users u ON a.seller_id = u.id
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN watchlist w ON a.id = w.auction_id AND w.user_id = $1
      WHERE a.id = $2
    `, [req.user?.id || null, auctionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    const auction = result.rows[0];

    // Get recent bids
    const bidsResult = await query(`
      SELECT b.amount, b.created_at, u.username as bidder_username
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      WHERE b.auction_id = $1
      ORDER BY b.created_at DESC
      LIMIT 10
    `, [auctionId]);

    // Update view count
    await query('UPDATE auctions SET view_count = view_count + 1 WHERE id = $1', [auctionId]);

    const response = {
      id: auction.id,
      title: auction.title,
      description: auction.description,
      condition: auction.condition,
      currentPrice: parseFloat(auction.current_price),
      startingPrice: parseFloat(auction.starting_price),
      reservePrice: auction.reserve_price ? parseFloat(auction.reserve_price) : null,
      buyNowPrice: auction.buy_now_price ? parseFloat(auction.buy_now_price) : null,
      shippingCost: parseFloat(auction.shipping_cost),
      codLocations: auction.cod_locations,
      images: auction.images,
      status: auction.status,
      startTime: auction.start_time,
      endTime: auction.end_time,
      bidCount: auction.bid_count,
      viewCount: auction.view_count + 1,
      watchCount: auction.watch_count,
      winnerId: auction.winner_id,
      isFeatured: auction.is_featured,
      isWatched: auction.is_watched,
      timeRemaining: Math.max(0, auction.time_remaining),
      createdAt: auction.created_at,
      updatedAt: auction.updated_at,
      seller: {
        id: auction.seller_id,
        username: auction.seller_username,
        fullName: auction.seller_name,
        reputation: auction.seller_reputation,
        whatsapp: auction.seller_whatsapp,
        totalSales: auction.seller_total_sales
      },
      category: {
        id: auction.category_id,
        name: auction.category_name,
        icon: auction.category_icon
      },
      recentBids: bidsResult.rows.map(bid => ({
        amount: parseFloat(bid.amount),
        createdAt: bid.created_at,
        bidder: bid.bidder_username
      }))
    };

    // Cache for 1 minute
    await cache.set(cacheKey, response, 60);

    res.json(response);
  } catch (error) {
    console.error('Get auction details error:', error);
    res.status(500).json({ message: 'Failed to get auction details' });
  }
});

// Create new auction
router.post('/', [
  authenticateToken,
  requireSeller,
  upload.array('images', 10),
  body('title').isLength({ min: 5, max: 200 }).withMessage('Title must be 5-200 characters'),
  body('description').isLength({ min: 20, max: 2000 }).withMessage('Description must be 20-2000 characters'),
  body('categoryId').isInt().withMessage('Valid category ID is required'),
  body('condition').isIn(['new', 'like_new', 'good', 'fair', 'poor']).withMessage('Valid condition is required'),
  body('startingPrice').isFloat({ min: 0.01 }).withMessage('Starting price must be positive'),
  body('reservePrice').optional().isFloat({ min: 0.01 }).withMessage('Reserve price must be positive'),
  body('buyNowPrice').optional().isFloat({ min: 0.01 }).withMessage('Buy now price must be positive'),
  body('shippingCost').optional().isFloat({ min: 0 }).withMessage('Shipping cost must be non-negative'),
  body('durationHours').isInt({ min: 1, max: 168 }).withMessage('Duration must be 1-168 hours'),
  body('codLocations').optional().isArray().withMessage('COD locations must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'At least one image is required' });
    }

    const {
      title, description, categoryId, condition, startingPrice,
      reservePrice, buyNowPrice, shippingCost = 0, durationHours,
      codLocations = []
    } = req.body;

    // Validate reserve and buy now prices
    if (reservePrice && parseFloat(reservePrice) < parseFloat(startingPrice)) {
      return res.status(400).json({ message: 'Reserve price must be greater than starting price' });
    }

    if (buyNowPrice && parseFloat(buyNowPrice) < parseFloat(startingPrice)) {
      return res.status(400).json({ message: 'Buy now price must be greater than starting price' });
    }

    // Check if category exists
    const categoryResult = await query('SELECT id FROM categories WHERE id = $1 AND is_active = true', [categoryId]);
    if (categoryResult.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid category' });
    }

    // Process uploaded images
    const imagePaths = req.files.map(file => `/uploads/auctions/${file.filename}`);

    // Calculate end time
    const endTime = new Date(Date.now() + parseInt(durationHours) * 60 * 60 * 1000);

    // Create auction
    const result = await query(`
      INSERT INTO auctions (
        seller_id, category_id, title, description, condition,
        starting_price, current_price, reserve_price, buy_now_price,
        shipping_cost, cod_locations, images, end_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      req.user.id, categoryId, title, description, condition,
      startingPrice, startingPrice, reservePrice, buyNowPrice,
      shippingCost, codLocations, imagePaths, endTime
    ]);

    const auction = result.rows[0];

    // Clear cache
    await cache.del(CACHE_KEYS.AUCTION_FEED(1));

    res.status(201).json({
      message: 'Auction created successfully',
      auction: {
        id: auction.id,
        title: auction.title,
        description: auction.description,
        condition: auction.condition,
        startingPrice: parseFloat(auction.starting_price),
        currentPrice: parseFloat(auction.current_price),
        reservePrice: auction.reserve_price ? parseFloat(auction.reserve_price) : null,
        buyNowPrice: auction.buy_now_price ? parseFloat(auction.buy_now_price) : null,
        shippingCost: parseFloat(auction.shipping_cost),
        codLocations: auction.cod_locations,
        images: auction.images,
        endTime: auction.end_time,
        status: auction.status,
        createdAt: auction.created_at
      }
    });
  } catch (error) {
    console.error('Create auction error:', error);
    res.status(500).json({ message: 'Failed to create auction' });
  }
});

// Get user's auctions (seller's listings)
router.get('/user/:userId', optionalAuth, [
  expressQuery('status').optional().isIn(['draft', 'active', 'ended', 'cancelled', 'sold']).withMessage('Invalid status'),
  expressQuery('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  expressQuery('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = parseInt(req.params.userId);
    const status = req.query.status;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    let queryText = `
      SELECT 
        a.id, a.title, a.condition, a.current_price, a.starting_price,
        a.images, a.end_time, a.bid_count, a.status, a.created_at,
        c.name as category_name
      FROM auctions a
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.seller_id = $1
    `;

    const queryParams = [userId];
    let paramIndex = 2;

    if (status) {
      queryText += ` AND a.status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }

    queryText += ` ORDER BY a.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await query(queryText, queryParams);

    const auctions = result.rows.map(auction => ({
      id: auction.id,
      title: auction.title,
      condition: auction.condition,
      currentPrice: parseFloat(auction.current_price),
      startingPrice: parseFloat(auction.starting_price),
      images: auction.images,
      endTime: auction.end_time,
      bidCount: auction.bid_count,
      status: auction.status,
      createdAt: auction.created_at,
      category: auction.category_name
    }));

    res.json({
      auctions,
      pagination: {
        page,
        limit,
        hasMore: auctions.length === limit
      }
    });
  } catch (error) {
    console.error('Get user auctions error:', error);
    res.status(500).json({ message: 'Failed to get user auctions' });
  }
});

module.exports = router;