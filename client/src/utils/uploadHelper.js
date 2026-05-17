import { optimizeImage, generateThumbnail, isFileSizeValid } from './imageOptimizer';
import logger from './logger';
import config from '../config/environment';

/**
 * Upload helper with image optimization
 * دالة مساعدة لرفع الصور مع التحسين التلقائي
 */

/**
 * Prepare image for upload
 * @param {string} uri - Image URI
 * @param {Object} options - Options
 * @returns {Promise<Object>} Prepared image data
 */
export const prepareImageForUpload = async (uri, options = {}) => {
  try {
    const {
      maxWidth = 1200,
      maxHeight = 1200,
      quality = 0.8,
      generateThumb = true,
      thumbSize = 200,
    } = options;

    // Check file size
    const isValid = await isFileSizeValid(uri, config.MAX_FILE_SIZE);
    if (!isValid) {
      throw new Error(`File size exceeds ${config.MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
    }

    // Optimize image
    logger.info('Optimizing image...', { uri });
    const optimized = await optimizeImage(uri, {
      maxWidth,
      maxHeight,
      quality,
    });

    const result = {
      original: uri,
      optimized: optimized.uri,
      width: optimized.width,
      height: optimized.height,
      size: optimized.size,
    };

    // Generate thumbnail if needed
    if (generateThumb) {
      logger.info('Generating thumbnail...');
      const thumbnail = await generateThumbnail(uri, thumbSize);
      result.thumbnail = thumbnail;
    }

    logger.info('Image preparation complete', result);
    return result;
  } catch (error) {
    logger.error('Error preparing image for upload', error);
    throw error;
  }
};

/**
 * Prepare multiple images for upload
 * @param {Array<string>} uris - Array of image URIs
 * @param {Object} options - Options
 * @returns {Promise<Array<Object>>} Array of prepared image data
 */
export const prepareMultipleImagesForUpload = async (uris, options = {}) => {
  try {
    logger.info(`Preparing ${uris.length} images for upload`);
    
    const results = await Promise.all(
      uris.map(uri => prepareImageForUpload(uri, options))
    );

    logger.info(`Successfully prepared ${results.length} images`);
    return results;
  } catch (error) {
    logger.error('Error preparing multiple images', error);
    throw error;
  }
};

export default {
  prepareImageForUpload,
  prepareMultipleImagesForUpload,
};





