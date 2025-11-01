import React from 'react';
import { motion } from 'framer-motion';

interface Category {
  id: number;
  name: string;
  description: string;
  icon: string;
  isActive: boolean;
  auctionCount: number;
  createdAt: string;
}

interface CategoryFilterProps {
  categories: Category[];
  selectedCategory: string | null;
  onCategorySelect: (categoryId: string | null) => void;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({
  categories,
  selectedCategory,
  onCategorySelect
}) => {
  return (
    <div className="bg-black/80 backdrop-blur-sm border-b border-gray-800">
      <div className="flex overflow-x-auto hide-scrollbar px-4 py-3 space-x-3">
        {/* All Categories Button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => onCategorySelect(null)}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            selectedCategory === null
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          All
        </motion.button>

        {/* Category Buttons */}
        {categories.map((category) => (
          <motion.button
            key={category.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onCategorySelect(category.id.toString())}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center space-x-2 ${
              selectedCategory === category.id.toString()
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <span>{category.icon}</span>
            <span>{category.name}</span>
            <span className="text-xs opacity-75">({category.auctionCount})</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default CategoryFilter;