/**
 * Device Error Handler Component
 * معالج أخطاء الأجهزة مع حلول مقترحة
 */

import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import FeIcon from 'react-native-vector-icons/Feather';
import logger from '../../utils/logger';
import { useColorScheme } from '../../../lib/useColorScheme';
import { useTranslation } from 'react-i18next';

const DeviceErrorHandler = ({ 
  error, 
  onRetry, 
  onClose,
  onOpenDeviceSettings,
  isVisible = true
}) => {
  const { isDarkColorScheme } = useColorScheme();
  const { t } = useTranslation();

  const getErrorInfo = (error) => {
    // ✅ تم إزالة logger.deviceEvent لتقليل اللوغات المتكررة
    // logger.deviceEvent('getErrorInfo called with:', error);
    if (!error) return null;

    const errorMessage = error.message || error.toString();
    // ✅ تم إزالة logger.deviceEvent لتقليل اللوغات المتكررة
    // logger.deviceEvent('Error message:', errorMessage);
    
    if (errorMessage.includes('No audio input device found') || 
        errorMessage.includes('NotFoundError')) {
      return {
        title: t('call.deviceErrors.noMicrophoneTitle', { defaultValue: 'No Microphone Found' }),
        message: t('call.deviceErrors.noMicrophoneMessage', { defaultValue: 'Please connect a microphone to make calls' }),
        icon: 'mic-off',
        color: '#EF4444',
        solutions: [
          'Connect a microphone or headset',
          'Check if microphone is properly connected',
          'Try refreshing the page',
          'Check browser permissions'
        ],
        action: t('call.deviceErrors.connectDeviceAction', { defaultValue: 'Connect Device' })
      };
    }
    
    if (errorMessage.includes('No audio or video devices found')) {
      return {
        title: t('call.deviceErrors.noDevicesTitle', { defaultValue: 'No Devices Found' }),
        message: t('call.deviceErrors.noDevicesMessage', { defaultValue: 'Please connect a microphone or camera and grant permissions' }),
        icon: 'camera-off',
        color: '#EF4444',
        solutions: [
          'Connect a microphone or camera to your device',
          'Grant permission when prompted by your browser',
          'Check browser settings for camera/microphone access',
          'Try refreshing the page and try again',
          'Make sure no other app is using your camera/microphone'
        ],
        action: t('call.deviceErrors.grantPermissionAction', { defaultValue: 'Grant Permission' })
      };
    }
    
    if (errorMessage.includes('Permission denied') || 
        errorMessage.includes('NotAllowedError')) {
      return {
        title: t('call.deviceErrors.permissionDeniedTitle', { defaultValue: 'Permission Denied' }),
        message: t('call.deviceErrors.permissionDeniedMessage', { defaultValue: 'Please allow access to your microphone and camera' }),
        icon: 'shield-off',
        color: '#F59E0B',
        solutions: [
          'Click the microphone/camera icon in your browser',
          'Select "Allow" when prompted',
          'Refresh the page and try again',
          'Check browser settings for blocked permissions'
        ],
        action: t('call.deviceErrors.grantPermissionAction', { defaultValue: 'Grant Permission' })
      };
    }
    
    if (errorMessage.includes('already in use') || 
        errorMessage.includes('NotReadableError')) {
      return {
        title: t('call.deviceErrors.deviceInUseTitle', { defaultValue: 'Device In Use' }),
        message: t('call.deviceErrors.deviceInUseMessage', { defaultValue: 'Your microphone is being used by another application' }),
        icon: 'warning',
        color: '#F59E0B',
        solutions: [
          'Close other applications using the microphone',
          'Check if another tab is using the microphone',
          'Restart your browser',
          'Try again in a few seconds'
        ],
        action: t('call.deviceErrors.tryAgainAction', { defaultValue: 'Try Again' })
      };
    }
    
    if (errorMessage.includes('NotSupportedError') || 
        errorMessage.includes('not supported')) {
      return {
        title: t('call.deviceErrors.browserNotSupportedTitle', { defaultValue: 'Browser Not Supported' }),
        message: t('call.deviceErrors.browserNotSupportedMessage', { defaultValue: 'Your browser does not support camera/microphone access' }),
        icon: 'browser-outline',
        color: '#6B7280',
        solutions: [
          'Use a modern browser (Chrome, Firefox, Safari)',
          'Make sure you are using HTTPS',
          'Update your browser to the latest version',
          'Try a different browser'
        ],
        action: t('call.deviceErrors.changeBrowserAction', { defaultValue: 'Change Browser' })
      };
    }

    // Default error
    return {
      title: t('call.deviceErrors.deviceErrorTitle', { defaultValue: 'Device Error' }),
      message: errorMessage,
      icon: 'alert-circle',
      color: '#EF4444',
      solutions: [
        'Check your device connections',
        'Refresh the page',
        'Try a different device',
        'Contact support if the problem persists'
      ],
      action: t('call.deviceErrors.retryAction', { defaultValue: 'Retry' })
    };
  };
  
  const errorInfo = getErrorInfo(error);
  
  // ✅ تم إزالة logger.deviceEvent لتقليل اللوغات المتكررة
  // logger.deviceEvent('getErrorInfo returning:', errorInfo);
  // logger.deviceEvent('DeviceErrorHandler render:', { isVisible, error: !!error, errorInfo: !!errorInfo });
  
  if (!isVisible || !error || !errorInfo) {
    // ✅ تم إزالة logger.deviceEvent لتقليل اللوغات المتكررة
    // logger.deviceEvent('DeviceErrorHandler: Not rendering because:', { isVisible, hasError: !!error, hasErrorInfo: !!errorInfo });
    return null;
  }
  
  // ✅ تم إزالة logger.deviceEvent لتقليل اللوغات المتكررة
  // logger.deviceEvent('DeviceErrorHandler: Rendering error modal');

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
  };

  const handleOpenSettings = () => {
    if (onOpenDeviceSettings) {
      onOpenDeviceSettings();
    }
  };

  const showSolutions = () => {
    Alert.alert(
      t('call.deviceErrors.troubleshootingTitle', { defaultValue: 'Troubleshooting Steps' }),
      errorInfo.solutions.join('\n\n'),
      [{ text: t('general.ok', { defaultValue: 'OK' }) }]
    );
  };

  // ✅ تم إزالة logger.deviceEvent لتقليل اللوغات المتكررة
  // logger.deviceEvent('DeviceErrorHandler: About to render modal');
  
  return (
    <View style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999
    }}>
      <View style={{
        backgroundColor: isDarkColorScheme ? '#1f2937' : '#f6f8f9',
        borderRadius: 16,
        padding: 24,
        marginHorizontal: 16,
        maxWidth: 400,
        width: '100%',
        border: '2px solid #3b82f6'
      }}>
        {/* Header */}
        <View className="items-center mb-6">
          <View className={`w-16 h-16 rounded-full items-center justify-center mb-4 ${
            errorInfo.color === '#EF4444' ? 'bg-red-100 dark:bg-red-900/20' :
            errorInfo.color === '#F59E0B' ? 'bg-yellow-100 dark:bg-yellow-900/20' :
            'bg-gray-100 dark:bg-gray-800'
          }`}>
            <FeIcon 
              name={errorInfo.icon} 
              size={32} 
              color={errorInfo.color} 
            />
          </View>
          
          <Text className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
            {errorInfo.title}
          </Text>
          
          <Text className="text-center text-gray-600 dark:text-gray-400">
            {errorInfo.message}
          </Text>
        </View>

        {/* Solutions Button */}
        <TouchableOpacity
          onPress={showSolutions}
          className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
        >
          <View className="flex-row items-center justify-center">
            <FeIcon name="help-circle" size={16} color="#3B82F6" />
            <Text className="text-blue-800 dark:text-blue-200 ml-2 font-medium">
              Show Troubleshooting Steps
            </Text>
          </View>
        </TouchableOpacity>

        {/* Action Buttons */}
        <View className="space-y-3">
          <TouchableOpacity
            onPress={handleRetry}
            className="py-3 px-4 bg-primary rounded-lg items-center"
          >
            <Text className="text-white font-medium">
              {errorInfo.action}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOpenSettings}
            className="py-3 px-4 bg-gray-100 dark:bg-gray-800 rounded-lg items-center"
          >
            <Text className="font-medium text-gray-900 dark:text-white">
              Device Settings
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onClose}
            className="py-3 px-4 bg-gray-200 dark:bg-gray-700 rounded-lg items-center"
          >
            <Text className="font-medium text-gray-600 dark:text-gray-300">
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default DeviceErrorHandler;
