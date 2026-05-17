import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

/**
 * Image optimization utilities
 * تحسين الصور قبل رفعها
 */

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;
const COMPRESSION_QUALITY = 0.8;

/**
 * Optimize image by resizing and compressing
 * @param {string} uri - Image URI
 * @param {Object} options - Optimization options
 * @returns {Promise<Object>} Optimized image info
 */
export const optimizeImage = async (uri, options = {}) => {
  try {
    const {
      maxWidth = MAX_WIDTH,
      maxHeight = MAX_HEIGHT,
      quality = COMPRESSION_QUALITY,
    } = options;

    // Get image info
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      throw new Error('Image not found');
    }

    // Resize and compress
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          resize: {
            width: maxWidth,
            height: maxHeight,
          },
        },
      ],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return {
      uri: manipResult.uri,
      width: manipResult.width,
      height: manipResult.height,
      size: info.size,
    };
  } catch (error) {
    console.error('Error optimizing image:', error);
    throw error;
  }
};

/**
 * Generate thumbnail from image
 * @param {string} uri - Image URI
 * @param {number} size - Thumbnail size
 * @returns {Promise<string>} Thumbnail URI
 */
export const generateThumbnail = async (uri, size = 200) => {
  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          resize: {
            width: size,
            height: size,
          },
        },
      ],
      {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return manipResult.uri;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    throw error;
  }
};

/**
 * Check if file size is within limit
 * @param {string} uri - File URI
 * @param {number} maxSize - Max size in bytes
 * @returns {Promise<boolean>}
 */
export const isFileSizeValid = async (uri, maxSize = 10 * 1024 * 1024) => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && info.size <= maxSize;
  } catch (error) {
    console.error('Error checking file size:', error);
    return false;
  }
};

/**
 * Get image dimensions
 * @param {string} uri - Image URI
 * @returns {Promise<Object>} {width, height}
 */
export const getImageDimensions = async (uri) => {
  try {
    const info = await ImageManipulator.manipulateAsync(
      uri,
      [],
      { format: ImageManipulator.SaveFormat.JPEG }
    );
    
    return {
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    console.error('Error getting image dimensions:', error);
    throw error;
  }
};

export default {
  optimizeImage,
  generateThumbnail,
  isFileSizeValid,
  getImageDimensions,
};





