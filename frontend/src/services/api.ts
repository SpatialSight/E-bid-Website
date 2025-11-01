import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface AuctionFilters {
  page?: number;
  limit?: number;
  category?: number;
  condition?: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  maxPrice?: number;
  sort?: 'newest' | 'ending_soon' | 'price_low' | 'price_high' | 'popular';
}

export interface AuctionResponse {
  auctions: Array<{
    id: number;
    title: string;
    description: string;
    condition: string;
    currentPrice: number;
    startingPrice: number;
    buyNowPrice?: number;
    shippingCost: number;
    images: string[];
    endTime: string;
    bidCount: number;
    viewCount: number;
    watchCount: number;
    status: string;
    createdAt: string;
    isFeatured: boolean;
    sellerUsername: string;
    sellerReputation: number;
    categoryName: string;
    categoryIcon: string;
    isWatched: boolean;
    timeRemaining: number;
  }>;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface CategoriesResponse {
  categories: Array<{
    id: number;
    name: string;
    description: string;
    icon: string;
    isActive: boolean;
    auctionCount: number;
    createdAt: string;
  }>;
}

// Auction API calls
export const fetchAuctions = async (filters: AuctionFilters = {}): Promise<AuctionResponse> => {
  try {
    const response = await api.get('/auctions/feed', { params: filters });
    return response.data;
  } catch (error) {
    console.error('Error fetching auctions:', error);
    throw error;
  }
};

export const fetchAuctionById = async (id: number) => {
  try {
    const response = await api.get(`/auctions/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching auction:', error);
    throw error;
  }
};

// Category API calls
export const fetchCategories = async (): Promise<CategoriesResponse> => {
  try {
    const response = await api.get('/categories');
    return response.data;
  } catch (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }
};

// Bidding API calls
export const placeBid = async (auctionId: number, amount: number) => {
  try {
    const response = await api.post(`/bids/${auctionId}`, { amount });
    return response.data;
  } catch (error) {
    console.error('Error placing bid:', error);
    throw error;
  }
};

export const getBidHistory = async (auctionId: number) => {
  try {
    const response = await api.get(`/bids/${auctionId}/history`);
    return response.data;
  } catch (error) {
    console.error('Error fetching bid history:', error);
    throw error;
  }
};

// Watchlist API calls
export const addToWatchlist = async (auctionId: number) => {
  try {
    const response = await api.post('/watchlist', { auctionId });
    return response.data;
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    throw error;
  }
};

export const removeFromWatchlist = async (auctionId: number) => {
  try {
    const response = await api.delete(`/watchlist/${auctionId}`);
    return response.data;
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    throw error;
  }
};

export const fetchWatchlist = async () => {
  try {
    const response = await api.get('/watchlist');
    return response.data;
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    throw error;
  }
};

// Authentication API calls
export const login = async (username: string, password: string) => {
  try {
    const response = await api.post('/auth/login', { username, password });
    if (response.data.token) {
      localStorage.setItem('authToken', response.data.token);
    }
    return response.data;
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
};

export const register = async (userData: {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) => {
  try {
    const response = await api.post('/auth/register', userData);
    return response.data;
  } catch (error) {
    console.error('Error registering:', error);
    throw error;
  }
};

export const logout = () => {
  localStorage.removeItem('authToken');
};

// User profile API calls
export const fetchUserProfile = async () => {
  try {
    const response = await api.get('/users/profile');
    return response.data;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
};

export const updateUserProfile = async (profileData: any) => {
  try {
    const response = await api.put('/users/profile', profileData);
    return response.data;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

export default api;