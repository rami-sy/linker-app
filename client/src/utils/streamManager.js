import logger from './logger';
import { createError, ERROR_CODES } from './errorCodes';

/**
 * Stream Manager - إدارة موحدة لـ MediaStream
 * 
 * هذا الملف يوفر:
 * 1. constraintsBuilder - إنشاء constraints بطريقة موحدة
 * 2. streamManager - إدارة تدفق MediaStream
 * 3. error handling موحد
 */

/**
 * بناء constraints للـ getUserMedia
 * @param {Object} options - خيارات البناء
 * @returns {Object} MediaTrackConstraints
 */
export const buildMediaConstraints = ({
  hasAudio = true,
  hasVideo = true,
  audioDeviceId = null,
  videoDeviceId = null,
}) => {
  const constraints = {};
  
  // إعداد audio constraints
  if (hasAudio) {
    constraints.audio = audioDeviceId 
      ? { deviceId: { exact: audioDeviceId } }
      : true;
  } else {
    constraints.audio = false;
  }
  
  // إعداد video constraints
  if (hasVideo) {
    constraints.video = videoDeviceId 
      ? { deviceId: { exact: videoDeviceId } }
      : true;
  } else {
    constraints.video = false;
  }
  
  logger.deviceEvent('Built constraints', constraints);
  return constraints;
};

/**
 * التحقق من توفر الأجهزة
 * @param {Object} deviceState - حالة الأجهزة
 * @returns {Object} التحقق من الأجهزة
 */
export const validateDevices = ({
  hasAudio,
  hasVideo,
  audioDevices = [],
  videoDevices = [],
}) => {
  // السماح بالمتابعة إذا كانت hasAudio/hasVideo صحيحة
  // لأن getUserMedia يمكنه الوصول للأجهزة مباشرة دون حاجة لتعدادها
  const audioAvailable = hasAudio;
  const videoAvailable = hasVideo;
  const anyDeviceAvailable = audioAvailable || videoAvailable;
  
  logger.deviceEvent('Validating devices', {
    audioAvailable,
    videoAvailable,
    anyDeviceAvailable,
    audioDevicesCount: audioDevices.length,
    videoDevicesCount: videoDevices.length,
    hasAudio,
    hasVideo
  });
  
  return {
    audioAvailable: hasAudio,
    videoAvailable: hasVideo,
    anyDeviceAvailable,
    canProceed: anyDeviceAvailable
  };
};

/**
 * إنشاء MediaStream بطريقة موحدة
 * @param {Object} options - خيارات إنشاء الـ stream
 * @returns {Promise<MediaStream>} MediaStream
 */
export const createMediaStream = async ({
  hasAudio = true,
  hasVideo = true,
  audioDeviceId = null,
  videoDeviceId = null,
  audioDevices = [],
  videoDevices = []
}) => {
  // التحقق من توفر الأجهزة
  const validation = validateDevices({ hasAudio, hasVideo, audioDevices, videoDevices });
  
  if (!validation.canProceed) {
    logger.error('No devices available for stream creation', {
      hasAudio,
      hasVideo,
      audioDevicesCount: audioDevices.length,
      videoDevicesCount: videoDevices.length
    });
    throw createError(ERROR_CODES.DEVICE_NOT_FOUND, 'No audio or video devices found. Please connect a microphone or camera and grant permissions.');
  }
  
  // بناء constraints
  const constraints = buildMediaConstraints({
    hasAudio: validation.audioAvailable,
    hasVideo: validation.videoAvailable,
    audioDeviceId,
    videoDeviceId
  });
  
  try {
    logger.streamEvent('Creating media stream with constraints', constraints);
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    logger.streamEvent('Got local stream', {
      id: stream.id,
      active: stream.active,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length
    });
    
    return stream;
  } catch (error) {
    logger.error('Error creating media stream', error);
    
    // تحسين رسالة الخطأ
    if (error.name === 'NotFoundError') {
      throw createError(ERROR_CODES.DEVICE_NOT_FOUND, 'No audio or video devices found. Please connect a microphone or camera and grant permissions.');
    } else if (error.name === 'NotAllowedError') {
      throw createError(ERROR_CODES.DEVICE_PERMISSION_DENIED, 'Permission denied. Please grant camera and microphone permissions.');
    } else if (error.name === 'NotReadableError') {
      throw createError(ERROR_CODES.DEVICE_IN_USE, 'Device is already in use by another application.');
    } else {
      throw createError(ERROR_CODES.STREAM_CREATION_FAILED, `Failed to access media devices: ${error.message}`);
    }
  }
};

/**
 * إيقاف جميع tracks في stream
 * @param {MediaStream} stream - الـ stream المراد إيقافه
 */
export const stopMediaStream = (stream) => {
  if (!stream) return;
  
  logger.streamEvent('Stopping media stream', stream.id);
  
  // إيقاف جميع tracks
  stream.getTracks().forEach(track => {
    logger.streamEvent('Stopping track', {
      kind: track.kind,
      enabled: track.enabled,
      readyState: track.readyState
    });
    track.stop();
  });
  
  logger.streamEvent('Media stream stopped');
};

/**
 * استبدال track في stream
 * @param {MediaStream} stream - الـ stream المراد تعديله
 * @param {string} kind - نوع الـ track ('audio' أو 'video')
 * @param {MediaStreamTrack} newTrack - الـ track الجديد
 */
export const replaceTrack = async (stream, kind, newTrack) => {
  const oldTracks = stream.getTracks().filter(track => track.kind === kind);
  
  // إزالة الـ tracks القديمة
  oldTracks.forEach(track => {
    stream.removeTrack(track);
    track.stop();
  });
  
  // إضافة الـ track الجديد
  if (newTrack) {
    stream.addTrack(newTrack);
  }
  
  logger.streamEvent(`Replaced ${kind} track`);
};

export default {
  buildMediaConstraints,
  validateDevices,
  createMediaStream,
  stopMediaStream,
  replaceTrack
};

