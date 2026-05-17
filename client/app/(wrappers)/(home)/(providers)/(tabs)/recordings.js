/**
 * Recordings Screen
 * صفحة عرض جميع التسجيلات المحفوظة
 */

import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Linking,
  Image,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { MediasoupContext } from '../../../../../src/contexts/mediasoup.context';
import Layout from '../../../../../src/components/layout';
import FeIcon from 'react-native-vector-icons/Feather';
import moment from 'moment';
import UserImage from '../../../../../src/components/user-image';
import UserName from '../../../../../src/components/user-name';
import getFullName from '../../../../../src/utils/getFullName';
import { addAlert } from '../../../../../src/redux/alertSlice';
import logger from '../../../../../src/utils/logger';
import Constants from 'expo-constants';
import { downloadRecording, formatFileSize, formatDuration as formatDurationUtil } from '../../../../../src/utils/downloadRecording';
import { Image as RNImage } from 'react-native';
import { useColorScheme } from '~/lib/useColorScheme';

const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;

export default function RecordingsScreen() {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  const { user: currentUser } = useSelector((state) => state.users);
  const dispatch = useDispatch();
  const { getUserRecordings } = useContext(MediasoupContext);

  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [type, setType] = useState('all'); // 'all', 'call', 'stream'
  const [error, setError] = useState(null);

  const loadRecordings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getUserRecordings({ type, limit: 50, offset: 0 });
      
      const allRecordings = [
        ...(result.callRecordings || []).map(r => ({ ...r, recordingType: 'call' })),
        ...(result.streamRecordings || []).map(r => ({ ...r, recordingType: 'stream' })),
      ].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

      setRecordings(allRecordings);
    } catch (err) {
      logger.error('Error loading recordings:', err);
      setError(err.message || 'Failed to load recordings');
      dispatch(addAlert({
        type: 'error',
        message: err.message || 'Failed to load recordings',
      }));
    } finally {
      setLoading(false);
    }
  }, [getUserRecordings, type, dispatch]);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRecordings();
    setRefreshing(false);
  };

  const formatDuration = (seconds) => {
    return formatDurationUtil(seconds);
  };

  const handleRecordingPress = async (recording) => {
    if (recording.fileUrl && recording.status === 'completed') {
      // تحميل الملف على الجهاز
      try {
        const { downloadRecording } = require('../../../src/utils/downloadRecording');
        const fileName = `recording_${recording._id}.${recording.format || 'mp4'}`;
        await downloadRecording(recording.fileUrl, fileName);
        
        dispatch(addAlert({
          type: 'success',
          message: Platform.OS === 'web' 
            ? 'Recording download started' 
            : 'Recording saved to gallery',
        }));
      } catch (error) {
        logger.error('Error downloading recording:', error);
        dispatch(addAlert({
          type: 'error',
          message: error.message || 'Failed to download recording',
        }));
      }
    } else if (recording.status === 'processing') {
      dispatch(addAlert({
        type: 'info',
        message: t('call.recording.processing'),
      }));
    } else if (recording.status === 'failed') {
      dispatch(addAlert({
        type: 'error',
        message: t('call.recording.failed'),
      }));
    }
  };

  const renderRecordingItem = ({ item: recording }) => {
    const displayUser = recording.recordingType === 'call' 
      ? recording.caller 
      : recording.broadcaster;
    
    const room = recording.room;
    const isGroup = room?.isGroup;
    const isVideoCall = recording.isVideoCall || recording.recordingType === 'stream';
    const hasThumbnail = recording.thumbnailUrl || (isVideoCall && recording.fileUrl && recording.status === 'completed');

    return (
      <TouchableOpacity
        onPress={() => handleRecordingPress(recording)}
        className={`w-full rounded-2xl mb-2 overflow-hidden ${isDarkColorScheme ? 'bg-sec' : 'bg-[#f6f8f9]'}`}
        activeOpacity={0.7}
      >
        {/* Video Thumbnail or Avatar */}
        <View className="relative">
          {hasThumbnail && recording.status === 'completed' ? (
            <View className="w-full h-48 bg-black relative">
              {recording.thumbnailUrl ? (
                <Image
                  source={{ uri: recording.thumbnailUrl }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              ) : isVideoCall && recording.fileUrl && Platform.OS === 'web' ? (
                // Video thumbnail for web - use video element
                <video
                  src={recording.fileUrl}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  style={{ pointerEvents: 'none' }}
                  onLoadedMetadata={(e) => {
                    // Seek to 1 second to show a frame
                    const video = e.target;
                    if (video.readyState >= 2) {
                      video.currentTime = Math.min(1, video.duration / 4);
                    }
                  }}
                />
              ) : null}
              
              {/* Play Icon Overlay */}
              <View className="absolute inset-0 items-center justify-center bg-black/30">
                <View className="bg-white/20 rounded-full p-3">
                  <FeIcon name="play" size={32} color="#fff" />
                </View>
              </View>
              
              {/* Duration Badge */}
              {recording.duration > 0 && (
                <View className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded">
                  <Text className="text-white text-xs font-semibold">
                    {formatDuration(recording.duration)}
                  </Text>
                </View>
              )}
              
              {/* Video Call Icon */}
              {isVideoCall && (
                <View className="absolute top-2 right-2 bg-blue-500/90 px-2 py-1 rounded flex-row items-center gap-x-1">
                  <FeIcon name="video" size={12} color="#fff" />
                </View>
              )}
            </View>
          ) : (
            <View className="w-full h-32 bg-slate-800 items-center justify-center relative">
              {isGroup ? (
                <FeIcon name="users" size={48} color="#94a3b8" />
              ) : (
                <UserImage
                  user={displayUser}
                  size="h-20 w-20"
                  border="border-0"
                  rounded="rounded-full"
                  showStatus={false}
                />
              )}
              {isVideoCall && (
                <View className="absolute bottom-2 right-2 bg-blue-500/90 px-2 py-1 rounded flex-row items-center gap-x-1">
                  <FeIcon name="video" size={12} color="#fff" />
                </View>
              )}
            </View>
          )}
          
          {/* Status Badge */}
          <View className="absolute top-2 left-2">
            {recording.status === 'completed' && recording.fileUrl ? (
              <View className="bg-green-500/90 px-2 py-1 rounded flex-row items-center gap-x-1">
                <FeIcon name="check-circle" size={12} color="#fff" />
                <Text className="text-white text-xs font-semibold">
                  {t('call.recording.ready')}
                </Text>
              </View>
            ) : recording.status === 'processing' ? (
              <View className="bg-blue-500/90 px-2 py-1 rounded flex-row items-center gap-x-1">
                <ActivityIndicator size="small" color="#fff" />
                <Text className="text-white text-xs font-semibold">
                  {t('call.recording.processing')}
                </Text>
              </View>
            ) : recording.status === 'failed' ? (
              <View className="bg-red-500/90 px-2 py-1 rounded flex-row items-center gap-x-1">
                <FeIcon name="x-circle" size={12} color="#fff" />
                <Text className="text-white text-xs font-semibold">
                  {t('call.recording.failed')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Content */}
        <View className="p-4">
          <View className="flex-row items-start justify-between mb-2">
            <View className="flex-1 flex-row items-center gap-x-2">
              {!hasThumbnail && (
                <View className="mr-2">
                  {isGroup ? (
                    <View className="h-10 w-10 rounded-full bg-slate-500 items-center justify-center">
                      <FeIcon name="users" size={20} color="#fff" />
                    </View>
                  ) : (
                    <UserImage
                      user={displayUser}
                      size="h-10 w-10"
                      border="border-0"
                      rounded="rounded-full"
                      showStatus={false}
                    />
                  )}
                </View>
              )}
              
              <View className="flex-1">
                {isGroup ? (
                  <Text
                    className={`text-base font-semibold ${isDarkColorScheme ? 'text-papaya' : 'text-placeholder'}`}
                    numberOfLines={1}
                  >
                    {room?.name || 'Group Call'}
                  </Text>
                ) : (
                  <UserName
                    className={`text-base font-semibold ${isDarkColorScheme ? 'text-papaya' : 'text-placeholder'}`}
                    user={displayUser}
                    onlyFirst={true}
                  />
                )}
                
                <View className="flex-row items-center gap-x-2 mt-1">
                  <Text
                    className={`text-xs ${isDarkColorScheme ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    {moment(recording.startedAt).format('MMM DD, YYYY HH:mm')}
                  </Text>
                  {recording.duration > 0 && !hasThumbnail && (
                    <>
                      <Text
                        className={`text-xs ${isDarkColorScheme ? 'text-slate-500' : 'text-slate-400'}`}
                      >
                        •
                      </Text>
                      <Text
                        className={`text-xs ${isDarkColorScheme ? 'text-slate-400' : 'text-slate-500'}`}
                      >
                        {formatDuration(recording.duration)}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </View>
          </View>

          {/* Type Badge and Download Button */}
          <View className="flex-row items-center justify-between mt-2">
            <View className="flex-row items-center gap-x-2">
              <View
                className={`px-2 py-1 rounded ${
                  recording.recordingType === 'call'
                    ? 'bg-blue-500/20'
                    : 'bg-purple-500/20'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    recording.recordingType === 'call'
                      ? 'text-blue-500'
                      : 'text-purple-500'
                  }`}
                >
                  {recording.recordingType === 'call' 
                    ? (recording.isVideoCall ? 'Video Call' : 'Audio Call')
                    : 'Live Stream'}
                </Text>
              </View>
              
              {recording.fileSize && recording.status === 'completed' && (
                <Text
                  className={`text-xs ${isDarkColorScheme ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  {formatFileSize(recording.fileSize)}
                </Text>
              )}
            </View>
            
            {/* Download Button */}
            {recording.status === 'completed' && recording.fileUrl && (
              <TouchableOpacity
                onPress={(e) => {
                  if (e && typeof e.stopPropagation === "function") {
                    e.stopPropagation();
                  }
                  handleRecordingPress(recording);
                }}
                className={`flex-row items-center gap-x-1 px-3 py-1.5 rounded-lg ${isDarkColorScheme ? 'bg-green-600/20' : 'bg-green-100'}`}
                activeOpacity={0.7}
              >
                <FeIcon name="download" size={16} color="#10b981" />
                <Text
                  className={`text-xs font-semibold ${isDarkColorScheme ? 'text-green-400' : 'text-green-600'}`}
                >
                  {Platform.OS === 'web' ? 'Download' : 'Save'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && recordings.length === 0) {
    return (
      <Layout
        className={`flex-1 w-full md:w-1/2 lg:w-1/2 ${isDarkColorScheme ? "bg-[#12141b]" : "bg-[#dee4e6]"}`}
      >
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={isDarkColorScheme ? '#3b82f6' : '#2563eb'} />
          <Text
            className={`mt-4 text-base ${isDarkColorScheme ? 'text-slate-400' : 'text-slate-600'}`}
          >
            {t('call.recording.loading')}
          </Text>
        </View>
      </Layout>
    );
  }

  return (
    <Layout
      className={`flex-1 w-full md:w-1/2 lg:w-1/2 ${isDarkColorScheme ? "bg-[#12141b]" : "bg-[#dee4e6]"}`}
      navBar={
        <View className="flex-row items-center justify-between w-full px-4">
          <View className="flex-1">
            <Text
              className={`text-xl font-bold ${isDarkColorScheme ? 'text-papaya' : 'text-placeholder'}`}
            >
              {t('call.recording.title') || 'Recordings'}
            </Text>
            <Text
              className={`text-xs mt-0.5 ${isDarkColorScheme ? 'text-slate-400' : 'text-slate-600'}`}
            >
              {recordings.length} {recordings.length === 1 ? 'recording' : 'recordings'}
            </Text>
          </View>
          
          {/* Type Filter */}
          <View className="flex-row gap-x-2">
            <TouchableOpacity
              onPress={() => setType('all')}
              className={`px-3 py-1.5 rounded-lg ${
                type === 'all'
                  ? isDarkColorScheme ? 'bg-blue-600' : 'bg-blue-500'
                  : isDarkColorScheme ? 'bg-slate-800' : 'bg-slate-200'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  type === 'all' ? 'text-white' : isDarkColorScheme ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                {t('call.recording.all') || 'All'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setType('call')}
              className={`px-3 py-1.5 rounded-lg ${
                type === 'call'
                  ? isDarkColorScheme ? 'bg-blue-600' : 'bg-blue-500'
                  : isDarkColorScheme ? 'bg-slate-800' : 'bg-slate-200'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  type === 'call' ? 'text-white' : isDarkColorScheme ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                {t('call.recording.calls') || 'Calls'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setType('stream')}
              className={`px-3 py-1.5 rounded-lg ${
                type === 'stream'
                  ? isDarkColorScheme ? 'bg-blue-600' : 'bg-blue-500'
                  : isDarkColorScheme ? 'bg-slate-800' : 'bg-slate-200'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  type === 'stream' ? 'text-white' : isDarkColorScheme ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                {t('call.recording.streams') || 'Streams'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      }
    >
      {/* Recordings List */}
      <FlatList
        data={recordings}
        keyExtractor={(item) => item._id?.toString() || Math.random().toString()}
        renderItem={renderRecordingItem}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={isDarkColorScheme ? '#3b82f6' : '#2563eb'}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20 px-4">
            <FeIcon
              name="mic-off"
              size={64}
              color={isDarkColorScheme ? '#475569' : '#94a3b8'}
            />
            <Text
              className={`text-lg font-semibold mt-4 ${isDarkColorScheme ? 'text-slate-300' : 'text-slate-700'}`}
            >
              {t('call.recording.noRecordings') || 'No recordings'}
            </Text>
            <Text
              className={`text-base text-center mt-2 ${isDarkColorScheme ? 'text-slate-400' : 'text-slate-600'}`}
            >
              {t('call.recording.noRecordingsDescription') || 'Your call recordings will appear here'}
            </Text>
          </View>
        }
      />
    </Layout>
  );
}
