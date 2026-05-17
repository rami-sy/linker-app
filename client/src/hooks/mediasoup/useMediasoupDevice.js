/**
 * ✅ useMediasoupDevice
 * إدارة الأجهزة (Device Management) في useMediasoup
 */

import { useCallback } from 'react';
import { Platform } from 'react-native';
import deviceManager from '../../utils/deviceManager';
import logger from '../../utils/logger';
import { createError, ERROR_CODES } from '../../utils/errorCodes';

/**
 * ✅ Device Management Functions
 */
export const useMediasoupDevice = ({
  // State
  devices, setDevices,
  audioDevices, setAudioDevices,
  videoDevices, setVideoDevices,
  selectedAudioDevice, setSelectedAudioDevice,
  selectedVideoDevice, setSelectedVideoDevice,
  isDetecting, setIsDetecting,
  detectionError, setDetectionError,
  hasAudio, setHasAudio,
  hasVideo, setHasVideo,
  audioPermission, setAudioPermission,
  videoPermission, setVideoPermission,
}) => {
  /**
   * طلب إذن الوصول للأجهزة
   */
  const requestDevicePermissions = useCallback(async () => {
    if (Platform.OS !== 'web') {
      return { audio: false, video: false };
    }

    try {
      const result = await deviceManager.requestDevicePermissions();
      setAudioPermission(result.audio);
      setVideoPermission(result.video);
      return result;
    } catch (error) {
      logger.error('Permission request failed:', error);
      setAudioPermission(false);
      setVideoPermission(false);
      return { audio: false, video: false };
    }
  }, [setAudioPermission, setVideoPermission]);

  /**
   * طلب الأذونات مع إعادة المحاولة
   */
  const requestDevicePermissionsWithRetry = useCallback(async (maxRetries = 3) => {
    if (Platform.OS !== 'web') {
      return { audio: false, video: false };
    }

    try {
      const result = await deviceManager.requestDevicePermissionsWithRetry({ maxRetries });
      setAudioPermission(result.audio);
      setVideoPermission(result.video);
      return result;
    } catch (error) {
      logger.error('Permission request with retry failed:', error);
      setAudioPermission(false);
      setVideoPermission(false);
      return { audio: false, video: false };
    }
  }, [setAudioPermission, setVideoPermission]);

  /**
   * كشف الأجهزة المتاحة (Lazy Loading)
   */
  const detectDevices = useCallback(async (forceRefresh = false) => {
    if (Platform.OS !== 'web') {
      return { hasAudio: false, hasVideo: false, audioDevices: [], videoDevices: [] };
    }

    // Lazy Loading: إذا تم الكشف مسبقاً ولا نريد refresh، نعيد النتائج المحفوظة
    if (!forceRefresh && devices.length > 0 && audioDevices.length > 0 && videoDevices.length > 0) {
      logger.debug('Devices already detected, returning cached results', {
        devicesCount: devices.length,
        audioDevicesCount: audioDevices.length,
        videoDevicesCount: videoDevices.length
      });
      return {
        hasAudio,
        hasVideo,
        audioDevices,
        videoDevices,
        allDevices: devices
      };
    }

    try {
      setIsDetecting(true);
      setDetectionError(null);
      
      logger.debug('Detecting devices...', { forceRefresh });
      
      // استخدام Device Manager
      const deviceInfo = await deviceManager.detectDevices();
      
      // تحديث state
      setDevices(deviceInfo.allDevices || []);
      setAudioDevices(deviceInfo.audioDevices || []);
      setVideoDevices(deviceInfo.videoDevices || []);
      setHasAudio(deviceInfo.hasAudio);
      setHasVideo(deviceInfo.hasVideo);
      
      // اختيار الأجهزة الافتراضية
      const selectedDevices = deviceManager.getSelectedDevices(deviceInfo);
      if (selectedDevices.selectedAudioDevice && !selectedAudioDevice) {
        setSelectedAudioDevice(selectedDevices.selectedAudioDevice);
      }
      if (selectedDevices.selectedVideoDevice && !selectedVideoDevice) {
        setSelectedVideoDevice(selectedDevices.selectedVideoDevice);
      }
      
      logger.debug('Device detection complete', {
        audioDevices: deviceInfo.audioDevices?.length || 0,
        videoDevices: deviceInfo.videoDevices?.length || 0,
        hasAudio: deviceInfo.hasAudio,
        hasVideo: deviceInfo.hasVideo
      });
      
      return deviceInfo;
    } catch (error) {
      logger.error('Device detection failed:', error);
      setDetectionError(error);
      throw error;
    } finally {
      setIsDetecting(false);
    }
  }, [
    selectedAudioDevice, selectedVideoDevice, devices, audioDevices, videoDevices, hasAudio, hasVideo,
    setDevices, setAudioDevices, setVideoDevices, setHasAudio, setHasVideo,
    setIsDetecting, setDetectionError, setSelectedAudioDevice, setSelectedVideoDevice
  ]);

  /**
   * تحديث قائمة الأجهزة
   */
  const refreshDevices = useCallback(async () => {
    return detectDevices(true);
  }, [detectDevices]);

  /**
   * تبديل جهاز الصوت
   */
  const switchAudioDevice = useCallback(async (deviceId) => {
    if (Platform.OS !== 'web') {
      throw createError(ERROR_CODES.DEVICE_NOT_SUPPORTED, 'Device switching not supported on mobile');
    }

    try {
      const device = audioDevices.find(d => d.deviceId === deviceId);
      if (!device) {
        throw createError(ERROR_CODES.DEVICE_NOT_FOUND, 'Audio device not found');
      }

      setSelectedAudioDevice(device);
      logger.deviceEvent('Audio device switched', { deviceId, deviceLabel: device.label });
      
      // TODO: إعادة إنشاء stream مع الجهاز الجديد إذا كان stream نشط
      return device;
    } catch (error) {
      logger.error('Error switching audio device:', error);
      throw error;
    }
  }, [audioDevices, setSelectedAudioDevice]);

  /**
   * تبديل جهاز الفيديو
   */
  const switchVideoDevice = useCallback(async (deviceId) => {
    if (Platform.OS !== 'web') {
      throw createError(ERROR_CODES.DEVICE_NOT_SUPPORTED, 'Device switching not supported on mobile');
    }

    try {
      const device = videoDevices.find(d => d.deviceId === deviceId);
      if (!device) {
        throw createError(ERROR_CODES.DEVICE_NOT_FOUND, 'Video device not found');
      }

      setSelectedVideoDevice(device);
      logger.deviceEvent('Video device switched', { deviceId, deviceLabel: device.label });
      
      // TODO: إعادة إنشاء stream مع الجهاز الجديد إذا كان stream نشط
      return device;
    } catch (error) {
      logger.error('Error switching video device:', error);
      throw error;
    }
  }, [videoDevices, setSelectedVideoDevice]);

  return {
    requestDevicePermissions,
    requestDevicePermissionsWithRetry,
    detectDevices,
    refreshDevices,
    switchAudioDevice,
    switchVideoDevice,
  };
};

