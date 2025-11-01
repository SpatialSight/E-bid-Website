# E-bid Auction Platform

A comprehensive auction platform with TikTok-style vertical feed, real-time bidding, and advanced features for buyers and sellers.

## 🚀 Features

### Core Functionality
- **TikTok-style Vertical Feed**: Swipe through auctions with infinite scroll
- **Real-time Bidding**: Live bidding with Socket.IO integration
- **Proxy Bidding**: Automated bidding up to user-defined maximum
- **Anti-sniping**: Automatic auction extensions for last-minute bids
- **Buy Now Option**: Instant purchase functionality
- **Watchlist**: Save and track favorite auctions
- **Advanced Search & Filtering**: Category, price, condition, location filters

### User Management
- **Multi-role System**: Buyer, Seller, Admin, Moderator roles
- **User Profiles**: Comprehensive profiles with ratings and statistics
- **Rating System**: Peer-to-peer rating after transactions
- **Authentication**: JWT-based secure authentication

### Seller Features
- **Auction Creation**: Rich auction listings with multiple images
- **Auction Management**: Edit, extend, or end auctions
- **Sales Analytics**: Track performance and earnings
- **Bulk Operations**: Manage multiple auctions efficiently

### Admin Features
- **Dashboard Analytics**: Revenue, user activity, and system metrics
- **Content Moderation**: Review and manage reported content
- **User Management**: Manage user roles and permissions
- **System Settings**: Configure platform-wide settings
- **Audit Logs**: Track all system activities

### Technical Features
- **Real-time Updates**: Live notifications and updates
- **Image Processing**: Automatic image optimization and thumbnails
- **Caching**: Redis-based caching for performance
- **Email Notifications**: Comprehensive email system
- **Scheduled Tasks**: Automated auction processing and cleanup
- **Rate Limiting**: API protection and abuse prevention

## 🛠 Technology Stack

### Backend
- **Node.js** with Express.js framework
- **PostgreSQL** for primary database
- **Redis** for caching and real-time features
- **Socket.IO** for real-time communication
- **JWT** for authentication
- **Multer** for file uploads
- **Sharp** for image processing
- **Nodemailer** for email notifications
- **Node-cron** for scheduled tasks

### Security & Performance
- **Helmet.js** for security headers
- **CORS** configuration
- **Rate limiting** with express-rate-limit
- **Input validation** with express-validator
- **Compression** middleware
- **Morgan** for logging

## 📁 Project Structure

```
E-bid-Website/
├── backend/
│   ├── config/
│   │   ├── database.js          # PostgreSQL configuration
│   │   └── redis.js             # Redis configuration
│   ├── middleware/
│   │   └── auth.js              # Authentication middleware
│   ├── routes/
│   │   ├── admin.js             # Admin panel routes
│   │   ├── auctions.js          # Auction management routes
│   │   ├── auth.js              # Authentication routes
│   │   ├── bids.js              # Bidding system routes
│   │   ├── categories.js        # Category management routes
│   │   ├── users.js             # User management routes
│   │   └── watchlist.js         # Watchlist functionality routes
│   ├── sockets/
│   │   └── socketHandler.js     # Real-time Socket.IO handler
│   ├── utils/
│   │   ├── imageProcessor.js    # Image processing utilities
│   │   ├── notifications.js     # Email and notification system
│   │   └── scheduler.js         # Automated task scheduler
│   ├── uploads/                 # File upload directories
│   ├── .env                     # Environment configuration
│   ├── package.json             # Dependencies and scripts
│   └── server.js                # Main server file
└── README.md                    # Project documentation
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- Redis (v6 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd E-bid-Website
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up PostgreSQL database**
   ```sql
   CREATE DATABASE auction_db;
   -- Run the database schema (schema.sql file needed)
   ```

5. **Start Redis server**
   ```bash
   redis-server
   ```

6. **Start the backend server**
   ```bash
   npm start
   ```

The server will start on `http://localhost:5000`

