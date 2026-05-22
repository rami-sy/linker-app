/**
 * Device Settings Component
 * إعدادات الأجهزة أثناء المكالمة
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Switch, Platform, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import FeIcon from 'react-native-vector-icons/Feather';
import DeviceSelector from './DeviceSelector';
import Modal from '../modal';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '../../../lib/useColorScheme';

const DeviceSettings = ({ 
  isVisible, 
  onClose,
  onDeviceChange,
  currentAudioDevice,
  currentVideoDevice,
  isAudioEnabled,
  isVideoEnabled,
  onToggleAudio,
  onToggleVideo,
  isVideoCall = true
}) => {
  const { isDarkColorScheme } = useColorScheme();
  const { t } = useTranslation();
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const [deviceSelectorType, setDeviceSelectorType] = useState(null); // 'audio' or 'video'

  const handleDeviceSelected = (devices) => {
    if (onDeviceChange) {
      onDeviceChange(devices);
    }
    setShowDeviceSelector(false);
    setDeviceSelectorType(null);
  };

  const getDeviceLabel = (device) => {
    if (!device) return t('call.deviceSettings.default') || 'Default';
    return device.label || `${device.kind === 'audioinput' ? (t('call.deviceSettings.microphone') || 'Microphone') : (t('call.deviceSettings.camera') || 'Camera')} ${device.deviceId.slice(0, 8)}`;
  };

  return (
    <>
      <Modal
        showModal={isVisible}
        setShowModal={() => onClose?.()}
        opacity="70"
        animationType="slide"
      >
        <View
          className="w-11/12 linker-w rounded-2xl pt-4 px-4 pb-4 bg-[#dee4e6] dark:bg-main"
          style={
            Platform.OS === "web"
              ? {
                  maxHeight: "95vh",
                }
              : {
                  maxHeight: "90%",
                }
          }
        >
            {/* Header */}
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-placeholder dark:text-papaya">
                {t("call.deviceSettings.title") || t("call.deviceSettings") || "Device Settings"}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                className="items-center justify-center w-12 h-12 p-2"
              >
                <FeIcon
                  name="x"
                  size={30}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                />
              </TouchableOpacity>
            </View>

            {/* Device Settings List */}
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
              <View className="gap-y-2">
                {/* Audio Settings */}
                <View className="mb-4">
                  <View className="flex-row items-center justify-between mb-4">
                    <View className="flex-row items-center flex-1">
                      <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                        isAudioEnabled ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        <FeIcon 
                          name="mic" 
                          size={20} 
                          color={isAudioEnabled ? '#10B981' : (isDarkColorScheme ? '#9CA3AF' : '#6B7280')} 
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-lg font-medium text-placeholder dark:text-papaya">
                          {t("call.deviceSettings.microphone") || "Microphone"}
                        </Text>
                        <Text className="text-sm text-slate-500 dark:text-slate-400">
                          {getDeviceLabel(currentAudioDevice)}
                        </Text>
                      </View>
                    </View>
                    
                    <Switch
                      value={isAudioEnabled}
                      onValueChange={onToggleAudio}
                      trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                      thumbColor={isAudioEnabled ? '#f6f8f9' : '#F3F4F6'}
                    />
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      setDeviceSelectorType('audio');
                      setShowDeviceSelector(true);
                    }}
                    className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-placeholder dark:text-papaya">
                        {t("call.deviceSettings.changeMicrophone") || "Change Microphone"}
                      </Text>
                      <FeIcon 
                        name="chevron-right" 
                        size={20} 
                        color={isDarkColorScheme ? '#94a3b8' : '#64748b'} 
                      />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Video Settings */}
                {isVideoCall && (
                  <View className="mb-4">
                    <View className="flex-row items-center justify-between mb-4">
                      <View className="flex-row items-center flex-1">
                        <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                          isVideoEnabled ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-800'
                        }`}>
                          <FeIcon 
                            name="video" 
                            size={20} 
                            color={isVideoEnabled ? '#10B981' : (isDarkColorScheme ? '#9CA3AF' : '#6B7280')} 
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="text-lg font-medium text-placeholder dark:text-papaya">
                            {t("call.deviceSettings.camera") || "Camera"}
                          </Text>
                          <Text className="text-sm text-slate-500 dark:text-slate-400">
                            {getDeviceLabel(currentVideoDevice)}
                          </Text>
                        </View>
                      </View>
                      
                      <Switch
                        value={isVideoEnabled}
                        onValueChange={onToggleVideo}
                        trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                        thumbColor={isVideoEnabled ? '#f6f8f9' : '#F3F4F6'}
                      />
                    </View>

                    <TouchableOpacity
                      onPress={() => {
                        setDeviceSelectorType('video');
                        setShowDeviceSelector(true);
                      }}
                      className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800"
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="text-placeholder dark:text-papaya">
                          {t("call.deviceSettings.changeCamera") || "Change Camera"}
                        </Text>
                        <FeIcon 
                          name="chevron-right" 
                          size={20} 
                          color={isDarkColorScheme ? '#94a3b8' : '#64748b'} 
                        />
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Call Quality Info */}
                <View className="mb-4 p-4 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <View className="flex-row items-center mb-2">
                    <FeIcon name="info" size={16} color="#3B82F6" />
                    <Text className="text-sm font-medium ml-2 text-blue-800 dark:text-blue-200">
                      {t("call.deviceSettings.callQualityTips") || "Call Quality Tips"}
                    </Text>
                  </View>
                  <Text className="text-xs text-blue-700 dark:text-blue-300">
                    • {t("call.deviceSettings.tip1") || "Use a good quality microphone for better audio"}{'\n'}
                    • {t("call.deviceSettings.tip2") || "Ensure good lighting for video calls"}{'\n'}
                    • {t("call.deviceSettings.tip3") || "Close unnecessary applications for better performance"}
                  </Text>
                </View>
              </View>
            </ScrollView>
          </View>
      </Modal>

      {/* Device Selector Modal */}
      <DeviceSelector
        isVisible={showDeviceSelector}
        onClose={() => {
          setShowDeviceSelector(false);
          setDeviceSelectorType(null);
        }}
        onDeviceSelected={handleDeviceSelected}
        isVideoCall={isVideoCall}
      />
    </>
  );
};

export default DeviceSettings;
