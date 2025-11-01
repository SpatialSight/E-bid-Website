const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

class ImageProcessor {
  constructor() {
    this.uploadDir = path.join(__dirname, '../uploads');
    this.auctionImagesDir = path.join(this.uploadDir, 'auctions');
    this.profileImagesDir = path.join(this.uploadDir, 'profiles');
    this.thumbnailsDir = path.join(this.uploadDir, 'thumbnails');
    
    // Image size configurations
    this.sizes = {
      thumbnail: { width: 300, height: 300 },
      medium: { width: 800, height: 600 },
      large: { width: 1200, height: 900 },
      profile: { width: 200, height: 200 }
    };

    this.allowedFormats = ['jpeg', 'jpg', 'png', 'webp'];
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.quality = 85;
  }

  async initialize() {
    try {
      // Create upload directories if they don't exist
      await fs.mkdir(this.uploadDir, { recursive: true });
      await fs.mkdir(this.auctionImagesDir, { recursive: true });
      await fs.mkdir(this.profileImagesDir, { recursive: true });
      await fs.mkdir(this.thumbnailsDir, { recursive: true });
      
      console.log('Image processor initialized');
    } catch (error) {
      console.error('Failed to initialize image processor:', error);
      throw error;
    }
  }

  generateFileName(originalName, suffix = '') {
    const ext = path.extname(originalName).toLowerCase();
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `${timestamp}-${random}${suffix}${ext}`;
  }

