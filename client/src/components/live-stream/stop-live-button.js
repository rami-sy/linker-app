import React, { useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { useContext } from 'react';
import { MediasoupContext } from '../../contexts/mediasoup.context';
import logger from '../../../utils/logger';
import FeIcon from '@expo/vector-icons/Feather';
import { useColorScheme } from '../../../lib/useColorScheme';

export const StopLiveButton = ({ roomId, onStop, onError }) => {
  const { stopLiveStream } = useContext(MediasoupContext);
  const { isDarkColorScheme } = useColorScheme();
  const [loading, setLoading] = useState(false);

  const handleStop = async () => {
    try {
      setLoading(true);
      await stopLiveStream({ roomId });
      onStop?.();
    } catch (error) {
      logger.error('Error stopping live stream:', error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleStop}
      disabled={loading}
      className={`px-6 py-3 rounded-full flex-row items-center justify-center bg-gray-300 dark:bg-gray-700 ${loading ? 'opacity-50' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color={isDarkColorScheme ? 'white' : 'black'} size="small" />
      ) : (
        <>
          <FeIcon 
            name="square" 
            size={18} 
            color={isDarkColorScheme ? 'white' : 'black'} 
            style={{ marginRight: 8 }} 
          />
          <Text className="font-bold text-base text-black dark:text-white">
            End Stream
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

