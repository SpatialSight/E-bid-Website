const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken, requireAdmin, requireModerator } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

// Configure multer for profile image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/profiles');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `profile-${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        id, username, email, full_name, phone, address, city, state, 
        postal_code, country, profile_image, bio, role, is_verified, 
        is_active, created_at, last_login,
        (SELECT COUNT(*) FROM auctions WHERE seller_id = users.id) as total_auctions,
        (SELECT COUNT(*) FROM auctions WHERE seller_id = users.id AND status = 'active') as active_auctions,
        (SELECT COUNT(*) FROM bids WHERE user_id = users.id) as total_bids,
        (SELECT AVG(rating) FROM user_ratings WHERE rated_user_id = users.id) as avg_rating,
        (SELECT COUNT(*) FROM user_ratings WHERE rated_user_id = users.id) as rating_count
      FROM users 
      WHERE id = $1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      address: user.address,
      city: user.city,
      state: user.state,
      postalCode: user.postal_code,
      country: user.country,
      profileImage: user.profile_image,
      bio: user.bio,
      role: user.role,
      isVerified: user.is_verified,
      isActive: user.is_active,
      createdAt: user.created_at,
      lastLogin: user.last_login,
      stats: {
        totalAuctions: parseInt(user.total_auctions),
        activeAuctions: parseInt(user.active_auctions),
        totalBids: parseInt(user.total_bids),
        avgRating: user.avg_rating ? parseFloat(user.avg_rating) : 0,
        ratingCount: parseInt(user.rating_count)
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to get profile' });
  }
});

// Update user profile
router.put('/profile', [
  authenticateToken,
  body('fullName').optional().isLength({ min: 2, max: 100 }).withMessage('Full name must be 2-100 characters'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
  body('address').optional().isLength({ max: 200 }).withMessage('Address must be less than 200 characters'),
  body('city').optional().isLength({ max: 100 }).withMessage('City must be less than 100 characters'),
  body('state').optional().isLength({ max: 100 }).withMessage('State must be less than 100 characters'),
  body('postalCode').optional().isLength({ max: 20 }).withMessage('Postal code must be less than 20 characters'),
  body('country').optional().isLength({ max: 100 }).withMessage('Country must be less than 100 characters'),
  body('bio').optional().isLength({ max: 500 }).withMessage('Bio must be less than 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { fullName, phone, address, city, state, postalCode, country, bio } = req.body;

    // Build update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (fullName !== undefined) {
      updates.push(`full_name = $${paramIndex}`);
      values.push(fullName);
      paramIndex++;
    }

    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex}`);
      values.push(phone);
      paramIndex++;
    }

    if (address !== undefined) {
      updates.push(`address = $${paramIndex}`);
      values.push(address);
      paramIndex++;
    }

    if (city !== undefined) {
      updates.push(`city = $${paramIndex}`);
      values.push(city);
      paramIndex++;
    }

    if (state !== undefined) {
      updates.push(`state = $${paramIndex}`);
      values.push(state);
      paramIndex++;
    }

    if (postalCode !== undefined) {
      updates.push(`postal_code = $${paramIndex}`);
      values.push(postalCode);
      paramIndex++;
    }

    if (country !== undefined) {
      updates.push(`country = $${paramIndex}`);
      values.push(country);
      paramIndex++;
    }

    if (bio !== undefined) {
      updates.push(`bio = $${paramIndex}`);
      values.push(bio);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    values.push(req.user.id);
    const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await query(updateQuery, values);
    const user = result.rows[0];

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        address: user.address,
        city: user.city,
        state: user.state,
        postalCode: user.postal_code,
        country: user.country,
        bio: user.bio
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// Upload profile image
router.post('/profile/image', authenticateToken, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const imageUrl = `/uploads/profiles/${req.file.filename}`;

    // Get current profile image to delete old one
    const currentUser = await query('SELECT profile_image FROM users WHERE id = $1', [req.user.id]);
    const oldImage = currentUser.rows[0]?.profile_image;

    // Update user profile image
    await query('UPDATE users SET profile_image = $1 WHERE id = $2', [imageUrl, req.user.id]);

    // Delete old image file if it exists
    if (oldImage && oldImage !== imageUrl) {
      try {
        const oldImagePath = path.join(__dirname, '../', oldImage);
        await fs.unlink(oldImagePath);
      } catch (error) {
        console.log('Could not delete old profile image:', error.message);
      }
    }

    res.json({
      message: 'Profile image updated successfully',
      profileImage: imageUrl
    });
  } catch (error) {
    console.error('Upload profile image error:', error);
    res.status(500).json({ message: 'Failed to upload profile image' });
  }
});

// Get public user profile
router.get('/:id/public', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const result = await query(`
      SELECT 
        id, username, full_name, profile_image, bio, created_at,
        (SELECT COUNT(*) FROM auctions WHERE seller_id = users.id AND status != 'draft') as total_auctions,
        (SELECT COUNT(*) FROM auctions WHERE seller_id = users.id AND status = 'active') as active_auctions,
        (SELECT AVG(rating) FROM user_ratings WHERE rated_user_id = users.id) as avg_rating,
        (SELECT COUNT(*) FROM user_ratings WHERE rated_user_id = users.id) as rating_count
      FROM users 
      WHERE id = $1 AND is_active = true
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      profileImage: user.profile_image,
      bio: user.bio,
      memberSince: user.created_at,
      stats: {
        totalAuctions: parseInt(user.total_auctions),
        activeAuctions: parseInt(user.active_auctions),
        avgRating: user.avg_rating ? parseFloat(user.avg_rating) : 0,
        ratingCount: parseInt(user.rating_count)
      }
    });
  } catch (error) {
    console.error('Get public profile error:', error);
    res.status(500).json({ message: 'Failed to get user profile' });
  }
});

