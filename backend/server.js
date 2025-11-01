const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

// Import database connections
const { pool } = require('./config/database');
const { redisClient } = require('./config/redis');

// Import routes
const authRoutes = require('./routes/auth');
const auctionRoutes = require('./routes/auctions');
const bidRoutes = require('./routes/bids');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const watchlistRoutes = require('./routes/watchlist');
const adminRoutes = require('./routes/admin');

// Import socket handler
const socketHandler = require('./sockets/socketHandler');

// Import scheduler
const scheduler = require('./utils/scheduler');

// Import image processor
const imageProcessor = require('./utils/imageProcessor');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || "http://localhost:3000",
      "http://localhost:5173" // Vite default port
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Initialize socket handler
socketHandler(io);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:3000",
    "http://localhost:5173" // Vite default port
  ],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const services = {
    server: 'running',
    database: 'not_configured',
    redis: 'not_configured',
    scheduler: 'not_configured'
  };

  try {
    // Check database connection (only in production)
    if (process.env.NODE_ENV === 'production') {
      await pool.query('SELECT 1');
      services.database = 'connected';
      
      // Check Redis connection
      await redisClient.ping();
      services.redis = 'connected';
      
      services.scheduler = scheduler.isRunning() ? 'running' : 'stopped';
    }
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'partial',
      timestamp: new Date().toISOString(),
      services,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Received shutdown signal, closing server gracefully...');
  
  try {
    // Stop scheduler
    scheduler.stop();
    
    // Close server
    server.close(() => {
      console.log('HTTP server closed');
    });
    
    // Close database connections
    await pool.end();
    console.log('Database connection closed');
    
    // Close Redis connection
    await redisClient.quit();
    console.log('Redis connection closed');
    
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  
  try {
    // Test database connection (optional for development)
    if (process.env.NODE_ENV === 'production') {
      await pool.query('SELECT NOW()');
      console.log('Database connected successfully');
      
      // Test Redis connection
      await redisClient.ping();
      console.log('Redis connected successfully');
      
      // Start scheduler
      scheduler.start();
      console.log('Scheduler started successfully');
    } else {
      console.log('⚠️  Running in development mode without database connections');
      console.log('📝 To enable full functionality, set up PostgreSQL and Redis');
    }
    
    console.log('✅ Server initialized successfully');
  } catch (error) {
    console.error('⚠️  Failed to initialize external services:', error.message);
    console.log('🔄 Server running in limited mode without database/Redis');
  }
});

module.exports = { app, server, io };