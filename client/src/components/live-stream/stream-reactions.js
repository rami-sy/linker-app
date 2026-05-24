import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { useContext } from 'react';
import { SocketContext } from '../../contexts/socket.context';
import FeIcon from '@expo/vector-icons/Feather';
import logger from '../../utils/logger';
import { useColorScheme } from '../../../lib/useColorScheme';

const REACTIONS = [
  { name: 'like', emoji: '👍', color: '#3b82f6' },
  { name: 'love', emoji: '❤️', color: '#ef4444' },
  { name: 'laugh', emoji: '😂', color: '#f59e0b' },
  { name: 'wow', emoji: '😮', color: '#8b5cf6' },
  { name: 'sad', emoji: '😢', color: '#6366f1' },
  { name: 'angry', emoji: '😠', color: '#dc2626' },
  { name: 'fire', emoji: '🔥', color: '#f97316' },
  { name: 'clap', emoji: '👏', color: '#10b981' },
];

export const StreamReactions = ({ streamId }) => {
  const { socket } = useContext(SocketContext);
  const { isDarkColorScheme } = useColorScheme();
  const { user: currentUser } = useSelector((state) => state.users);
  const [reactions, setReactions] = useState({});
  const [showPicker, setShowPicker] = useState(false);
  const [recentReactions, setRecentReactions] = useState([]);
  const [reactionCounts, setReactionCounts] = useState({});

  useEffect(() => {
    if (!socket || !streamId) return;

    const handleStreamReaction = ({ streamId: receivedStreamId, reaction }) => {
      if (receivedStreamId === streamId) {
        // Add to recent reactions for animation
        setRecentReactions(prev => [...prev, reaction].slice(-10));
        
        // Update reaction counts
        setReactions(prev => ({
          ...prev,
          [reaction.reaction]: (prev[reaction.reaction] || 0) + 1,
        }));
        
        // ✅ Enhanced: Update detailed counts
        setReactionCounts(prev => ({
          ...prev,
          [reaction.reaction]: (prev[reaction.reaction] || 0) + 1,
        }));
      }
    };

    socket.on('streamReaction', handleStreamReaction);

    return () => {
      socket.off('streamReaction', handleStreamReaction);
    };
  }, [socket, streamId]);

  const handleReaction = async (reactionName) => {
    try {
      socket.emit('sendStreamReaction', {
        streamId,
        reaction: reactionName,
      }, (response) => {
        if (!response.success) {
          logger.error('Error sending reaction:', response.error);
        }
      });
      setShowPicker(false);
    } catch (error) {
      logger.error('Error sending reaction:', error);
    }
  };

  return (
    <View className="relative">
      {/* Reaction Button */}
      <TouchableOpacity
        onPress={() => setShowPicker(!showPicker)}
        className="px-4 py-2 rounded-full flex-row items-center bg-gray-100 dark:bg-slate-800"
      >
        <FeIcon 
          name="smile" 
          size={20} 
          color={isDarkColorScheme ? '#cbd5e1' : '#475569'} 
        />
        <Text className="ml-2 text-sm font-semibold text-gray-700 dark:text-slate-300">
          React
        </Text>
      </TouchableOpacity>

      {/* Reaction Picker */}
      {showPicker && (
        <View className="absolute bottom-full mb-2 left-0 right-0 flex-row items-center justify-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 }}>
          {REACTIONS.map((reaction) => (
            <TouchableOpacity
              key={reaction.name}
              onPress={() => handleReaction(reaction.name)}
              className="p-2"
            >
              <Text style={{ fontSize: 28 }}>{reaction.emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Recent Reactions Animation */}
      {recentReactions.length > 0 && (
        <View className="absolute -top-10 left-0 right-0 items-center">
          {recentReactions.slice(-3).map((reaction, index) => {
            const reactionEmoji = REACTIONS.find(r => r.name === reaction.reaction)?.emoji || '👍';
            return (
              <Animated.View
                key={`${reaction.userId}-${reaction.timestamp}-${index}`}
                className="absolute"
                style={{
                  transform: [
                    { translateY: new Animated.Value(0) },
                    { scale: new Animated.Value(1) },
                  ],
                  opacity: new Animated.Value(1),
                }}
              >
                <Text style={{ fontSize: 32 }}>{reactionEmoji}</Text>
              </Animated.View>
            );
          })}
        </View>
      )}
    </View>
  );
};

