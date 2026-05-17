/**
 * Device Test Component
 * اختبار الأجهزة قبل المكالمة
 */

import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import FeIcon from 'react-native-vector-icons/Feather';
import { MediasoupContext } from '../../contexts/mediasoup.context';
import { useColorScheme } from '../../../lib/useColorScheme';

const DeviceTest = ({ 
  isVisible, 
  onClose, 
  onTestComplete,
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

  const [testResults, setTestResults] = useState({
    audio: null,
    video: null
  });
  const [isTesting, setIsTesting] = useState(false);
  const [currentTest, setCurrentTest] = useState(null);

  // اختبار الصوت
  const testAudio = async () => {
    if (!selectedAudioDevice) {
      Alert.alert('No Audio Device', 'Please select an audio device first');
      return;
    }

    setCurrentTest('audio');
    setIsTesting(true);

    try {
      const stream = await createStream({
        audio: true,
        video: false,
        audioDeviceId: selectedAudioDevice.deviceId,
      });
      
      // إيقاف الـ stream بعد الاختبار
      stream.getTracks().forEach(track => track.stop());
      
      setTestResults(prev => ({
        ...prev,
        audio: { success: true }
      }));

      Alert.alert(
        'Audio Test Successful',
        'Your microphone is working correctly!',
        [{ text: 'OK' }]
      );
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        audio: { success: false, error: error.message }
      }));

      Alert.alert(
        'Audio Test Failed',
        error.message || 'Failed to test microphone',
        [{ text: 'OK' }]
      );
    } finally {
      setCurrentTest(null);
      setIsTesting(false);
    }
  };

  // اختبار الفيديو
  const testVideo = async () => {
    if (!selectedVideoDevice) {
      Alert.alert('No Video Device', 'Please select a video device first');
      return;
    }

    setCurrentTest('video');
    setIsTesting(true);

    try {
      const stream = await createStream({
        audio: false,
        video: true,
        videoDeviceId: selectedVideoDevice.deviceId,
      });
      
      // إيقاف الـ stream بعد الاختبار
      stream.getTracks().forEach(track => track.stop());
      
      setTestResults(prev => ({
        ...prev,
        video: { success: true }
      }));

      Alert.alert(
        'Video Test Successful',
        'Your camera is working correctly!',
        [{ text: 'OK' }]
      );
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        video: { success: false, error: error.message }
      }));

      Alert.alert(
        'Video Test Failed',
        error.message || 'Failed to test camera',
        [{ text: 'OK' }]
      );
    } finally {
      setCurrentTest(null);
      setIsTesting(false);
    }
  };

  // اختبار جميع الأجهزة
  const testAllDevices = async () => {
    setIsTesting(true);
    
    try {
      // اختبار الصوت
      if (selectedAudioDevice) {
        await testAudio();
      }
      
      // اختبار الفيديو
      if (isVideoCall && selectedVideoDevice) {
        await testVideo();
      }
      
      // إكمال الاختبار
      if (onTestComplete) {
        onTestComplete(testResults);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const getTestStatusIcon = (deviceType) => {
    const result = testResults[deviceType];
    if (!result) return 'help-circle-outline';
    if (result.success) return 'checkmark-circle';
    return 'close-circle';
  };

  const getTestStatusColor = (deviceType) => {
    const result = testResults[deviceType];
    if (!result) return '#6B7280';
    if (result.success) return '#10B981';
    return '#EF4444';
  };

  if (!isVisible) return null;

  return (
    <View className="absolute inset-0 bg-black/50 justify-center items-center z-50">
      <View className="bg-white dark:bg-gray-900 rounded-2xl p-6 mx-4 max-w-md w-full">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <Text className="text-xl font-bold text-gray-900 dark:text-white">
            Device Test
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

        {/* Device Status */}
        <View className="mb-6">
          {/* Audio Status */}
          <View className="flex-row items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 rounded-lg mb-3">
            <View className="flex-row items-center">
              <FeIcon name="mic" size={20} color="#3B82F6" />
              <Text className="ml-2 text-gray-900 dark:text-white">
                Microphone
              </Text>
            </View>
            <View className="flex-row items-center">
              <Icon 
                name={getTestStatusIcon('audio')} 
                size={20} 
                color={getTestStatusColor('audio')} 
              />
              <Text className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                {selectedAudioDevice ? 
                  (selectedAudioDevice.label || 'Selected') : 
                  'Not selected'
                }
              </Text>
            </View>
          </View>

          {/* Video Status */}
          {isVideoCall && (
            <View className="flex-row items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <View className="flex-row items-center">
                <FeIcon name="video" size={20} color="#3B82F6" />
                <Text className="ml-2 text-gray-900 dark:text-white">
                  Camera
                </Text>
              </View>
              <View className="flex-row items-center">
                <Icon 
                  name={getTestStatusIcon('video')} 
                  size={20} 
                  color={getTestStatusColor('video')} 
                />
                <Text className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                  {selectedVideoDevice ? 
                    (selectedVideoDevice.label || 'Selected') : 
                    'Not selected'
                  }
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Test Buttons */}
        <View className="space-y-3">
          <TouchableOpacity
            onPress={testAudio}
            disabled={!selectedAudioDevice || isTesting}
            className={`py-3 px-4 rounded-lg items-center ${
              !selectedAudioDevice || isTesting
                ? 'bg-gray-300 dark:bg-gray-700'
                : 'bg-blue-100 dark:bg-blue-900'
            }`}
          >
            <Text className={`font-medium ${
              !selectedAudioDevice || isTesting
                ? 'text-gray-500 dark:text-gray-400'
                : 'text-blue-800 dark:text-blue-200'
            }`}>
              {currentTest === 'audio' ? 'Testing...' : 'Test Microphone'}
            </Text>
          </TouchableOpacity>

          {isVideoCall && (
            <TouchableOpacity
              onPress={testVideo}
              disabled={!selectedVideoDevice || isTesting}
              className={`py-3 px-4 rounded-lg items-center ${
                !selectedVideoDevice || isTesting
                  ? 'bg-gray-300 dark:bg-gray-700'
                  : 'bg-blue-100 dark:bg-blue-900'
              }`}
            >
              <Text className={`font-medium ${
                !selectedVideoDevice || isTesting
                  ? 'text-gray-500 dark:text-gray-400'
                  : 'text-blue-800 dark:text-blue-200'
              }`}>
                {currentTest === 'video' ? 'Testing...' : 'Test Camera'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={testAllDevices}
            disabled={isTesting || (!selectedAudioDevice || (isVideoCall && !selectedVideoDevice))}
            className={`py-3 px-4 rounded-lg items-center ${
              isTesting || (!selectedAudioDevice || (isVideoCall && !selectedVideoDevice))
                ? 'bg-gray-300 dark:bg-gray-700'
                : 'bg-primary'
            }`}
          >
            <Text className={`font-medium ${
              isTesting || (!selectedAudioDevice || (isVideoCall && !selectedVideoDevice))
                ? 'text-gray-500 dark:text-gray-400'
                : 'text-white'
            }`}>
              {isTesting ? 'Testing All Devices...' : 'Test All Devices'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View className="flex-row space-x-3 mt-6">
          <TouchableOpacity
            onPress={refreshDevices}
            disabled={isTesting}
            className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-800 rounded-lg items-center"
          >
            <Text className="font-medium text-gray-900 dark:text-white">
              Refresh
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 px-4 bg-primary rounded-lg items-center"
          >
            <Text className="text-white font-medium">Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default DeviceTest;
