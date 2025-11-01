const { query } = require('../config/database');
const { cache, realtime } = require('../config/redis');
const nodemailer = require('nodemailer');

// Email transporter configuration
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Notification types
const NOTIFICATION_TYPES = {
  BID_PLACED: 'bid_placed',
  BID_OUTBID: 'bid_outbid',
  AUCTION_ENDING: 'auction_ending',
  AUCTION_WON: 'auction_won',
  AUCTION_LOST: 'auction_lost',
  AUCTION_SOLD: 'auction_sold',
  PAYMENT_RECEIVED: 'payment_received',
  ITEM_SHIPPED: 'item_shipped',
  ITEM_DELIVERED: 'item_delivered',
  WATCHLIST_ENDING: 'watchlist_ending',
  PRICE_DROP: 'price_drop',
  NEW_MESSAGE: 'new_message',
  ACCOUNT_WARNING: 'account_warning',
  SYSTEM_ANNOUNCEMENT: 'system_announcement'
};

// Create notification in database
async function createNotification(userId, type, title, message, data = {}) {
  try {
    const result = await query(
      'INSERT INTO notifications (user_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, type, title, message, JSON.stringify(data)]
    );

    const notification = result.rows[0];

    // Send real-time notification
    await realtime.publish(`user:${userId}:notifications`, {
      type: 'new_notification',
      notification: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        createdAt: notification.created_at,
        isRead: false
      }
    });

    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    throw error;
  }
}

// Send email notification
async function sendEmailNotification(email, subject, htmlContent, textContent = null) {
  try {
    if (!process.env.SMTP_HOST) {
      console.log('SMTP not configured, skipping email notification');
      return;
    }

    const mailOptions = {
      from: `"${process.env.APP_NAME}" <${process.env.SMTP_FROM}>`,
      to: email,
      subject: subject,
      html: htmlContent,
      text: textContent || htmlContent.replace(/<[^>]*>/g, '') // Strip HTML for text version
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`Email sent to ${email}: ${subject}`);
  } catch (error) {
    console.error('Send email error:', error);
    // Don't throw error to prevent breaking the main flow
  }
}

// Send WhatsApp notification (placeholder for future implementation)
async function sendWhatsAppNotification(phoneNumber, message) {
  try {
    if (!process.env.WHATSAPP_API_KEY) {
      console.log('WhatsApp API not configured, skipping WhatsApp notification');
      return;
    }

    // TODO: Implement WhatsApp Business API integration
    console.log(`WhatsApp notification to ${phoneNumber}: ${message}`);
  } catch (error) {
    console.error('Send WhatsApp error:', error);
  }
}

// Get user notification preferences
async function getUserNotificationPreferences(userId) {
  try {
    const result = await query(
      'SELECT email_notifications, push_notifications, whatsapp_notifications FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return { email: true, push: true, whatsapp: false }; // Default preferences
    }

    const user = result.rows[0];
    return {
      email: user.email_notifications,
      push: user.push_notifications,
      whatsapp: user.whatsapp_notifications
    };
  } catch (error) {
    console.error('Get notification preferences error:', error);
    return { email: true, push: true, whatsapp: false };
  }
}

// Comprehensive notification sender
async function sendNotification(userId, type, title, message, data = {}, options = {}) {
  try {
    // Create database notification
    const notification = await createNotification(userId, type, title, message, data);

    // Get user details and preferences
    const userResult = await query(
      'SELECT email, phone, email_notifications, push_notifications, whatsapp_notifications FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      console.error('User not found for notification:', userId);
      return notification;
    }

    const user = userResult.rows[0];
    const preferences = {
      email: user.email_notifications,
      push: user.push_notifications,
      whatsapp: user.whatsapp_notifications
    };

    // Send email notification if enabled
    if (preferences.email && user.email && !options.skipEmail) {
      const emailTemplate = getEmailTemplate(type, title, message, data);
      await sendEmailNotification(user.email, emailTemplate.subject, emailTemplate.html);
    }

    // Send WhatsApp notification if enabled
    if (preferences.whatsapp && user.phone && !options.skipWhatsApp) {
      await sendWhatsAppNotification(user.phone, `${title}\n${message}`);
    }

    return notification;
  } catch (error) {
    console.error('Send notification error:', error);
    throw error;
  }
}

