import logger from './logger';

/**
 * Device Manager - إدارة موحدة للأجهزة والأذونات
 * 
 * هذا الملف يوفر:
 * 1. طلب الأذونات مع إعادة المحاولة
 * 2. كشف الأجهزة مع تخزين مؤقت
 * 3. إدارة حالة الأجهزة
 */

// تخزين مؤقت للأجهزة والأذونات
let deviceCache = {
  permissions: null,
  devices: null,
  lastUpdated: null,
  cacheTimeout: 30000 // 30 ثانية
};

/**
 * التحقق من صحة التخزين المؤقت
 * @returns {boolean} صحيح إذا كان التخزين المؤقت صالح
 */
const isCacheValid = () => {
  if (!deviceCache.lastUpdated) return false;
  return Date.now() - deviceCache.lastUpdated < deviceCache.cacheTimeout;
};

/**
 * طلب أذونات الأجهزة
 * @param {Object} options - خيارات طلب الأذونات
 * @returns {Promise<Object>} نتيجة الأذونات
 */
export const requestDevicePermissions = async (options = {}) => {
  const { audio = true, video = true, forcePrompt = false } = options;
  
  try {
    logger.deviceEvent('Requesting device permissions', { audio, video, forcePrompt });
    
    const permissions = { audio: false, video: false };
    
    // طلب إذن الصوت
    if (audio) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        permissions.audio = true;
        logger.deviceEvent('Audio permission granted');
      } catch (error) {
        logger.warn('Audio permission denied:', error.message);
      }
    }
    
    // طلب إذن الفيديو
    if (video) {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        permissions.video = true;
        logger.deviceEvent('Video permission granted');
      } catch (error) {
        logger.warn('Video permission denied:', error.message);
      }
    }
    
    logger.deviceEvent('Permission request result', permissions);
    return permissions;
  } catch (error) {
    logger.error('Permission request failed:', error);
    return { audio: false, video: false };
  }
};

/**
 * طلب الأذونات مع إعادة المحاولة
 * @param {Object} options - خيارات طلب الأذونات
 * @returns {Promise<Object>} نتيجة الأذونات
 */
export const requestDevicePermissionsWithRetry = async (options = {}) => {
  const { maxRetries = 3, audio = true, video = true, forcePrompt = false } = options;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logger.deviceEvent(`Permission request attempt ${attempt}/${maxRetries}`);
    
    try {
      const result = await requestDevicePermissions({ audio, video, forcePrompt });
      if (result.audio || result.video) {
        logger.deviceEvent('Permissions granted successfully');
        return result;
      }
    } catch (error) {
      logger.warn(`Permission attempt ${attempt} failed:`, error.message);
    }
    
    if (attempt < maxRetries) {
      logger.deviceEvent('Waiting before retry...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  logger.warn('All permission attempts failed');
  return { audio: false, video: false };
};

/**
 * كشف الأجهزة المتاحة
 * @param {Object} options - خيارات الكشف
 * @returns {Promise<Object>} معلومات الأجهزة
 */
export const detectDevices = async (options = {}) => {
  const { forceRefresh = false, requestPermissions = true } = options;
  
  // التحقق من التخزين المؤقت
  if (!forceRefresh && isCacheValid() && deviceCache.devices) {
    logger.deviceEvent('Using cached device data');
    return deviceCache.devices;
  }
  
  try {
    logger.deviceEvent('Detecting devices...');
    
    // طلب الأذونات إذا لزم الأمر
    let permissions = { audio: false, video: false };
    if (requestPermissions) {
      permissions = await requestDevicePermissionsWithRetry();
    }
    
    // تعداد الأجهزة
    const deviceList = await navigator.mediaDevices.enumerateDevices();
    
    const audioDevices = deviceList.filter(device => device.kind === 'audioinput');
    const videoDevices = deviceList.filter(device => device.kind === 'videoinput');
    
    const result = {
      hasAudio: permissions.audio && audioDevices.length > 0,
      hasVideo: permissions.video && videoDevices.length > 0,
      audioDevices,
      videoDevices,
      permissions,
      allDevices: deviceList
    };
    
    // تحديث التخزين المؤقت
    deviceCache.devices = result;
    deviceCache.permissions = permissions;
    deviceCache.lastUpdated = Date.now();
    
    logger.deviceEvent('Device detection complete', {
      audioDevices: audioDevices.length,
      videoDevices: videoDevices.length,
      hasAudio: result.hasAudio,
      hasVideo: result.hasVideo
    });
    
    return result;
  } catch (error) {
    logger.error('Device detection failed:', error);
    throw error;
  }
};

/**
 * الحصول على الأجهزة المختارة
 * @param {Object} deviceInfo - معلومات الأجهزة
 * @returns {Object} الأجهزة المختارة
 */
export const getSelectedDevices = (deviceInfo) => {
  const { audioDevices = [], videoDevices = [] } = deviceInfo;
  
  return {
    selectedAudioDevice: audioDevices.length > 0 ? audioDevices[0] : null,
    selectedVideoDevice: videoDevices.length > 0 ? videoDevices[0] : null
  };
};

/**
 * مسح التخزين المؤقت
 */
export const clearDeviceCache = () => {
  deviceCache = {
    permissions: null,
    devices: null,
    lastUpdated: null,
    cacheTimeout: 30000
  };
  logger.deviceEvent('Device cache cleared');
};

/**
 * تحديث التخزين المؤقت
 * @param {Object} deviceInfo - معلومات الأجهزة الجديدة
 */
export const updateDeviceCache = (deviceInfo) => {
  deviceCache.devices = deviceInfo;
  deviceCache.lastUpdated = Date.now();
  logger.deviceEvent('Device cache updated');
};

export default {
  requestDevicePermissions,
  requestDevicePermissionsWithRetry,
  detectDevices,
  getSelectedDevices,
  clearDeviceCache,
  updateDeviceCache,
  isCacheValid: () => isCacheValid()
};