// Get user's auctions (public)
router.get('/:id/auctions', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;
    const status = req.query.status || 'active';
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Verify user exists and is active
    const userCheck = await query('SELECT id FROM users WHERE id = $1 AND is_active = true', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const result = await query(`
      SELECT 
        a.id, a.title, a.description, a.starting_price, a.current_price, 
        a.buy_now_price, a.end_time, a.status, a.created_at,
        a.images, a.condition, a.location,
        c.name as category_name,
        COUNT(b.id) as bid_count,
        COUNT(w.id) as watch_count
      FROM auctions a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN bids b ON a.id = b.auction_id
      LEFT JOIN watchlist w ON a.id = w.auction_id
      WHERE a.seller_id = $1 AND a.status = $2
      GROUP BY a.id, c.name
      ORDER BY a.created_at DESC
      LIMIT $3 OFFSET $4
    `, [userId, status, limit, offset]);

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) as total FROM auctions WHERE seller_id = $1 AND status = $2',
      [userId, status]
    );

    const auctions = result.rows.map(auction => ({
      id: auction.id,
      title: auction.title,
      description: auction.description,
      startingPrice: parseFloat(auction.starting_price),
      currentPrice: parseFloat(auction.current_price),
      buyNowPrice: auction.buy_now_price ? parseFloat(auction.buy_now_price) : null,
      endTime: auction.end_time,
      status: auction.status,
      createdAt: auction.created_at,
      images: auction.images || [],
      condition: auction.condition,
      location: auction.location,
      categoryName: auction.category_name,
      bidCount: parseInt(auction.bid_count),
      watchCount: parseInt(auction.watch_count)
    }));

    const totalCount = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      auctions,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get user auctions error:', error);
    res.status(500).json({ message: 'Failed to get user auctions' });
  }
});