// Email templates
function getEmailTemplate(type, title, message, data) {
  const baseTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
            .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 4px; }
            .auction-details { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${process.env.APP_NAME || 'PC Parts Auction'}</h1>
            </div>
            <div class="content">
                <h2>${title}</h2>
                <p>${message}</p>
                {{CONTENT}}
            </div>
            <div class="footer">
                <p>This is an automated message from ${process.env.APP_NAME || 'PC Parts Auction'}.</p>
                <p>If you no longer wish to receive these notifications, you can update your preferences in your account settings.</p>
            </div>
        </div>
    </body>
    </html>
  `;

  let content = '';
  let subject = title;

  switch (type) {
    case NOTIFICATION_TYPES.BID_PLACED:
      subject = `New bid on "${data.auctionTitle}"`;
      content = `
        <div class="auction-details">
          <h3>${data.auctionTitle}</h3>
          <p><strong>New Bid:</strong> $${data.bidAmount}</p>
          <p><strong>Bidder:</strong> ${data.bidderUsername}</p>
          <p><strong>Time Remaining:</strong> ${data.timeRemaining}</p>
          <a href="${process.env.FRONTEND_URL}/auctions/${data.auctionId}" class="button">View Auction</a>
        </div>
      `;
      break;

    case NOTIFICATION_TYPES.BID_OUTBID:
      subject = `You've been outbid on "${data.auctionTitle}"`;
      content = `
        <div class="auction-details">
          <h3>${data.auctionTitle}</h3>
          <p><strong>Your Bid:</strong> $${data.yourBid}</p>
          <p><strong>Current Highest Bid:</strong> $${data.currentBid}</p>
          <p><strong>Time Remaining:</strong> ${data.timeRemaining}</p>
          <a href="${process.env.FRONTEND_URL}/auctions/${data.auctionId}" class="button">Place New Bid</a>
        </div>
      `;
      break;

    case NOTIFICATION_TYPES.AUCTION_ENDING:
      subject = `Auction ending soon: "${data.auctionTitle}"`;
      content = `
        <div class="auction-details">
          <h3>${data.auctionTitle}</h3>
          <p><strong>Current Price:</strong> $${data.currentPrice}</p>
          <p><strong>Time Remaining:</strong> ${data.timeRemaining}</p>
          <p>Don't miss out on this auction!</p>
          <a href="${process.env.FRONTEND_URL}/auctions/${data.auctionId}" class="button">View Auction</a>
        </div>
      `;
      break;

    case NOTIFICATION_TYPES.AUCTION_WON:
      subject = `Congratulations! You won "${data.auctionTitle}"`;
      content = `
        <div class="auction-details">
          <h3>${data.auctionTitle}</h3>
          <p><strong>Winning Bid:</strong> $${data.winningBid}</p>
          <p><strong>Seller:</strong> ${data.sellerUsername}</p>
          <p>Please proceed with payment to complete your purchase.</p>
          <a href="${process.env.FRONTEND_URL}/orders/${data.orderId}" class="button">Complete Purchase</a>
        </div>
      `;
      break;

    case NOTIFICATION_TYPES.AUCTION_SOLD:
      subject = `Your auction "${data.auctionTitle}" has sold!`;
      content = `
        <div class="auction-details">
          <h3>${data.auctionTitle}</h3>
          <p><strong>Final Price:</strong> $${data.finalPrice}</p>
          <p><strong>Winner:</strong> ${data.winnerUsername}</p>
          <p>Please wait for payment confirmation before shipping the item.</p>
          <a href="${process.env.FRONTEND_URL}/seller/orders/${data.orderId}" class="button">Manage Order</a>
        </div>
      `;
      break;

    default:
      content = `<p>For more details, please visit your account dashboard.</p>`;
  }

  const html = baseTemplate.replace('{{CONTENT}}', content);

  return { subject, html };
}

// Bulk notification functions
async function notifyAuctionBidders(auctionId, excludeUserId, type, title, message, data) {
  try {
    // Get all bidders for this auction (excluding the current bidder)
    const result = await query(`
      SELECT DISTINCT user_id 
      FROM bids 
      WHERE auction_id = $1 AND user_id != $2
    `, [auctionId, excludeUserId]);

    const notifications = result.rows.map(row => 
      sendNotification(row.user_id, type, title, message, data)
    );

    await Promise.all(notifications);
  } catch (error) {
    console.error('Notify auction bidders error:', error);
  }
}

