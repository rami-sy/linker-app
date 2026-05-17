import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useContext } from 'react';
import { MediasoupContext } from '../../contexts/mediasoup.context';
import logger from '../../../utils/logger';
import { useColorScheme } from '../../../lib/useColorScheme';

export const LiveStreamViewer = ({ streamId, userId, userData }) => {
  const { joinAsViewer, remoteStreams } = useContext(MediasoupContext);
  const { isDarkColorScheme } = useColorScheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const joinStream = async () => {
      try {
        setLoading(true);
        setError(null);
        await joinAsViewer({
          roomId: streamId,
          userId,
          userData,
        });
        setLoading(false);
      } catch (err) {
        logger.error('Error joining stream:', err);
        setError(err.message || 'Failed to join stream');
        setLoading(false);
      }
    };

    if (streamId && userId) {
      joinStream();
    }

    // Cleanup on unmount
    return () => {
      // يمكن إضافة cleanup logic هنا إذا لزم الأمر
    };
  }, [streamId, userId, userData, joinAsViewer]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-[#12141b]">
        <ActivityIndicator size="large" color={isDarkColorScheme ? '#3b82f6' : '#2563eb'} />
        <Text className="mt-4 text-base text-slate-700 dark:text-slate-300">
          Joining stream...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-[#12141b]">
        <Text className="text-lg font-semibold text-red-600 dark:text-red-400">
          Error
        </Text>
        <Text className="mt-2 text-base text-center px-4 text-slate-600 dark:text-slate-400">
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      {/* Video streams will be rendered here */}
      {Object.keys(remoteStreams).length === 0 ? (
        <View className="flex-1 items-center justify-center bg-white dark:bg-[#12141b]">
          <Text className="text-base text-slate-600 dark:text-slate-400">
            Waiting for stream...
          </Text>
        </View>
      ) : (
        Object.entries(remoteStreams).map(([peerId, stream], index) => (
          <View key={peerId || index} className="w-full h-full">
            {/* Render video stream */}
            {/* Note: Actual video rendering should be handled by mediasoup-call component */}
          </View>
        ))
      )}
    </View>
  );
};

