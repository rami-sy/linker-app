import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { useSelector } from 'react-redux';
import { useContext } from 'react';
import { SocketContext } from '../../contexts/socket.context';
import FeIcon from 'react-native-vector-icons/Feather';
import UserImage from '../user-image';
import moment from 'moment';
import logger from '../../utils/logger';
import { useColorScheme } from '../../../lib/useColorScheme';

export const StreamComments = ({ streamId, isVisible = true }) => {
  const { socket } = useContext(SocketContext);
  const { isDarkColorScheme } = useColorScheme();
  const { user: currentUser } = useSelector((state) => state.users);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    if (!socket || !streamId) return;

    const handleStreamComment = ({ streamId: receivedStreamId, comment }) => {
      if (receivedStreamId === streamId) {
        setComments(prev => [...prev, comment]);
        // Auto-scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    };

    socket.on('streamComment', handleStreamComment);

    return () => {
      socket.off('streamComment', handleStreamComment);
    };
  }, [socket, streamId]);

  const handleSendComment = async () => {
    if (!commentText.trim() || sending) return;

    try {
      setSending(true);
      const commentToSend = commentText.trim();
      setCommentText(''); // Clear input immediately for better UX
      
      socket.emit('sendStreamComment', {
        streamId,
        comment: commentToSend,
      }, (response) => {
        if (!response.success) {
          logger.error('Error sending comment:', response.error);
          // Restore comment text if failed
          setCommentText(commentToSend);
        }
        setSending(false);
      });
    } catch (error) {
      logger.error('Error sending comment:', error);
      setSending(false);
    }
  };

  if (!isVisible) return null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View className="flex-1 bg-white dark:bg-slate-900">
        {/* Comments Header */}
        <View className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <Text className="text-lg font-semibold text-black dark:text-white">
            Comments ({comments.length})
          </Text>
        </View>

        {/* Comments List */}
        <FlatList
          ref={flatListRef}
          data={comments}
          keyExtractor={(item, index) => `${item.userId}-${item.timestamp}-${index}`}
          renderItem={({ item }) => (
            <View className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
              <View className="flex-row items-start">
                <UserImage
                  user={item}
                  size="h-8 w-8"
                  border="border-0"
                  showStatus={false}
                />
                <View className="ml-3 flex-1">
                  <View className="flex-row items-center mb-1">
                    <Text className="font-semibold text-sm text-black dark:text-white">
                      {item.userName || 'Unknown'}
                    </Text>
                    <Text className="text-xs ml-2 text-gray-500 dark:text-slate-400">
                      {moment(item.timestamp).fromNow()}
                    </Text>
                  </View>
                  <Text className="text-sm text-gray-700 dark:text-slate-300">
                    {item.comment}
                  </Text>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <FeIcon 
                name="message-circle" 
                size={48} 
                color={isDarkColorScheme ? '#475569' : '#94a3b8'} 
              />
              <Text className="text-base mt-4 text-gray-600 dark:text-slate-400">
                No comments yet. Be the first to comment!
              </Text>
            </View>
          }
          contentContainerStyle={{ flexGrow: 1 }}
        />

        {/* Comment Input */}
        <View className="px-4 py-3 border-t bg-white border-gray-200 dark:bg-slate-900 dark:border-slate-700">
          <View className="flex-row items-center">
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Add a comment..."
              placeholderTextColor={isDarkColorScheme ? '#64748b' : '#9ca3af'}
              className={`flex-1 px-4 py-2 rounded-full bg-gray-100 text-black dark:bg-slate-800 dark:text-white`}
              maxLength={500}
              multiline={false}
              onSubmitEditing={handleSendComment}
              // ✅ Enhanced: Better keyboard handling
              returnKeyType="send"
              blurOnSubmit={true}
            />
            <TouchableOpacity
              onPress={handleSendComment}
              disabled={!commentText.trim() || sending}
              className={`ml-2 p-2 rounded-full ${
                commentText.trim() && !sending
                  ? 'bg-blue-500 dark:bg-blue-600'
                  : 'bg-gray-300 dark:bg-slate-700'
              }`}
            >
              <FeIcon 
                name="send" 
                size={20} 
                color={commentText.trim() && !sending ? 'white' : (isDarkColorScheme ? '#64748b' : '#9ca3af')} 
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

