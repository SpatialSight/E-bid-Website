# API Testing Guide

This document provides examples for testing the E-bid Auction Platform API endpoints.

## Base URL
```
http://localhost:5000/api
```

## Health Check

### Check Server Status
```bash
curl http://localhost:5000/api/health
```

Expected Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-01T16:06:47.129Z",
  "services": {
    "server": "running",
    "database": "not_configured",
    "redis": "not_configured",
    "scheduler": "not_configured"
  }
}
```

## Authentication Endpoints

### Register User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User"
  }'
```

### Login User
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Logout User
```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Auction Endpoints

### Get Auction Feed (TikTok-style)
```bash
curl "http://localhost:5000/api/auctions/feed?page=1&limit=10&category=electronics&sort=ending_soon"
```

### Get Auction Details
```bash
curl http://localhost:5000/api/auctions/123
```

### Create New Auction (Requires Authentication)
```bash
curl -X POST http://localhost:5000/api/auctions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "iPhone 13 Pro Max",
    "description": "Excellent condition iPhone 13 Pro Max",
    "category_id": 1,
    "condition": "excellent",
    "starting_price": 500.00,
    "buy_now_price": 800.00,
    "duration_hours": 168,
    "shipping_cost": 15.00,
    "location": "New York, NY"
  }'
```

## Bidding Endpoints

### Place a Bid (Requires Authentication)
```bash
curl -X POST http://localhost:5000/api/bids \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "auction_id": 123,
    "amount": 550.00
  }'
```

### Get Auction Bids
```bash
curl http://localhost:5000/api/bids/auction/123
```

### Set Proxy Bid (Requires Authentication)
```bash
curl -X POST http://localhost:5000/api/bids/proxy \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "auction_id": 123,
    "max_amount": 750.00
  }'
```

### Buy Now (Requires Authentication)
```bash
curl -X POST http://localhost:5000/api/bids/buy-now/123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## User Endpoints

### Get User Profile (Requires Authentication)
```bash
curl http://localhost:5000/api/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Update User Profile (Requires Authentication)
```bash
curl -X PUT http://localhost:5000/api/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Updated",
    "lastName": "Name",
    "bio": "Updated bio",
    "location": "Updated Location"
  }'
```

### Get Public User Profile
```bash
curl http://localhost:5000/api/users/123
```

## Watchlist Endpoints

### Get User Watchlist (Requires Authentication)
```bash
curl http://localhost:5000/api/watchlist \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Add to Watchlist (Requires Authentication)
```bash
curl -X POST http://localhost:5000/api/watchlist \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "auction_id": 123
  }'
```

### Remove from Watchlist (Requires Authentication)
```bash
curl -X DELETE http://localhost:5000/api/watchlist/123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Category Endpoints

### Get All Categories
```bash
curl http://localhost:5000/api/categories
```

### Get Category Details
```bash
curl http://localhost:5000/api/categories/1
```

### Get Popular Categories
```bash
curl http://localhost:5000/api/categories/popular
```

## Admin Endpoints (Requires Admin Role)

### Get Dashboard Analytics
```bash
curl http://localhost:5000/api/admin/dashboard?timeframe=7d \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

### Get Reports
```bash
curl http://localhost:5000/api/admin/reports \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

### Get All Users
```bash
curl "http://localhost:5000/api/admin/users?page=1&limit=20&search=test&role=buyer" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

## File Upload Endpoints

### Upload Auction Images (Requires Authentication)
```bash
curl -X POST http://localhost:5000/api/auctions/123/images \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "images=@image1.jpg" \
  -F "images=@image2.jpg"
```

### Upload Profile Image (Requires Authentication)
```bash
curl -X POST http://localhost:5000/api/users/upload-avatar \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "avatar=@profile.jpg"
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "error": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

## WebSocket Events

### Connect to Socket.IO
```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: 'YOUR_JWT_TOKEN' // Optional for authenticated users
  }
});
```

### Join Auction Room
```javascript
socket.emit('join_auction', { auctionId: 123 });
```

### Listen for Bid Updates
```javascript
socket.on('bid_placed', (data) => {
  console.log('New bid:', data);
});
```

### Listen for Auction Updates
```javascript
socket.on('auction_updated', (data) => {
  console.log('Auction updated:', data);
});
```

### Place Optimistic Bid
```javascript
socket.emit('place_bid', {
  auctionId: 123,
  amount: 550.00
});
```

## Testing with Postman

1. Import the API endpoints into Postman
2. Set up environment variables:
   - `base_url`: http://localhost:5000/api
   - `jwt_token`: Your JWT token after login
3. Use the collection runner for automated testing

## Testing with curl Scripts

Create a test script:

```bash
#!/bin/bash

# Test server health
echo "Testing server health..."
curl -s http://localhost:5000/api/health | jq

# Test registration
echo "Testing user registration..."
curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User"
  }' | jq

# Test login
echo "Testing user login..."
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }' | jq -r '.token')

echo "JWT Token: $TOKEN"

# Test authenticated endpoint
echo "Testing authenticated endpoint..."
curl -s http://localhost:5000/api/users/profile \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Notes

- Replace `YOUR_JWT_TOKEN` with actual JWT token from login response
- Replace `YOUR_ADMIN_JWT_TOKEN` with admin user JWT token
- All file uploads should use `multipart/form-data`
- All JSON requests should use `Content-Type: application/json`
- Authentication is required for most POST, PUT, DELETE operations
- Admin endpoints require admin role permissions