  async validateImage(buffer, originalName) {
    try {
      // Check file size
      if (buffer.length > this.maxFileSize) {
        throw new Error(`File size exceeds ${this.maxFileSize / (1024 * 1024)}MB limit`);
      }

      // Check file format
      const ext = path.extname(originalName).toLowerCase().substring(1);
      if (!this.allowedFormats.includes(ext)) {
        throw new Error(`Unsupported format. Allowed formats: ${this.allowedFormats.join(', ')}`);
      }

      // Validate image using Sharp
      const metadata = await sharp(buffer).metadata();
      
      if (!metadata.width || !metadata.height) {
        throw new Error('Invalid image file');
      }

      // Check minimum dimensions
      if (metadata.width < 100 || metadata.height < 100) {
        throw new Error('Image dimensions too small (minimum 100x100px)');
      }

      // Check maximum dimensions
      if (metadata.width > 4000 || metadata.height > 4000) {
        throw new Error('Image dimensions too large (maximum 4000x4000px)');
      }

      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: buffer.length
      };
    } catch (error) {
      throw new Error(`Image validation failed: ${error.message}`);
    }
  }

  async processAuctionImages(files, auctionId) {
    try {
      const processedImages = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate image
        await this.validateImage(file.buffer, file.originalname);

        // Generate base filename
        const baseFileName = this.generateFileName(file.originalname);
        const fileNameWithoutExt = path.parse(baseFileName).name;

        // Process different sizes
        const sizes = await this.createImageSizes(file.buffer, fileNameWithoutExt, 'auction');

        processedImages.push({
          original: sizes.large.url,
          thumbnail: sizes.thumbnail.url,
          medium: sizes.medium.url,
          large: sizes.large.url,
          metadata: {
            originalName: file.originalname,
            size: file.buffer.length,
            width: sizes.large.width,
            height: sizes.large.height,
            order: i
          }
        });
      }

      return processedImages;
    } catch (error) {
      console.error('Process auction images error:', error);
      throw error;
    }
  }

  async processProfileImage(file, userId) {
    try {
      // Validate image
      await this.validateImage(file.buffer, file.originalname);

      // Generate filename
      const fileName = this.generateFileName(file.originalname, `-profile-${userId}`);
      const fileNameWithoutExt = path.parse(fileName).name;

      // Create profile image (square crop)
      const processedImage = await sharp(file.buffer)
        .resize(this.sizes.profile.width, this.sizes.profile.height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: this.quality })
        .toBuffer();

      const filePath = path.join(this.profileImagesDir, `${fileNameWithoutExt}.jpg`);
      await fs.writeFile(filePath, processedImage);

      const metadata = await sharp(processedImage).metadata();

      return {
        url: `/uploads/profiles/${fileNameWithoutExt}.jpg`,
        width: metadata.width,
        height: metadata.height,
        size: processedImage.length
      };
    } catch (error) {
      console.error('Process profile image error:', error);
      throw error;
    }
  }

  async createImageSizes(buffer, baseFileName, type = 'auction') {
    const sizes = {};
    const targetDir = type === 'auction' ? this.auctionImagesDir : this.profileImagesDir;

    // Create thumbnail
    const thumbnailBuffer = await sharp(buffer)
      .resize(this.sizes.thumbnail.width, this.sizes.thumbnail.height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: this.quality })
      .toBuffer();

    const thumbnailPath = path.join(this.thumbnailsDir, `${baseFileName}-thumb.jpg`);
    await fs.writeFile(thumbnailPath, thumbnailBuffer);

    const thumbnailMetadata = await sharp(thumbnailBuffer).metadata();
    sizes.thumbnail = {
      url: `/uploads/thumbnails/${baseFileName}-thumb.jpg`,
      width: thumbnailMetadata.width,
      height: thumbnailMetadata.height,
      size: thumbnailBuffer.length
    };

    // Create medium size
    const mediumBuffer = await sharp(buffer)
      .resize(this.sizes.medium.width, this.sizes.medium.height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: this.quality })
      .toBuffer();

    const mediumPath = path.join(targetDir, `${baseFileName}-medium.jpg`);
    await fs.writeFile(mediumPath, mediumBuffer);

    const mediumMetadata = await sharp(mediumBuffer).metadata();
    sizes.medium = {
      url: `/uploads/${type}s/${baseFileName}-medium.jpg`,
      width: mediumMetadata.width,
      height: mediumMetadata.height,
      size: mediumBuffer.length
    };

    // Create large size (or keep original if smaller)
    const originalMetadata = await sharp(buffer).metadata();
    let largeBuffer;

    if (originalMetadata.width > this.sizes.large.width || originalMetadata.height > this.sizes.large.height) {
      largeBuffer = await sharp(buffer)
        .resize(this.sizes.large.width, this.sizes.large.height, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: this.quality })
        .toBuffer();
    } else {
      // Keep original size but optimize
      largeBuffer = await sharp(buffer)
        .jpeg({ quality: this.quality })
        .toBuffer();
    }

    const largePath = path.join(targetDir, `${baseFileName}-large.jpg`);
    await fs.writeFile(largePath, largeBuffer);

    const largeMetadata = await sharp(largeBuffer).metadata();
    sizes.large = {
      url: `/uploads/${type}s/${baseFileName}-large.jpg`,
      width: largeMetadata.width,
      height: largeMetadata.height,
      size: largeBuffer.length
    };

    return sizes;
  }

  async deleteImage(imageUrl) {
    try {
      if (!imageUrl) return;

      // Extract filename from URL
      const urlPath = imageUrl.replace('/uploads/', '');
      const filePath = path.join(this.uploadDir, urlPath);

      // Check if file exists and delete
      try {
        await fs.access(filePath);
        await fs.unlink(filePath);
        console.log(`Deleted image: ${filePath}`);
      } catch (error) {
        // File doesn't exist, ignore
        console.log(`Image not found for deletion: ${filePath}`);
      }

      // Also try to delete related sizes
      const parsedPath = path.parse(filePath);
      const baseFileName = parsedPath.name.replace(/-thumb|-medium|-large$/, '');
      
      const relatedFiles = [
        path.join(this.thumbnailsDir, `${baseFileName}-thumb.jpg`),
        path.join(this.auctionImagesDir, `${baseFileName}-medium.jpg`),
        path.join(this.auctionImagesDir, `${baseFileName}-large.jpg`)
      ];

      for (const relatedFile of relatedFiles) {
        try {
          await fs.access(relatedFile);
          await fs.unlink(relatedFile);
        } catch (error) {
          // Ignore if file doesn't exist
        }
      }
    } catch (error) {
      console.error('Delete image error:', error);
    }
  }

  async deleteAuctionImages(images) {
    try {
      if (!Array.isArray(images)) return;

      for (const image of images) {
        if (typeof image === 'string') {
          await this.deleteImage(image);
        } else if (image && typeof image === 'object') {
          // Delete all sizes
          await this.deleteImage(image.thumbnail);
          await this.deleteImage(image.medium);
          await this.deleteImage(image.large);
          await this.deleteImage(image.original);
        }
      }
    } catch (error) {
      console.error('Delete auction images error:', error);
    }
  }

  async optimizeExistingImages() {
    try {
      console.log('Starting image optimization...');

      // Get all auction images
      const auctionFiles = await fs.readdir(this.auctionImagesDir);
      let optimizedCount = 0;

      for (const fileName of auctionFiles) {
        try {
          const filePath = path.join(this.auctionImagesDir, fileName);
          const stats = await fs.stat(filePath);

          // Skip if file is already optimized (less than 500KB)
          if (stats.size < 500 * 1024) continue;

          // Read and optimize
          const buffer = await fs.readFile(filePath);
          const optimizedBuffer = await sharp(buffer)
            .jpeg({ quality: this.quality })
            .toBuffer();

          // Only replace if significantly smaller
          if (optimizedBuffer.length < stats.size * 0.8) {
            await fs.writeFile(filePath, optimizedBuffer);
            optimizedCount++;
            console.log(`Optimized ${fileName}: ${stats.size} -> ${optimizedBuffer.length} bytes`);
          }
        } catch (error) {
          console.error(`Failed to optimize ${fileName}:`, error.message);
        }
      }

      console.log(`Image optimization complete. Optimized ${optimizedCount} images.`);
      return optimizedCount;
    } catch (error) {
      console.error('Optimize existing images error:', error);
      throw error;
    }
  }

  async getImageInfo(imageUrl) {
    try {
      if (!imageUrl) return null;

      const urlPath = imageUrl.replace('/uploads/', '');
      const filePath = path.join(this.uploadDir, urlPath);

      const stats = await fs.stat(filePath);
      const metadata = await sharp(filePath).metadata();

      return {
        size: stats.size,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        lastModified: stats.mtime
      };
    } catch (error) {
      console.error('Get image info error:', error);
      return null;
    }
  }

  async cleanupOrphanedImages() {
    try {
      console.log('Starting orphaned image cleanup...');

      // This would require database queries to check which images are still referenced
      // For now, we'll just clean up very old temporary files
      
      const directories = [this.auctionImagesDir, this.profileImagesDir, this.thumbnailsDir];
      let deletedCount = 0;

      for (const dir of directories) {
        const files = await fs.readdir(dir);
        
        for (const fileName of files) {
          try {
            const filePath = path.join(dir, fileName);
            const stats = await fs.stat(filePath);
            
            // Delete files older than 30 days that might be orphaned
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            
            if (stats.mtime < thirtyDaysAgo) {
              // Additional check: if filename contains 'temp' or 'tmp'
              if (fileName.includes('temp') || fileName.includes('tmp')) {
                await fs.unlink(filePath);
                deletedCount++;
                console.log(`Deleted orphaned file: ${fileName}`);
              }
            }
          } catch (error) {
            console.error(`Failed to process ${fileName}:`, error.message);
          }
        }
      }

      console.log(`Cleanup complete. Deleted ${deletedCount} orphaned files.`);
      return deletedCount;
    } catch (error) {
      console.error('Cleanup orphaned images error:', error);
      throw error;
    }
  }

  getStorageStats() {
    return {
      uploadDir: this.uploadDir,
      directories: {
        auctions: this.auctionImagesDir,
        profiles: this.profileImagesDir,
        thumbnails: this.thumbnailsDir
      },
      sizes: this.sizes,
      allowedFormats: this.allowedFormats,
      maxFileSize: this.maxFileSize,
      quality: this.quality
    };
  }
}

// Create singleton instance
const imageProcessor = new ImageProcessor();

module.exports = imageProcessor;