async function notifyWatchlistUsers(auctionId, type, title, message, data) {
  try {
    // Get all users watching this auction
    const result = await query(`
      SELECT user_id 
      FROM watchlist 
      WHERE auction_id = $1
    `, [auctionId]);

    const notifications = result.rows.map(row => 
      sendNotification(row.user_id, type, title, message, data)
    );

    await Promise.all(notifications);
  } catch (error) {
    console.error('Notify watchlist users error:', error);
  }
}

// Scheduled notification functions
async function sendAuctionEndingReminders() {
  try {
    // Find auctions ending in the next hour
    const result = await query(`
      SELECT 
        a.id, a.title, a.current_price, a.end_time, a.seller_id,
        EXTRACT(EPOCH FROM (a.end_time - NOW())) / 60 as minutes_remaining
      FROM auctions a
      WHERE a.status = 'active' 
        AND a.end_time > NOW() 
        AND a.end_time <= NOW() + INTERVAL '1 hour'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n 
          WHERE n.type = 'auction_ending' 
            AND n.data->>'auctionId' = a.id::text 
            AND n.created_at > NOW() - INTERVAL '2 hours'
        )
    `);

    for (const auction of result.rows) {
      const timeRemaining = `${Math.round(auction.minutes_remaining)} minutes`;
      
      // Notify watchlist users
      await notifyWatchlistUsers(
        auction.id,
        NOTIFICATION_TYPES.AUCTION_ENDING,
        'Auction Ending Soon!',
        `The auction "${auction.title}" is ending in ${timeRemaining}.`,
        {
          auctionId: auction.id,
          auctionTitle: auction.title,
          currentPrice: auction.current_price,
          timeRemaining
        }
      );

      // Notify current bidders
      await notifyAuctionBidders(
        auction.id,
        null, // Don't exclude anyone
        NOTIFICATION_TYPES.AUCTION_ENDING,
        'Auction Ending Soon!',
        `The auction "${auction.title}" you're bidding on is ending in ${timeRemaining}.`,
        {
          auctionId: auction.id,
          auctionTitle: auction.title,
          currentPrice: auction.current_price,
          timeRemaining
        }
      );
    }

    console.log(`Sent ending reminders for ${result.rows.length} auctions`);
  } catch (error) {
    console.error('Send auction ending reminders error:', error);
  }
}

async function sendDailyWatchlistDigest() {
  try {
    // Get users with watchlist items ending in the next 24 hours
    const result = await query(`
      SELECT 
        w.user_id,
        u.email,
        u.username,
        COUNT(a.id) as ending_count,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', a.id,
            'title', a.title,
            'currentPrice', a.current_price,
            'endTime', a.end_time
          )
        ) as auctions
      FROM watchlist w
      JOIN users u ON w.user_id = u.id
      JOIN auctions a ON w.auction_id = a.id
      WHERE a.status = 'active'
        AND a.end_time > NOW()
        AND a.end_time <= NOW() + INTERVAL '24 hours'
        AND u.email_notifications = true
      GROUP BY w.user_id, u.email, u.username
      HAVING COUNT(a.id) > 0
    `);

    for (const user of result.rows) {
      await sendNotification(
        user.user_id,
        NOTIFICATION_TYPES.WATCHLIST_ENDING,
        'Watchlist Items Ending Soon',
        `You have ${user.ending_count} watched auction(s) ending in the next 24 hours.`,
        {
          endingCount: user.ending_count,
          auctions: user.auctions
        }
      );
    }

    console.log(`Sent watchlist digests to ${result.rows.length} users`);
  } catch (error) {
    console.error('Send daily watchlist digest error:', error);
  }
}

module.exports = {
  NOTIFICATION_TYPES,
  createNotification,
  sendNotification,
  sendEmailNotification,
  sendWhatsAppNotification,
  getUserNotificationPreferences,
  notifyAuctionBidders,
  notifyWatchlistUsers,
  sendAuctionEndingReminders,
  sendDailyWatchlistDigest
};