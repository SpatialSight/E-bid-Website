const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken, requireAdmin, requireModerator } = require('../middleware/auth');
const { cache, CACHE_KEYS } = require('../config/redis');

const router = express.Router();

// Get dashboard analytics
router.get('/dashboard', [authenticateToken, requireModerator], async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '30d'; // 7d, 30d, 90d, 1y
    
    let dateFilter = '';
    switch (timeframe) {
      case '7d':
        dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
        break;
      case '90d':
        dateFilter = "AND created_at >= NOW() - INTERVAL '90 days'";
        break;
      case '1y':
        dateFilter = "AND created_at >= NOW() - INTERVAL '1 year'";
        break;
      default:
        dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
    }

    // Get overall statistics
    const statsResult = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE is_active = true) as total_users,
        (SELECT COUNT(*) FROM users WHERE is_active = true ${dateFilter}) as new_users,
        (SELECT COUNT(*) FROM auctions) as total_auctions,
        (SELECT COUNT(*) FROM auctions WHERE status = 'active') as active_auctions,
        (SELECT COUNT(*) FROM auctions ${dateFilter}) as new_auctions,
        (SELECT COUNT(*) FROM bids ${dateFilter}) as new_bids,
        (SELECT SUM(amount) FROM bids WHERE created_at >= NOW() - INTERVAL '30 days') as total_bid_volume,
        (SELECT COUNT(*) FROM reports WHERE status = 'pending') as pending_reports
    `);

    // Get revenue data (completed auctions)
    const revenueResult = await query(`
      SELECT 
        SUM(final_price) as total_revenue,
        COUNT(*) as completed_auctions,
        AVG(final_price) as avg_sale_price
      FROM auctions 
      WHERE status = 'completed' ${dateFilter}
    `);

    // Get category distribution
    const categoryResult = await query(`
      SELECT 
        c.name,
        COUNT(a.id) as auction_count,
        AVG(a.current_price) as avg_price
      FROM categories c
      LEFT JOIN auctions a ON c.id = a.category_id AND a.status = 'active'
      WHERE c.is_active = true
      GROUP BY c.id, c.name
      ORDER BY auction_count DESC
      LIMIT 10
    `);

    // Get daily activity for chart
    const activityResult = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(CASE WHEN table_name = 'users' THEN 1 END) as new_users,
        COUNT(CASE WHEN table_name = 'auctions' THEN 1 END) as new_auctions,
        COUNT(CASE WHEN table_name = 'bids' THEN 1 END) as new_bids
      FROM (
        SELECT created_at, 'users' as table_name FROM users WHERE created_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT created_at, 'auctions' as table_name FROM auctions WHERE created_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT created_at, 'bids' as table_name FROM bids WHERE created_at >= NOW() - INTERVAL '30 days'
      ) combined
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    const stats = statsResult.rows[0];
    const revenue = revenueResult.rows[0];

    res.json({
      overview: {
        totalUsers: parseInt(stats.total_users),
        newUsers: parseInt(stats.new_users),
        totalAuctions: parseInt(stats.total_auctions),
        activeAuctions: parseInt(stats.active_auctions),
        newAuctions: parseInt(stats.new_auctions),
        newBids: parseInt(stats.new_bids),
        totalBidVolume: revenue.total_revenue ? parseFloat(revenue.total_revenue) : 0,
        pendingReports: parseInt(stats.pending_reports)
      },
      revenue: {
        totalRevenue: revenue.total_revenue ? parseFloat(revenue.total_revenue) : 0,
        completedAuctions: parseInt(revenue.completed_auctions),
        avgSalePrice: revenue.avg_sale_price ? parseFloat(revenue.avg_sale_price) : 0
      },
      categories: categoryResult.rows.map(cat => ({
        name: cat.name,
        auctionCount: parseInt(cat.auction_count),
        avgPrice: cat.avg_price ? parseFloat(cat.avg_price) : 0
      })),
      dailyActivity: activityResult.rows.map(day => ({
        date: day.date,
        newUsers: parseInt(day.new_users),
        newAuctions: parseInt(day.new_auctions),
        newBids: parseInt(day.new_bids)
      }))
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ message: 'Failed to get dashboard data' });
  }
});

// Get reports list
router.get('/reports', [authenticateToken, requireModerator], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;
    const status = req.query.status || 'all';
    const type = req.query.type || 'all';

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (status !== 'all') {
      whereConditions.push(`r.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (type !== 'all') {
      whereConditions.push(`r.type = $${paramIndex}`);
      queryParams.push(type);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    queryParams.push(limit, offset);

    const result = await query(`
      SELECT 
        r.id, r.type, r.reason, r.description, r.status, r.created_at, r.resolved_at,
        r.auction_id, r.reported_user_id,
        u1.username as reporter_username,
        u2.username as reported_username,
        a.title as auction_title,
        u3.username as resolved_by_username
      FROM reports r
      JOIN users u1 ON r.reporter_id = u1.id
      LEFT JOIN users u2 ON r.reported_user_id = u2.id
      LEFT JOIN auctions a ON r.auction_id = a.id
      LEFT JOIN users u3 ON r.resolved_by = u3.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, queryParams);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total FROM reports r ${whereClause}
    `, queryParams.slice(0, -2));

    const reports = result.rows.map(report => ({
      id: report.id,
      type: report.type,
      reason: report.reason,
      description: report.description,
      status: report.status,
      createdAt: report.created_at,
      resolvedAt: report.resolved_at,
      reporter: {
        username: report.reporter_username
      },
      reported: {
        username: report.reported_username
      },
      auction: report.auction_title ? {
        id: report.auction_id,
        title: report.auction_title
      } : null,
      resolvedBy: report.resolved_by_username ? {
        username: report.resolved_by_username
      } : null
    }));

    const totalCount = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      reports,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ message: 'Failed to get reports' });
  }
});