// Rate a user (after completed transaction)
router.post('/:id/rate', [
  authenticateToken,
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().isLength({ max: 500 }).withMessage('Comment must be less than 500 characters'),
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

    const ratedUserId = parseInt(req.params.id);
    const { rating, comment, auctionId } = req.body;

    if (isNaN(ratedUserId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    if (ratedUserId === req.user.id) {
      return res.status(400).json({ message: 'Cannot rate yourself' });
    }

    // Verify the auction exists and user was involved
    const auctionCheck = await query(`
      SELECT seller_id, winner_id FROM auctions 
      WHERE id = $1 AND status = 'completed'
    `, [auctionId]);

    if (auctionCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found or not completed' });
    }

    const auction = auctionCheck.rows[0];
    
    // Check if user can rate (must be seller rating winner or winner rating seller)
    const canRate = (req.user.id === auction.seller_id && ratedUserId === auction.winner_id) ||
                   (req.user.id === auction.winner_id && ratedUserId === auction.seller_id);

    if (!canRate) {
      return res.status(403).json({ message: 'You can only rate users you have completed transactions with' });
    }

    // Check if already rated
    const existingRating = await query(
      'SELECT id FROM user_ratings WHERE rater_id = $1 AND rated_user_id = $2 AND auction_id = $3',
      [req.user.id, ratedUserId, auctionId]
    );

    if (existingRating.rows.length > 0) {
      return res.status(409).json({ message: 'You have already rated this user for this transaction' });
    }

    // Create rating
    await query(
      'INSERT INTO user_ratings (rater_id, rated_user_id, auction_id, rating, comment) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, ratedUserId, auctionId, rating, comment]
    );

    res.status(201).json({ message: 'Rating submitted successfully' });
  } catch (error) {
    console.error('Rate user error:', error);
    res.status(500).json({ message: 'Failed to submit rating' });
  }
});

// Get user ratings
router.get('/:id/ratings', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 20);
    const offset = (page - 1) * limit;
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const result = await query(`
      SELECT 
        ur.rating, ur.comment, ur.created_at,
        u.username as rater_username, u.profile_image as rater_image,
        a.title as auction_title
      FROM user_ratings ur
      JOIN users u ON ur.rater_id = u.id
      JOIN auctions a ON ur.auction_id = a.id
      WHERE ur.rated_user_id = $1
      ORDER BY ur.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    // Get total count and average
    const statsResult = await query(`
      SELECT 
        COUNT(*) as total_ratings,
        AVG(rating) as avg_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
      FROM user_ratings 
      WHERE rated_user_id = $1
    `, [userId]);

    const stats = statsResult.rows[0];
    const ratings = result.rows.map(rating => ({
      rating: rating.rating,
      comment: rating.comment,
      createdAt: rating.created_at,
      rater: {
        username: rating.rater_username,
        profileImage: rating.rater_image
      },
      auctionTitle: rating.auction_title
    }));

    const totalCount = parseInt(stats.total_ratings);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      ratings,
      stats: {
        totalRatings: totalCount,
        avgRating: stats.avg_rating ? parseFloat(stats.avg_rating) : 0,
        distribution: {
          fiveStar: parseInt(stats.five_star),
          fourStar: parseInt(stats.four_star),
          threeStar: parseInt(stats.three_star),
          twoStar: parseInt(stats.two_star),
          oneStar: parseInt(stats.one_star)
        }
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get user ratings error:', error);
    res.status(500).json({ message: 'Failed to get user ratings' });
  }
});

// Admin: Get all users
router.get('/admin/list', [authenticateToken, requireModerator], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const status = req.query.status || '';

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(username ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR full_name ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (role) {
      whereConditions.push(`role = $${paramIndex}`);
      queryParams.push(role);
      paramIndex++;
    }

    if (status === 'active') {
      whereConditions.push('is_active = true');
    } else if (status === 'inactive') {
      whereConditions.push('is_active = false');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    queryParams.push(limit, offset);
    const limitOffset = `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;

    const result = await query(`
      SELECT 
        id, username, email, full_name, role, is_verified, is_active, 
        created_at, last_login,
        (SELECT COUNT(*) FROM auctions WHERE seller_id = users.id) as total_auctions,
        (SELECT AVG(rating) FROM user_ratings WHERE rated_user_id = users.id) as avg_rating
      FROM users 
      ${whereClause}
      ORDER BY created_at DESC
      ${limitOffset}
    `, queryParams);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total FROM users ${whereClause}
    `, queryParams.slice(0, -2));

    const users = result.rows.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      isVerified: user.is_verified,
      isActive: user.is_active,
      createdAt: user.created_at,
      lastLogin: user.last_login,
      totalAuctions: parseInt(user.total_auctions),
      avgRating: user.avg_rating ? parseFloat(user.avg_rating) : 0
    }));

    const totalCount = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get users list error:', error);
    res.status(500).json({ message: 'Failed to get users list' });
  }
});

// Admin: Update user status/role
router.put('/admin/:id', [
  authenticateToken,
  requireAdmin,
  body('role').optional().isIn(['buyer', 'seller', 'moderator', 'admin']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body('isVerified').optional().isBoolean().withMessage('isVerified must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = parseInt(req.params.id);
    const { role, isActive, isVerified } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ message: 'Cannot modify your own account' });
    }

    // Build update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (role !== undefined) {
      updates.push(`role = $${paramIndex}`);
      values.push(role);
      paramIndex++;
    }

    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(isActive);
      paramIndex++;
    }

    if (isVerified !== undefined) {
      updates.push(`is_verified = $${paramIndex}`);
      values.push(isVerified);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    values.push(userId);
    const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      message: 'User updated successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        isVerified: user.is_verified
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

module.exports = router;