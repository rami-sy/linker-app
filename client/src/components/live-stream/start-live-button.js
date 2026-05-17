import React, { useState } from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator } from 'react-native';
import { useContext } from 'react';
import { MediasoupContext } from '../../contexts/mediasoup.context';
import logger from '../../../utils/logger';
import FeIcon from 'react-native-vector-icons/Feather';
import { useColorScheme } from '../../../lib/useColorScheme';

export const StartLiveButton = ({ roomId, onStart, onError }) => {
  const { startLiveStream } = useContext(MediasoupContext);
  const { isDarkColorScheme } = useColorScheme();
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    try {
      setLoading(true);
      await startLiveStream({
        roomId,
        settings: {
          allowAnonymousViewers: true, // السماح لأي مستخدم مصادق عليه بالمشاهدة
          maxViewers: 1000,
          allowViewersToSpeak: false,
        }
      });
      onStart?.();
    } catch (error) {
      logger.error('Error starting live stream:', error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleStart}
      disabled={loading}
      className={`px-6 py-3 rounded-full flex-row items-center justify-center bg-red-500 dark:bg-red-600 ${loading ? 'opacity-50' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color="white" size="small" />
      ) : (
        <>
          <FeIcon name="radio" size={18} color="white" style={{ marginRight: 8 }} />
          <Text className="text-white font-bold text-base">Go Live</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