### Development Mode

For development without external databases:
```bash
npm start
```

The server will run in limited mode, perfect for frontend development and testing.

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Reset password

### Auctions
- `GET /api/auctions/feed` - TikTok-style auction feed
- `GET /api/auctions/:id` - Get auction details
- `POST /api/auctions` - Create new auction
- `PUT /api/auctions/:id` - Update auction
- `DELETE /api/auctions/:id` - Delete auction
- `GET /api/auctions/user/:userId` - Get user's auctions

### Bidding
- `POST /api/bids` - Place a bid
- `GET /api/bids/auction/:auctionId` - Get auction bids
- `GET /api/bids/user` - Get user's bids
- `POST /api/bids/proxy` - Set up proxy bidding
- `POST /api/bids/buy-now/:auctionId` - Buy now

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `POST /api/users/upload-avatar` - Upload profile image
- `GET /api/users/:id` - Get public user profile
- `POST /api/users/rate` - Rate a user

### Watchlist
- `GET /api/watchlist` - Get user's watchlist
- `POST /api/watchlist` - Add to watchlist
- `DELETE /api/watchlist/:auctionId` - Remove from watchlist

### Categories
- `GET /api/categories` - Get all categories
- `GET /api/categories/:id` - Get category details
- `POST /api/categories` - Create category (Admin)
- `PUT /api/categories/:id` - Update category (Admin)

### Admin
- `GET /api/admin/dashboard` - Dashboard analytics
- `GET /api/admin/reports` - Get reports
- `PUT /api/admin/reports/:id` - Resolve report
- `GET /api/admin/users` - Manage users
- `PUT /api/admin/users/:id` - Update user

## 🔧 Configuration

### Environment Variables

```env
# Server Configuration
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=auction_db
DB_USER=postgres
DB_PASSWORD=password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
```

## 🔄 Real-time Features

The platform uses Socket.IO for real-time functionality:

- **Live Bidding**: Instant bid updates across all connected clients
- **Auction Status**: Real-time auction state changes
- **Notifications**: Live notification delivery
- **Viewer Count**: Track active viewers per auction
- **Watchlist Updates**: Real-time watchlist notifications

## 📱 Mobile-First Design

The platform is designed with a mobile-first approach:

- **TikTok-style Interface**: Vertical scrolling auction feed
- **Touch Gestures**: Swipe navigation and interactions
- **Responsive Design**: Optimized for all screen sizes
- **Progressive Web App**: PWA capabilities for mobile installation

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: API abuse prevention
- **Input Validation**: Comprehensive input sanitization
- **CORS Protection**: Cross-origin request security
- **Helmet.js**: Security headers and protection
- **File Upload Security**: Safe file handling and validation

## 📈 Performance Optimizations

- **Redis Caching**: Fast data retrieval and session management
- **Image Optimization**: Automatic image compression and resizing
- **Database Indexing**: Optimized database queries
- **Compression**: Gzip compression for responses
- **Connection Pooling**: Efficient database connections

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run linting
npm run lint
```

## 📦 Deployment

### Production Deployment

1. **Set environment to production**
   ```env
   NODE_ENV=production
   ```

2. **Configure production database and Redis**

3. **Set up SSL certificates**

4. **Configure reverse proxy (Nginx)**

5. **Set up process manager (PM2)**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "auction-backend"
   ```

### Docker Deployment

```dockerfile
# Dockerfile example
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Contact the development team
- Check the documentation

## 🔮 Future Enhancements

- **Mobile App**: React Native mobile application
- **AI Recommendations**: Machine learning-based auction recommendations
- **Video Auctions**: Live video streaming for auctions
- **Cryptocurrency Payments**: Blockchain payment integration
- **Multi-language Support**: Internationalization
- **Advanced Analytics**: Detailed seller and buyer analytics
- **Social Features**: User following and social interactions

---

**Built with ❤️ for the auction community**