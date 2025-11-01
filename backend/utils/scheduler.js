const cron = require('node-cron');
const { query } = require('../config/database');
const { realtime } = require('../config/redis');
const { 
  sendAuctionEndingReminders, 
  sendDailyWatchlistDigest,
  sendNotification,
  NOTIFICATION_TYPES 
} = require('./notifications');

class AuctionScheduler {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('Scheduler is already running');
      return;
    }

    console.log('Starting auction scheduler...');
    this.isRunning = true;

    // Check for ending auctions every minute
    this.jobs.set('endAuctions', cron.schedule('* * * * *', () => {
      this.processEndingAuctions();
    }, { scheduled: false }));

    // Send auction ending reminders every 15 minutes
    this.jobs.set('endingReminders', cron.schedule('*/15 * * * *', () => {
      sendAuctionEndingReminders();
    }, { scheduled: false }));

    // Send daily watchlist digest at 9 AM
    this.jobs.set('watchlistDigest', cron.schedule('0 9 * * *', () => {
      sendDailyWatchlistDigest();
    }, { scheduled: false }));

    // Clean up expired notifications daily at 2 AM
    this.jobs.set('cleanupNotifications', cron.schedule('0 2 * * *', () => {
      this.cleanupExpiredNotifications();
    }, { scheduled: false }));

    // Clean up expired sessions daily at 3 AM
    this.jobs.set('cleanupSessions', cron.schedule('0 3 * * *', () => {
      this.cleanupExpiredSessions();
    }, { scheduled: false }));

    // Update auction statistics hourly
    this.jobs.set('updateStats', cron.schedule('0 * * * *', () => {
      this.updateAuctionStatistics();
    }, { scheduled: false }));

    // Process proxy bids every 30 seconds
    this.jobs.set('proxyBids', cron.schedule('*/30 * * * * *', () => {
      this.processProxyBids();
    }, { scheduled: false }));

    // Start all jobs
    this.jobs.forEach(job => job.start());

    console.log('Scheduler started with', this.jobs.size, 'jobs');
  }

  stop() {
    if (!this.isRunning) {
      console.log('Scheduler is not running');
      return;
    }

    console.log('Stopping auction scheduler...');
    
    this.jobs.forEach(job => job.stop());
    this.jobs.clear();
    this.isRunning = false;

    console.log('Scheduler stopped');
  }

  async processEndingAuctions() {
    try {
      // Find auctions that should end now
      const result = await query(`
        SELECT 
          a.id, a.title, a.seller_id, a.current_price, a.reserve_price,
          a.starting_price, a.end_time,
          (SELECT user_id FROM bids WHERE auction_id = a.id ORDER BY amount DESC, created_at ASC LIMIT 1) as winner_id,
          (SELECT amount FROM bids WHERE auction_id = a.id ORDER BY amount DESC, created_at ASC LIMIT 1) as winning_bid
        FROM auctions a
        WHERE a.status = 'active' AND a.end_time <= NOW()
      `);

      for (const auction of result.rows) {
        await this.endAuction(auction);
      }

      if (result.rows.length > 0) {
        console.log(`Processed ${result.rows.length} ending auctions`);
      }
    } catch (error) {
      console.error('Process ending auctions error:', error);
    }
  }

  async endAuction(auction) {
    try {
      await query('BEGIN');

      let status = 'ended';
      let winnerId = null;
      let finalPrice = auction.starting_price;

      // Check if auction has bids and meets reserve price
      if (auction.winner_id && auction.winning_bid) {
        if (!auction.reserve_price || auction.winning_bid >= auction.reserve_price) {
          status = 'completed';
          winnerId = auction.winner_id;
          finalPrice = auction.winning_bid;
        }
      }

      // Update auction status
      await query(
        'UPDATE auctions SET status = $1, winner_id = $2, final_price = $3 WHERE id = $4',
        [status, winnerId, finalPrice, auction.id]
      );

      // Create order if auction was completed
      if (status === 'completed') {
        await query(
          'INSERT INTO orders (auction_id, seller_id, buyer_id, amount, status) VALUES ($1, $2, $3, $4, $5)',
          [auction.id, auction.seller_id, winnerId, finalPrice, 'pending_payment']
        );

        // Notify winner
        await sendNotification(
          winnerId,
          NOTIFICATION_TYPES.AUCTION_WON,
          'Congratulations! You won an auction',
          `You won the auction for "${auction.title}" with a bid of $${finalPrice}.`,
          {
            auctionId: auction.id,
            auctionTitle: auction.title,
            winningBid: finalPrice
          }
        );

        // Notify seller
        await sendNotification(
          auction.seller_id,
          NOTIFICATION_TYPES.AUCTION_SOLD,
          'Your auction has sold!',
          `Your auction "${auction.title}" sold for $${finalPrice}.`,
          {
            auctionId: auction.id,
            auctionTitle: auction.title,
            finalPrice: finalPrice,
            winnerId: winnerId
          }
        );
      } else {
        // Notify seller that auction ended without sale
        await sendNotification(
          auction.seller_id,
          NOTIFICATION_TYPES.AUCTION_LOST,
          'Your auction has ended',
          `Your auction "${auction.title}" has ended without meeting the reserve price.`,
          {
            auctionId: auction.id,
            auctionTitle: auction.title,
            finalPrice: auction.current_price,
            reservePrice: auction.reserve_price
          }
        );
      }

      // Notify all bidders who didn't win
      if (winnerId) {
        const biddersResult = await query(
          'SELECT DISTINCT user_id FROM bids WHERE auction_id = $1 AND user_id != $2',
          [auction.id, winnerId]
        );

        for (const bidder of biddersResult.rows) {
          await sendNotification(
            bidder.user_id,
            NOTIFICATION_TYPES.AUCTION_LOST,
            'Auction ended',
            `The auction for "${auction.title}" has ended. Unfortunately, you didn't win this time.`,
            {
              auctionId: auction.id,
              auctionTitle: auction.title,
              winningBid: finalPrice
            }
          );
        }
      }

      // Send real-time update
      await realtime.publish(`auction:${auction.id}`, {
        type: 'auction_ended',
        auction: {
          id: auction.id,
          status: status,
          winnerId: winnerId,
          finalPrice: finalPrice
        }
      });

      await query('COMMIT');
      console.log(`Auction ${auction.id} ended with status: ${status}`);
    } catch (error) {
      await query('ROLLBACK');
      console.error(`Error ending auction ${auction.id}:`, error);
    }
  }

  async processProxyBids() {
    try {
      // Find active proxy bids that can be executed
      const result = await query(`
        SELECT 
          pb.id, pb.user_id, pb.auction_id, pb.max_amount, pb.increment,
          a.current_price, a.end_time, a.status,
          (SELECT amount FROM bids WHERE auction_id = pb.auction_id ORDER BY amount DESC, created_at ASC LIMIT 1) as highest_bid,
          (SELECT user_id FROM bids WHERE auction_id = pb.auction_id ORDER BY amount DESC, created_at ASC LIMIT 1) as highest_bidder
        FROM proxy_bids pb
        JOIN auctions a ON pb.auction_id = a.id
        WHERE pb.is_active = true 
          AND a.status = 'active' 
          AND a.end_time > NOW()
          AND pb.max_amount > a.current_price
      `);

      for (const proxyBid of result.rows) {
        // Skip if user is already the highest bidder
        if (proxyBid.highest_bidder === proxyBid.user_id) {
          continue;
        }

        // Calculate next bid amount
        const currentPrice = parseFloat(proxyBid.current_price);
        const increment = parseFloat(proxyBid.increment);
        const maxAmount = parseFloat(proxyBid.max_amount);
        const nextBidAmount = currentPrice + increment;

        // Check if proxy bid can cover the next bid
        if (nextBidAmount <= maxAmount) {
          await this.executeProxyBid(proxyBid, nextBidAmount);
        }
      }
    } catch (error) {
      console.error('Process proxy bids error:', error);
    }
  }

  async executeProxyBid(proxyBid, bidAmount) {
    try {
      await query('BEGIN');

      // Place the bid
      const bidResult = await query(
        'INSERT INTO bids (auction_id, user_id, amount, is_proxy) VALUES ($1, $2, $3, $4) RETURNING *',
        [proxyBid.auction_id, proxyBid.user_id, bidAmount, true]
      );

      // Update auction current price
      await query(
        'UPDATE auctions SET current_price = $1 WHERE id = $2',
        [bidAmount, proxyBid.auction_id]
      );

      // Check if proxy bid is exhausted
      if (bidAmount >= proxyBid.max_amount) {
        await query(
          'UPDATE proxy_bids SET is_active = false WHERE id = $1',
          [proxyBid.id]
        );
      }

      await query('COMMIT');

      // Send real-time update
      await realtime.publish(`auction:${proxyBid.auction_id}`, {
        type: 'new_bid',
        bid: {
          id: bidResult.rows[0].id,
          amount: bidAmount,
          userId: proxyBid.user_id,
          isProxy: true,
          createdAt: bidResult.rows[0].created_at
        }
      });

      console.log(`Executed proxy bid: $${bidAmount} for auction ${proxyBid.auction_id}`);
    } catch (error) {
      await query('ROLLBACK');
      console.error('Execute proxy bid error:', error);
    }
  }

  async cleanupExpiredNotifications() {
    try {
      // Delete notifications older than 30 days
      const result = await query(
        'DELETE FROM notifications WHERE created_at < NOW() - INTERVAL \'30 days\''
      );

      console.log(`Cleaned up ${result.rowCount} expired notifications`);
    } catch (error) {
      console.error('Cleanup expired notifications error:', error);
    }
  }

  async cleanupExpiredSessions() {
    try {
      // This would clean up session storage if we were using database sessions
      // For now, we'll clean up expired password reset tokens
      const result = await query(
        'DELETE FROM password_reset_tokens WHERE expires_at < NOW()'
      );

      console.log(`Cleaned up ${result.rowCount} expired password reset tokens`);
    } catch (error) {
      console.error('Cleanup expired sessions error:', error);
    }
  }

  async updateAuctionStatistics() {
    try {
      // Update auction view counts, bid counts, etc.
      await query(`
        UPDATE auctions SET 
          bid_count = (SELECT COUNT(*) FROM bids WHERE auction_id = auctions.id),
          view_count = COALESCE(view_count, 0),
          watch_count = (SELECT COUNT(*) FROM watchlist WHERE auction_id = auctions.id)
        WHERE status IN ('active', 'scheduled')
      `);

      // Update user statistics
      await query(`
        UPDATE users SET 
          total_auctions = (SELECT COUNT(*) FROM auctions WHERE seller_id = users.id),
          active_auctions = (SELECT COUNT(*) FROM auctions WHERE seller_id = users.id AND status = 'active'),
          total_bids = (SELECT COUNT(*) FROM bids WHERE user_id = users.id)
      `);

      console.log('Updated auction and user statistics');
    } catch (error) {
      console.error('Update auction statistics error:', error);
    }
  }

  // Manual methods for testing
  async processAuctionEnding(auctionId) {
    try {
      const result = await query(
        'SELECT * FROM auctions WHERE id = $1 AND status = $2',
        [auctionId, 'active']
      );

      if (result.rows.length > 0) {
        await this.endAuction(result.rows[0]);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Manual process auction ending error:', error);
      return false;
    }
  }

  getJobStatus() {
    const status = {};
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.running,
        scheduled: job.scheduled
      };
    });
    return {
      isRunning: this.isRunning,
      totalJobs: this.jobs.size,
      jobs: status
    };
  }
}

// Create singleton instance
const scheduler = new AuctionScheduler();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT, stopping scheduler...');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, stopping scheduler...');
  scheduler.stop();
  process.exit(0);
});

module.exports = scheduler;