// Resolve report
router.put('/reports/:id/resolve', [
  authenticateToken,
  requireModerator,
  body('action').isIn(['dismiss', 'warn', 'suspend', 'ban']).withMessage('Invalid action'),
  body('notes').optional().isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const reportId = parseInt(req.params.id);
    const { action, notes } = req.body;

    if (isNaN(reportId)) {
      return res.status(400).json({ message: 'Invalid report ID' });
    }

    // Get report details
    const reportResult = await query(
      'SELECT * FROM reports WHERE id = $1 AND status = $2',
      [reportId, 'pending']
    );

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ message: 'Report not found or already resolved' });
    }

    const report = reportResult.rows[0];

    // Start transaction
    await query('BEGIN');

    try {
      // Update report status
      await query(
        'UPDATE reports SET status = $1, resolved_by = $2, resolved_at = NOW(), resolution_notes = $3 WHERE id = $4',
        ['resolved', req.user.id, notes, reportId]
      );

      // Apply action to reported user if applicable
      if (report.reported_user_id && action !== 'dismiss') {
        switch (action) {
          case 'warn':
            // Create warning notification
            await query(
              'INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
              [
                report.reported_user_id,
                'warning',
                'Account Warning',
                `You have received a warning for: ${report.reason}. ${notes || ''}`
              ]
            );
            break;

          case 'suspend':
            // Suspend user for 7 days
            await query(
              'UPDATE users SET is_active = false, suspension_end = NOW() + INTERVAL \'7 days\' WHERE id = $1',
              [report.reported_user_id]
            );
            
            // End their active auctions
            await query(
              'UPDATE auctions SET status = $1, end_time = NOW() WHERE seller_id = $2 AND status = $3',
              ['ended', report.reported_user_id, 'active']
            );
            break;

          case 'ban':
            // Permanently ban user
            await query(
              'UPDATE users SET is_active = false, is_banned = true WHERE id = $1',
              [report.reported_user_id]
            );
            
            // End their active auctions
            await query(
              'UPDATE auctions SET status = $1, end_time = NOW() WHERE seller_id = $2 AND status = $3',
              ['ended', report.reported_user_id, 'active']
            );
            break;
        }
      }

      // Handle auction-specific actions
      if (report.auction_id && (action === 'suspend' || action === 'ban')) {
        await query(
          'UPDATE auctions SET status = $1, end_time = NOW() WHERE id = $2',
          ['removed', report.auction_id]
        );
      }

      await query('COMMIT');

      res.json({ message: 'Report resolved successfully' });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Resolve report error:', error);
    res.status(500).json({ message: 'Failed to resolve report' });
  }
});

// Get system settings
router.get('/settings', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const result = await query('SELECT key, value, description FROM system_settings ORDER BY key');
    
    const settings = {};
    result.rows.forEach(setting => {
      settings[setting.key] = {
        value: setting.value,
        description: setting.description
      };
    });

    res.json({ settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Failed to get settings' });
  }
});

