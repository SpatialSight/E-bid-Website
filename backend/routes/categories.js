const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { cache, CACHE_KEYS } = require('../config/redis');

const router = express.Router();

// Get all categories
router.get('/', async (req, res) => {
  try {
    // Development mode - return mock data if database not available
    if (process.env.NODE_ENV !== 'production') {
      const mockCategories = {
        categories: [
          {
            id: 1,
            name: 'Electronics',
            description: 'Phones, laptops, gadgets and more',
            icon: '📱',
            isActive: true,
            auctionCount: 25,
            createdAt: new Date().toISOString()
          },
          {
            id: 2,
            name: 'Fashion',
            description: 'Clothing, shoes, accessories',
            icon: '👕',
            isActive: true,
            auctionCount: 18,
            createdAt: new Date().toISOString()
          },
          {
            id: 3,
            name: 'Home & Garden',
            description: 'Furniture, decor, tools',
            icon: '🏠',
            isActive: true,
            auctionCount: 12,
            createdAt: new Date().toISOString()
          },
          {
            id: 4,
            name: 'Sports',
            description: 'Equipment, apparel, collectibles',
            icon: '⚽',
            isActive: true,
            auctionCount: 8,
            createdAt: new Date().toISOString()
          },
          {
            id: 5,
            name: 'Art & Collectibles',
            description: 'Paintings, antiques, rare items',
            icon: '🎨',
            isActive: true,
            auctionCount: 15,
            createdAt: new Date().toISOString()
          }
        ]
      };
      return res.json(mockCategories);
    }

    // Check cache first
    const cachedCategories = await cache.get(CACHE_KEYS.CATEGORIES);
    
    if (cachedCategories) {
      return res.json(cachedCategories);
    }

    const result = await query(`
      SELECT 
        c.id, c.name, c.description, c.icon, c.is_active, c.created_at,
        COUNT(a.id) as auction_count
      FROM categories c
      LEFT JOIN auctions a ON c.id = a.category_id AND a.status = 'active'
      WHERE c.is_active = true
      GROUP BY c.id, c.name, c.description, c.icon, c.is_active, c.created_at
      ORDER BY c.name ASC
    `);

    const categories = result.rows.map(category => ({
      id: category.id,
      name: category.name,
      description: category.description,
      icon: category.icon,
      isActive: category.is_active,
      auctionCount: parseInt(category.auction_count),
      createdAt: category.created_at
    }));

    const response = { categories };

    // Cache for 1 hour
    await cache.set(CACHE_KEYS.CATEGORIES, response, 3600);

    res.json(response);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Failed to get categories' });
  }
});

// Get single category with details
router.get('/:id', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);
    
    if (isNaN(categoryId)) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }

    const result = await query(`
      SELECT 
        c.*,
        COUNT(a.id) as total_auctions,
        COUNT(CASE WHEN a.status = 'active' THEN 1 END) as active_auctions,
        AVG(a.current_price) as avg_price,
        MIN(a.current_price) as min_price,
        MAX(a.current_price) as max_price
      FROM categories c
      LEFT JOIN auctions a ON c.id = a.category_id
      WHERE c.id = $1 AND c.is_active = true
      GROUP BY c.id
    `, [categoryId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const category = result.rows[0];

    res.json({
      id: category.id,
      name: category.name,
      description: category.description,
      icon: category.icon,
      isActive: category.is_active,
      createdAt: category.created_at,
      stats: {
        totalAuctions: parseInt(category.total_auctions),
        activeAuctions: parseInt(category.active_auctions),
        avgPrice: category.avg_price ? parseFloat(category.avg_price) : 0,
        minPrice: category.min_price ? parseFloat(category.min_price) : 0,
        maxPrice: category.max_price ? parseFloat(category.max_price) : 0
      }
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ message: 'Failed to get category' });
  }
});

