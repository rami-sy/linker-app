/**
 * Device Selector Component
 * مكون اختيار أجهزة الكاميرا والميكروفون
 */

import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import Icon from '@expo/vector-icons/Ionicons';
import FeIcon from '@expo/vector-icons/Feather';
import { MediasoupContext } from '../../contexts/mediasoup.context';
import Modal from '../modal';
import { useColorScheme } from '../../../lib/useColorScheme';

const DeviceSelector = ({ 
  isVisible, 
  onClose, 
  onDeviceSelected,
  isVideoCall = true 
}) => {
  const { isDarkColorScheme } = useColorScheme();
  
  const {
    audioDevices,
    videoDevices,
    selectedAudioDevice,
    selectedVideoDevice,
    isDetecting,
    detectionError,
    hasAudio,
    hasVideo,
    setSelectedAudioDevice,
    setSelectedVideoDevice,
    detectDevices,
    refreshDevices,
    createStream,
  } = useContext(MediasoupContext);

  const [testingDevice, setTestingDevice] = useState(null);
  const [permissionsChecked, setPermissionsChecked] = useState(false);

  // إعادة كشف الأجهزة عند فتح المكون
  useEffect(() => {
    if (isVisible) {
      detectDevices();
    }
  }, [isVisible, detectDevices]);

  const handleDeviceSelect = (deviceId, deviceType) => {
    if (deviceType === 'audio') {
      const device = audioDevices.find(d => d.deviceId === deviceId);
      if (device) {
        setSelectedAudioDevice(device);
      }
    } else if (deviceType === 'video') {
      const device = videoDevices.find(d => d.deviceId === deviceId);
      if (device) {
        setSelectedVideoDevice(device);
      }
    }
  };

  const handleTestDevice = async (deviceId, deviceType) => {
    setTestingDevice(`${deviceType}-${deviceId}`);
    
    try {
      const stream = await createStream({
        audio: deviceType === 'audio',
        video: deviceType === 'video',
        audioDeviceId: deviceType === 'audio' ? deviceId : null,
        videoDeviceId: deviceType === 'video' ? deviceId : null,
      });
      
      // إيقاف الـ stream بعد الاختبار
      stream.getTracks().forEach(track => track.stop());
      
      Alert.alert(
        'Device Test',
        `${deviceType === 'audio' ? 'Microphone' : 'Camera'} is working correctly!`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Device Test Failed',
        error.message || 'Failed to test device',
        [{ text: 'OK' }]
      );
    } finally {
      setTestingDevice(null);
    }
  };

  const handleConfirm = () => {
    if (onDeviceSelected) {
      onDeviceSelected({
        audioDevice: selectedAudioDevice,
        videoDevice: selectedVideoDevice
      });
    }
    onClose();
  };

  const renderDeviceItem = (device, deviceType) => {
    const isSelected = deviceType === 'audio' 
      ? selectedAudioDevice?.deviceId === device.deviceId
      : selectedVideoDevice?.deviceId === device.deviceId;
    
    const isTesting = testingDevice === `${deviceType}-${device.deviceId}`;
    const deviceLabel = device.label || `${deviceType === 'audio' ? 'Microphone' : 'Camera'} ${device.deviceId.slice(0, 8)}`;

    return (
      <View
        key={device.deviceId}
        className={`p-4 mb-3 rounded-xl border-2 ${
          isSelected 
            ? 'border-primary bg-primary/10' 
            : 'border-gray-200 dark:border-gray-700'
        } bg-white dark:bg-gray-800`}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
              isSelected ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
            }`}>
              {deviceType === 'audio' ? (
                <FeIcon 
                  name="mic" 
                  size={20} 
                  color={isSelected ? 'white' : (isDarkColorScheme ? '#9CA3AF' : '#6B7280')} 
                />
              ) : (
                <FeIcon 
                  name="video" 
                  size={20} 
                  color={isSelected ? 'white' : (isDarkColorScheme ? '#9CA3AF' : '#6B7280')} 
                />
              )}
            </View>
            
            <View className="flex-1">
              <Text className="text-base font-medium text-gray-900 dark:text-white">
                {deviceLabel}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {device.deviceId}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center space-x-2">
            <TouchableOpacity
              onPress={() => handleTestDevice(device.deviceId, deviceType)}
              disabled={isTesting}
              className={`px-3 py-2 rounded-lg ${
                isTesting ? 'bg-gray-300' : 'bg-blue-100 dark:bg-blue-900'
              }`}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : (
                <FeIcon name="play" size={16} color="#3B82F6" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleDeviceSelect(device.deviceId, deviceType)}
              className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                isSelected 
                  ? 'border-primary bg-primary' 
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              {isSelected && (
                <Icon name="checkmark" size={14} color="white" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal showModal={isVisible} setShowModal={onClose} onCancel={onClose}>
      <View className="bg-[#dee4e6] dark:bg-main rounded-2xl p-6 mx-4 max-w-md w-11/12 max-h-[80%] shadow-xl">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <Text className="text-xl font-bold text-slate-800 dark:text-slate-200">
            Select Devices
          </Text>
          <TouchableOpacity
            onPress={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center"
          >
            <Icon name="close" size={20} color={isDarkColorScheme ? '#9CA3AF' : '#6B7280'} />
          </TouchableOpacity>
        </View>

        {/* Error Message */}
        {detectionError && (
          <View className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
            <Text className="text-red-800 dark:text-red-200 text-sm">
              {detectionError}
            </Text>
          </View>
        )}

        {/* Loading State */}
        {isDetecting && (
          <View className="items-center py-8">
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text className={`text-gray-600 dark:text-gray-400 mt-2`}>
              Detecting devices...
            </Text>
          </View>
        )}

        {/* Device Lists */}
        {!isDetecting && (
          <ScrollView className="max-h-96">
            {/* Audio Devices */}
            <View className="mb-6">
              <View className="flex-row items-center mb-3">
                <FeIcon name="mic" size={20} color="#3B82F6" />
                <Text className="text-lg font-semibold ml-2 text-slate-800 dark:text-slate-200">
                  Microphone
                </Text>
                {!hasAudio && (
                  <Text className="text-red-500 text-sm ml-2">(No devices found)</Text>
                )}
              </View>
              
              {audioDevices.length > 0 ? (
                audioDevices.map((device, index) => (
                  <View key={`audio-${device.deviceId || index}`}>
                    {renderDeviceItem(device, 'audio')}
                  </View>
                ))
              ) : (
                <View className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <Text className={`text-slate-500 dark:text-slate-400 text-center`}>
                    No microphones found
                  </Text>
                </View>
              )}
            </View>

            {/* Video Devices */}
            {isVideoCall && (
              <View className="mb-6">
                <View className="flex-row items-center mb-3">
                  <FeIcon name="video" size={20} color="#3B82F6" />
                  <Text className="text-lg font-semibold ml-2 text-slate-800 dark:text-slate-200">
                    Camera
                  </Text>
                  {!hasVideo && (
                    <Text className="text-red-500 text-sm ml-2">(No devices found)</Text>
                  )}
                </View>
                
                {videoDevices.length > 0 ? (
                  videoDevices.map((device, index) => (
                    <View key={`video-${device.deviceId || index}`}>
                      {renderDeviceItem(device, 'video')}
                    </View>
                  ))
                ) : (
                  <View className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <Text className={`text-slate-500 dark:text-slate-400 text-center`}>
                      No cameras found
                    </Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        )}

        {/* Action Buttons */}
        <View className="flex-row space-x-3 mt-6">
          <TouchableOpacity
            onPress={refreshDevices}
            disabled={isDetecting}
            className="flex-1 py-3 px-4 bg-[#e7ecef] dark:bg-[#1f2937] rounded-lg items-center"
          >
            <Text className="font-medium text-slate-800 dark:text-slate-200">
              Refresh
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={!selectedAudioDevice || (isVideoCall && !selectedVideoDevice)}
            className={`flex-1 py-3 px-4 rounded-lg items-center ${
              (!selectedAudioDevice || (isVideoCall && !selectedVideoDevice))
                ? 'bg-gray-300 dark:bg-gray-700'
                : 'bg-primary'
            }`}
          >
            <Text className={`font-medium ${
              (!selectedAudioDevice || (isVideoCall && !selectedVideoDevice))
                ? 'text-gray-500 dark:text-gray-400'
                : 'text-white'
            }`}>
              Confirm
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default DeviceSelector;