// Update system settings
router.put('/settings', [
  authenticateToken,
  requireAdmin,
  body('settings').isObject().withMessage('Settings must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { settings } = req.body;

    // Start transaction
    await query('BEGIN');

    try {
      for (const [key, value] of Object.entries(settings)) {
        await query(
          'UPDATE system_settings SET value = $1 WHERE key = $2',
          [value, key]
        );
      }

      await query('COMMIT');

      // Clear relevant caches
      await cache.del(CACHE_KEYS.SYSTEM_SETTINGS);

      res.json({ message: 'Settings updated successfully' });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

// Get audit logs
router.get('/audit-logs', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;
    const action = req.query.action || '';
    const userId = req.query.userId || '';

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (action) {
      whereConditions.push(`action = $${paramIndex}`);
      queryParams.push(action);
      paramIndex++;
    }

    if (userId) {
      whereConditions.push(`user_id = $${paramIndex}`);
      queryParams.push(parseInt(userId));
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    queryParams.push(limit, offset);

    const result = await query(`
      SELECT 
        al.id, al.user_id, al.action, al.resource_type, al.resource_id,
        al.details, al.ip_address, al.user_agent, al.created_at,
        u.username
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, queryParams);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total FROM audit_logs ${whereClause}
    `, queryParams.slice(0, -2));

    const logs = result.rows.map(log => ({
      id: log.id,
      userId: log.user_id,
      username: log.username,
      action: log.action,
      resourceType: log.resource_type,
      resourceId: log.resource_id,
      details: log.details,
      ipAddress: log.ip_address,
      userAgent: log.user_agent,
      createdAt: log.created_at
    }));

    const totalCount = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      logs,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ message: 'Failed to get audit logs' });
  }
});

// Create system announcement
router.post('/announcements', [
  authenticateToken,
  requireAdmin,
  body('title').isLength({ min: 5, max: 200 }).withMessage('Title must be 5-200 characters'),
  body('message').isLength({ min: 10, max: 2000 }).withMessage('Message must be 10-2000 characters'),
  body('type').isIn(['info', 'warning', 'maintenance', 'update']).withMessage('Invalid announcement type'),
  body('priority').isIn(['low', 'medium', 'high']).withMessage('Invalid priority'),
  body('expiresAt').optional().isISO8601().withMessage('Invalid expiration date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { title, message, type, priority, expiresAt } = req.body;

    const result = await query(
      'INSERT INTO announcements (title, message, type, priority, expires_at, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, message, type, priority, expiresAt, req.user.id]
    );

    const announcement = result.rows[0];

    res.status(201).json({
      message: 'Announcement created successfully',
      announcement: {
        id: announcement.id,
        title: announcement.title,
        message: announcement.message,
        type: announcement.type,
        priority: announcement.priority,
        expiresAt: announcement.expires_at,
        createdAt: announcement.created_at
      }
    });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ message: 'Failed to create announcement' });
  }
});

// Get active announcements
router.get('/announcements/active', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        id, title, message, type, priority, created_at, expires_at
      FROM announcements 
      WHERE is_active = true 
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY priority DESC, created_at DESC
    `);

    const announcements = result.rows.map(announcement => ({
      id: announcement.id,
      title: announcement.title,
      message: announcement.message,
      type: announcement.type,
      priority: announcement.priority,
      createdAt: announcement.created_at,
      expiresAt: announcement.expires_at
    }));

    res.json({ announcements });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ message: 'Failed to get announcements' });
  }
});

// Export data (CSV format)
router.get('/export/:type', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const type = req.params.type;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let query_text = '';
    let filename = '';

    switch (type) {
      case 'users':
        query_text = `
          SELECT 
            id, username, email, full_name, role, is_verified, is_active, 
            created_at, last_login
          FROM users 
          WHERE created_at BETWEEN $1 AND $2
          ORDER BY created_at DESC
        `;
        filename = 'users_export.csv';
        break;

      case 'auctions':
        query_text = `
          SELECT 
            a.id, a.title, a.starting_price, a.current_price, a.final_price,
            a.status, a.created_at, a.end_time, u.username as seller,
            c.name as category
          FROM auctions a
          JOIN users u ON a.seller_id = u.id
          JOIN categories c ON a.category_id = c.id
          WHERE a.created_at BETWEEN $1 AND $2
          ORDER BY a.created_at DESC
        `;
        filename = 'auctions_export.csv';
        break;

      case 'bids':
        query_text = `
          SELECT 
            b.id, b.amount, b.created_at, u.username as bidder,
            a.title as auction_title
          FROM bids b
          JOIN users u ON b.user_id = u.id
          JOIN auctions a ON b.auction_id = a.id
          WHERE b.created_at BETWEEN $1 AND $2
          ORDER BY b.created_at DESC
        `;
        filename = 'bids_export.csv';
        break;

      default:
        return res.status(400).json({ message: 'Invalid export type' });
    }

    const result = await query(query_text, [startDate, endDate]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No data found for the specified date range' });
    }

    // Convert to CSV
    const headers = Object.keys(result.rows[0]);
    const csvContent = [
      headers.join(','),
      ...result.rows.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ message: 'Failed to export data' });
  }
});

module.exports = router;