// Create new category (Admin only)
router.post('/', [
  authenticateToken,
  requireAdmin,
  body('name').isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  body('icon').optional().isURL().withMessage('Icon must be a valid URL')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, description, icon } = req.body;

    // Check if category name already exists
    const existingCategory = await query(
      'SELECT id FROM categories WHERE LOWER(name) = LOWER($1)',
      [name]
    );

    if (existingCategory.rows.length > 0) {
      return res.status(409).json({ message: 'Category name already exists' });
    }

    // Create category
    const result = await query(
      'INSERT INTO categories (name, description, icon) VALUES ($1, $2, $3) RETURNING *',
      [name, description, icon]
    );

    const category = result.rows[0];

    // Clear cache
    await cache.del(CACHE_KEYS.CATEGORIES);

    res.status(201).json({
      message: 'Category created successfully',
      category: {
        id: category.id,
        name: category.name,
        description: category.description,
        icon: category.icon,
        isActive: category.is_active,
        createdAt: category.created_at
      }
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ message: 'Failed to create category' });
  }
});

// Update category (Admin only)
router.put('/:id', [
  authenticateToken,
  requireAdmin,
  body('name').optional().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  body('icon').optional().isURL().withMessage('Icon must be a valid URL'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const categoryId = parseInt(req.params.id);
    
    if (isNaN(categoryId)) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }

    const { name, description, icon, isActive } = req.body;

    // Check if category exists
    const existingCategory = await query('SELECT * FROM categories WHERE id = $1', [categoryId]);
    
    if (existingCategory.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if new name conflicts with existing categories
    if (name) {
      const nameConflict = await query(
        'SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND id != $2',
        [name, categoryId]
      );

      if (nameConflict.rows.length > 0) {
        return res.status(409).json({ message: 'Category name already exists' });
      }
    }

    // Build update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(description);
      paramIndex++;
    }

    if (icon !== undefined) {
      updates.push(`icon = $${paramIndex}`);
      values.push(icon);
      paramIndex++;
    }

    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(isActive);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    values.push(categoryId);
    const updateQuery = `UPDATE categories SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await query(updateQuery, values);
    const category = result.rows[0];

    // Clear cache
    await cache.del(CACHE_KEYS.CATEGORIES);

    res.json({
      message: 'Category updated successfully',
      category: {
        id: category.id,
        name: category.name,
        description: category.description,
        icon: category.icon,
        isActive: category.is_active,
        createdAt: category.created_at
      }
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ message: 'Failed to update category' });
  }
});

// Delete category (Admin only)
router.delete('/:id', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);
    
    if (isNaN(categoryId)) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }

    // Check if category has active auctions
    const activeAuctions = await query(
      'SELECT COUNT(*) as count FROM auctions WHERE category_id = $1 AND status = $2',
      [categoryId, 'active']
    );

    if (parseInt(activeAuctions.rows[0].count) > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete category with active auctions',
        activeAuctions: parseInt(activeAuctions.rows[0].count)
      });
    }

    // Soft delete by setting is_active to false
    const result = await query(
      'UPDATE categories SET is_active = false WHERE id = $1 RETURNING *',
      [categoryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Clear cache
    await cache.del(CACHE_KEYS.CATEGORIES);

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ message: 'Failed to delete category' });
  }
});

// Get popular categories (based on auction count)
router.get('/popular/list', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const result = await query(`
      SELECT 
        c.id, c.name, c.icon,
        COUNT(a.id) as auction_count,
        AVG(a.current_price) as avg_price
      FROM categories c
      JOIN auctions a ON c.id = a.category_id
      WHERE c.is_active = true AND a.status = 'active'
      GROUP BY c.id, c.name, c.icon
      ORDER BY auction_count DESC, avg_price DESC
      LIMIT $1
    `, [limit]);

    const popularCategories = result.rows.map(category => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      auctionCount: parseInt(category.auction_count),
      avgPrice: parseFloat(category.avg_price)
    }));

    res.json({ popularCategories });
  } catch (error) {
    console.error('Get popular categories error:', error);
    res.status(500).json({ message: 'Failed to get popular categories' });
  }
});

module.exports = router;