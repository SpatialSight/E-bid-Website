import React, { useState, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { 
  HeartIcon, 
  EyeIcon, 
  ClockIcon, 
  CurrencyDollarIcon,
  UserIcon,
  StarIcon,
  ShoppingCartIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';

interface AuctionCardProps {
  auction: {
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
  };
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onBid?: (auctionId: number) => void;
  onWatch?: (auctionId: number) => void;
  onBuyNow?: (auctionId: number) => void;
}

const AuctionCard: React.FC<AuctionCardProps> = ({
  auction,
  onSwipeLeft,
  onSwipeRight,
  onBid,
  onWatch,
  onBuyNow
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isWatched, setIsWatched] = useState(auction.isWatched);
  const cardRef = useRef<HTMLDivElement>(null);
  
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return 'Ended';
    
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const handleDragEnd = (event: any, info: any) => {
    const threshold = 100;
    
    if (info.offset.x > threshold) {
      // Swiped right - like/watch
      onSwipeRight?.();
      handleWatch();
    } else if (info.offset.x < -threshold) {
      // Swiped left - skip
      onSwipeLeft?.();
    } else {
      // Snap back to center
      x.set(0);
    }
  };

  const handleWatch = () => {
    setIsWatched(!isWatched);
    onWatch?.(auction.id);
  };

  const handleBid = () => {
    onBid?.(auction.id);
  };

  const handleBuyNow = () => {
    onBuyNow?.(auction.id);
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => 
      prev === auction.images.length - 1 ? 0 : prev + 1
    );
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => 
      prev === 0 ? auction.images.length - 1 : prev - 1
    );
  };

  return (
    <motion.div
      ref={cardRef}
      className="auction-card relative w-full h-full bg-white rounded-2xl overflow-hidden shadow-2xl"
      style={{ x, rotate, opacity }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      whileTap={{ scale: 0.95 }}
    >
      {/* Image Container */}
      <div className="relative h-3/5 overflow-hidden">
        <motion.img
          key={currentImageIndex}
          src={auction.images[currentImageIndex] || '/placeholder-auction.jpg'}
          alt={auction.title}
          className="w-full h-full object-cover"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Image Navigation */}
        {auction.images.length > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/30 text-white p-2 rounded-full backdrop-blur-sm"
            >
              ←
            </button>
            <button
              onClick={nextImage}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/30 text-white p-2 rounded-full backdrop-blur-sm"
            >
              →
            </button>
            
            {/* Image Indicators */}
            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1">
              {auction.images.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full ${
                    index === currentImageIndex ? 'bg-white' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {/* Overlay Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        
        {/* Top Right Info */}
        <div className="absolute top-4 right-4 flex flex-col items-end space-y-2">
          {auction.isFeatured && (
            <div className="bg-yellow-500 text-black px-2 py-1 rounded-full text-xs font-bold">
              FEATURED
            </div>
          )}
          <div className="category-chip bg-primary/80 text-white px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm">
            {auction.categoryIcon} {auction.categoryName}
          </div>
        </div>

        {/* Time Remaining */}
        <div className="absolute top-4 left-4">
          <div className="time-remaining bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center space-x-1">
            <ClockIcon className="w-4 h-4" />
            <span>{formatTimeRemaining(auction.timeRemaining)}</span>
          </div>
        </div>

        {/* Watch Button */}
        <motion.button
          onClick={handleWatch}
          className="absolute top-1/2 right-4 transform -translate-y-1/2 watch-button"
          whileTap={{ scale: 0.8 }}
          whileHover={{ scale: 1.1 }}
        >
          {isWatched ? (
            <HeartSolidIcon className="w-8 h-8 text-red-500" />
          ) : (
            <HeartIcon className="w-8 h-8 text-white" />
          )}
        </motion.button>
      </div>

      {/* Content Container */}
      <div className="h-2/5 p-4 flex flex-col justify-between">
        {/* Title and Description */}
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-2">
            {auction.title}
          </h3>
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
            {auction.description}
          </p>
          
          {/* Condition Badge */}
          <div className="inline-block bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs font-medium mb-2">
            Condition: {auction.condition}
          </div>
        </div>

        {/* Seller Info */}
        <div className="seller-info flex items-center space-x-2 mb-3">
          <UserIcon className="w-5 h-5 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">{auction.sellerUsername}</span>
          <div className="flex items-center space-x-1">
            <StarIcon className="w-4 h-4 text-yellow-500 fill-current" />
            <span className="text-xs text-gray-600">{auction.sellerReputation}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
          <div className="flex items-center space-x-1">
            <EyeIcon className="w-4 h-4" />
            <span>{auction.viewCount}</span>
          </div>
          <div className="flex items-center space-x-1">
            <HeartIcon className="w-4 h-4" />
            <span>{auction.watchCount}</span>
          </div>
          <div className="flex items-center space-x-1">
            <CurrencyDollarIcon className="w-4 h-4" />
            <span>{auction.bidCount} bids</span>
          </div>
        </div>

        {/* Price and Actions */}
        <div className="flex items-center justify-between">
          <div>
            <div className="price-tag text-2xl font-bold text-primary">
              {formatPrice(auction.currentPrice)}
            </div>
            <div className="text-xs text-gray-500">
              Starting: {formatPrice(auction.startingPrice)}
            </div>
          </div>
          
          <div className="flex space-x-2">
            <motion.button
              onClick={handleBid}
              className="bid-button bg-primary text-white px-4 py-2 rounded-full font-medium text-sm"
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
            >
              Bid
            </motion.button>
            
            {auction.buyNowPrice && (
              <motion.button
                onClick={handleBuyNow}
                className="bg-accent text-white px-4 py-2 rounded-full font-medium text-sm flex items-center space-x-1"
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
              >
                <ShoppingCartIcon className="w-4 h-4" />
                <span>{formatPrice(auction.buyNowPrice)}</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Swipe Indicators */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: useTransform(x, [0, 100], [0, 1]) }}
      >
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-green-500 text-white p-4 rounded-full">
          <HeartIcon className="w-8 h-8" />
        </div>
      </motion.div>
      
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: useTransform(x, [0, -100], [0, 1]) }}
      >
        <div className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-red-500 text-white p-4 rounded-full">
          <span className="text-2xl">✕</span>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AuctionCard;