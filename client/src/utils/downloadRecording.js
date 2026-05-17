/**
 * ✅ Download Recording Utility
 * أداة لتحميل التسجيلات على الجهاز
 */

import { Platform, Linking, PermissionsAndroid } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import logger from './logger';

/**
 * ✅ تحميل ملف التسجيل على الجهاز
 */
export const downloadRecording = async (fileUrl, fileName) => {
  try {
    logger.info('Starting recording download', { fileUrl, fileName });

    if (Platform.OS === 'web') {
      // على الويب: فتح في نافذة جديدة أو تحميل مباشر
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName || 'recording.mp4';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      logger.info('Recording download started (web)', { fileUrl, fileName });
      return { success: true, message: 'Download started' };
    }

    // على React Native: تحميل الملف وحفظه
    // 1. طلب الصلاحيات
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('Storage permission denied');
      }
    }

    // 2. طلب صلاحيات Media Library
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Media library permission denied');
    }

    // 3. تحميل الملف
    const fileUri = `${FileSystem.documentDirectory}${fileName || 'recording.mp4'}`;
    const downloadResult = await FileSystem.downloadAsync(fileUrl, fileUri);

    if (!downloadResult.uri) {
      throw new Error('Download failed');
    }

    // 4. حفظ في Media Library
    const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
    await MediaLibrary.createAlbumAsync('Linker Recordings', asset, false);

    logger.info('Recording downloaded successfully', { 
      fileUri: downloadResult.uri,
      assetId: asset.id 
    });

    return { 
      success: true, 
      message: 'Recording saved to gallery',
      fileUri: downloadResult.uri,
      assetId: asset.id
    };
  } catch (error) {
    logger.error('Error downloading recording:', error);
    throw error;
  }
};

/**
 * ✅ فتح ملف التسجيل (بدون تحميل)
 */
export const openRecording = async (fileUrl) => {
  try {
    if (Platform.OS === 'web') {
      window.open(fileUrl, '_blank');
      return { success: true };
    }

    const canOpen = await Linking.canOpenURL(fileUrl);
    if (canOpen) {
      await Linking.openURL(fileUrl);
      return { success: true };
    }

    throw new Error('Cannot open recording URL');
  } catch (error) {
    logger.error('Error opening recording:', error);
    throw error;
  }
};

/**
 * ✅ تنسيق حجم الملف
 */
export const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * ✅ تنسيق المدة
 */
export const formatDuration = (seconds) => {
  if (!seconds) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

