import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AuctionCard from './components/AuctionCard';
import CategoryFilter from './components/CategoryFilter';
import { fetchAuctions, fetchCategories } from './services/api';

interface Auction {
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
}

interface Category {
  id: number;
  name: string;
  description: string;
  icon: string;
  isActive: boolean;
  auctionCount: number;
  createdAt: string;
}

function App() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadAuctions();
  }, [selectedCategory]);

  const loadInitialData = async () => {
    try {
      const [auctionsData, categoriesData] = await Promise.all([
        fetchAuctions(),
        fetchCategories()
      ]);
      
      // Ensure we have arrays even if the API returns undefined
      const auctionsList = auctionsData?.auctions || [];
      const categoriesList = categoriesData?.categories || [];
      
      setAuctions(auctionsList);
      setCategories(categoriesList);
      
      // If no data from API, set some mock data for demo
      if (auctionsList.length === 0) {
        setAuctions([
          {
            id: 1,
            title: "Sample Auction Item",
            description: "This is a sample auction item for demonstration purposes.",
            condition: "new",
            currentPrice: 150,
            startingPrice: 100,
            buyNowPrice: 200,
            shippingCost: 10,
            images: ["https://via.placeholder.com/400x300"],
            endTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            bidCount: 5,
            viewCount: 25,
            watchCount: 3,
            status: "active",
            createdAt: new Date().toISOString(),
            isFeatured: true,
            sellerUsername: "demo_seller",
            sellerReputation: 4.5,
            categoryName: "Electronics",
            categoryIcon: "📱",
            isWatched: false,
            timeRemaining: 86400
          }
        ]);
      }
      
      if (categoriesList.length === 0) {
        setCategories([
          { id: 1, name: "All", description: "All categories", icon: "🏷️", isActive: true, auctionCount: 10, createdAt: new Date().toISOString() },
          { id: 2, name: "Electronics", description: "Electronic items", icon: "📱", isActive: true, auctionCount: 5, createdAt: new Date().toISOString() }
        ]);
      }
      
    } catch (err) {
      console.error('Error loading initial data:', err);
      // Set fallback data on error
      setAuctions([
        {
          id: 1,
          title: "Sample Auction Item",
          description: "This is a sample auction item for demonstration purposes.",
          condition: "new",
          currentPrice: 150,
          startingPrice: 100,
          buyNowPrice: 200,
          shippingCost: 10,
          images: ["https://via.placeholder.com/400x300"],
          endTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          bidCount: 5,
          viewCount: 25,
          watchCount: 3,
          status: "active",
          createdAt: new Date().toISOString(),
          isFeatured: true,
          sellerUsername: "demo_seller",
          sellerReputation: 4.5,
          categoryName: "Electronics",
          categoryIcon: "📱",
          isWatched: false,
          timeRemaining: 86400
        }
      ]);
      setCategories([
        { id: 1, name: "All", description: "All categories", icon: "🏷️", isActive: true, auctionCount: 10, createdAt: new Date().toISOString() },
        { id: 2, name: "Electronics", description: "Electronic items", icon: "📱", isActive: true, auctionCount: 5, createdAt: new Date().toISOString() }
      ]);
      setError('Using demo data - API connection failed');
    } finally {
      setLoading(false);
    }
  };

  const loadAuctions = async () => {
    try {
      setLoading(true);
      const params = selectedCategory ? { category: selectedCategory } : {};
      const data = await fetchAuctions(params);
      const auctionsList = data?.auctions || [];
      setAuctions(auctionsList);
      setCurrentIndex(0);
    } catch (err) {
      console.error('Error loading auctions:', err);
      // Keep existing auctions on error, don't clear them
      setError('Failed to load new auctions');
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    const itemHeight = container.clientHeight;
    const newIndex = Math.round(scrollTop / itemHeight);
    
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < auctions.length) {
      setCurrentIndex(newIndex);
    }
  };

  const scrollToIndex = (index: number) => {
    if (containerRef.current) {
      const itemHeight = containerRef.current.clientHeight;
      containerRef.current.scrollTo({
        top: index * itemHeight,
        behavior: 'smooth'
      });
    }
  };

  const handleNext = () => {
    if (currentIndex < auctions.length - 1) {
      scrollToIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      scrollToIndex(currentIndex - 1);
    }
  };

  const handleCategorySelect = (categoryId: number | null) => {
    setSelectedCategory(categoryId);
  };

  if (loading && auctions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading auctions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️</div>
          <p className="text-gray-600">{error}</p>
          <button 
            onClick={loadInitialData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/50 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h1 className="text-white text-xl font-bold">E-Bid</h1>
            <span className="text-white/70 text-sm">Live Auctions</span>
          </div>
          <div className="flex items-center space-x-2 text-white/70 text-sm">
            <span>{currentIndex + 1}</span>
            <span>/</span>
            <span>{auctions.length}</span>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="absolute top-16 left-0 right-0 z-20">
        <CategoryFilter 
          categories={categories}
          selectedCategory={selectedCategory}
          onCategorySelect={handleCategorySelect}
        />
      </div>

      {/* Main Feed Container */}
      <div 
        ref={containerRef}
        className="h-full snap-y-mandatory overflow-y-scroll hide-scrollbar"
        onScroll={handleScroll}
      >
        <AnimatePresence mode="wait">
          {auctions.map((auction, index) => (
            <motion.div
              key={auction.id}
              className="h-screen snap-start flex items-center justify-center p-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
            >
              <AuctionCard 
                auction={auction}
                isActive={index === currentIndex}
                onNext={handleNext}
                onPrevious={handlePrevious}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Navigation Indicators */}
      <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 space-y-2">
        {auctions.map((_, index) => (
          <button
            key={index}
            onClick={() => scrollToIndex(index)}
            className={`w-2 h-8 rounded-full transition-all duration-200 ${
              index === currentIndex 
                ? 'bg-white' 
                : 'bg-white/30 hover:bg-white/50'
            }`}
          />
        ))}
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-30">
          <div className="bg-white rounded-lg p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
