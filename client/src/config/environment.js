import Constants from 'expo-constants';

/**
 * Environment configuration
 * يوفر إدارة مركزية لجميع المتغيرات البيئية
 */

// Get API URL from Expo Constants or environment variables
const getApiUrl = () => {
  // Try to get from Expo Constants first
  if (Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL) {
    return Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;
  }
  // Fallback to environment variable or default
  return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
};

const ENV = {
  dev: {
    API_URL: getApiUrl(),
    SOCKET_URL: getApiUrl(),
    ENV_NAME: 'development',
    ENABLE_LOGGING: true,
  },
  staging: {
    API_URL: 'https://staging.linker.land',
    SOCKET_URL: 'https://staging.linker.land',
    ENV_NAME: 'staging',
    ENABLE_LOGGING: true,
  },
  prod: {
    API_URL: process.env.EXPO_PUBLIC_API_URL || 'https://linker.land',
    SOCKET_URL: process.env.EXPO_PUBLIC_API_URL || 'https://linker.land',
    ENV_NAME: 'production',
    ENABLE_LOGGING: false,
  }
};

const getEnvVars = () => {
  // __DEV__ is set by React Native
  if (__DEV__) {
    return ENV.dev;
  }
  
  // يمكنك التحقق من build config أو متغيرات بيئة أخرى
  const releaseChannel = Constants.manifest?.releaseChannel;
  
  if (releaseChannel === 'staging') {
    return ENV.staging;
  }
  
  return ENV.prod;
};

const config = getEnvVars();

export default {
  ...config,
  // Add any other configuration here
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_IMAGE_FORMATS: ['jpg', 'jpeg', 'png', 'webp'],
  SUPPORTED_VIDEO_FORMATS: ['mp4', 'mov', 'avi'],
  SUPPORTED_AUDIO_FORMATS: ['mp3', 'wav', 'm4a'],
  CACHE_EXPIRY: 30 * 24 * 60 * 60, // 30 days in seconds
  REQUEST_TIMEOUT: 30000, // 30 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
};


