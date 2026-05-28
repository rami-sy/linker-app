import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Platform, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSelector, useDispatch } from 'react-redux';
import logger from '../../../../../src/utils/logger';
import FeIcon from 'react-native-vector-icons/Feather';
import UserImage from '../../../../../src/components/user-image';
import moment from 'moment';
import ContextMenu from '../../../../../src/components/context-menu';
import { addAlert } from '../../../../../src/redux/alertSlice';
import { updateRoom } from '../../../../../src/redux/chatSlice';
import * as Haptics from 'expo-haptics';
import Popup from '../../../../../src/components/popup';
import { MediasoupContext } from '../../../../../src/contexts/mediasoup.context';
import { SocketContext } from '../../../../../src/contexts/socket.context';
import { useColorScheme } from '~/lib/useColorScheme';
import { useTranslation } from 'react-i18next';
import { subscribeLiveStreamEvents } from '../../../../../src/utils/liveStreamSocketEvents';

export default function LiveStreamsScreen() {
  const { t } = useTranslation();
  const { getLiveStreams, stopLiveStream } = useContext(MediasoupContext);
  const { socket } = useContext(SocketContext);
  const dispatch = useDispatch();
  const { isDarkColorScheme } = useColorScheme();
  const router = useRouter();
  const { user: currentUser } = useSelector((state) => state.users);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [stoppingStreamId, setStoppingStreamId] = useState(null);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [streamToStop, setStreamToStop] = useState(null);
  
  // ✅ Filtering & Sorting States
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('viewers'); // 'viewers', 'date', 'name'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'
  const [showSortMenu, setShowSortMenu] = useState(false);

  const loadStreams = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const liveStreams = await getLiveStreams({ limit: 20, offset: 0 });
      setStreams(liveStreams || []);
    } catch (err) {
      logger.error('Error loading live streams:', err);
      setError(err.message || 'Failed to load live streams');
    } finally {
      setLoading(false);
    }
  }, [getLiveStreams]);

  useEffect(() => {
    loadStreams();
  }, [loadStreams]);

  // ✅ Real-time updates: Listen for stream started/ended events
  useEffect(() => {
    if (!socket) return;

    const handleStreamStarted = async ({ roomId, settings }) => {
      logger.streamEvent('Live stream started event received', { roomId });
      // إعادة تحميل القائمة عند بدء ستريم جديد
      await loadStreams();
    };

    const handleStreamEnded = async ({ roomId, callId }) => {
      logger.streamEvent('Live stream ended event received', { roomId, callId });
      // إزالة الستريم من القائمة عند انتهائه
      setStreams(prev => prev.filter(stream => stream._id !== callId && stream.room?._id !== roomId));
      // إعادة تحميل القائمة للتأكد
      await loadStreams();
    };

    return subscribeLiveStreamEvents(socket, {
      onStarted: handleStreamStarted,
      onEnded: handleStreamEnded,
    });
  }, [socket, loadStreams]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStreams();
    setRefreshing(false);
  };

  const handleStreamPress = (stream) => {
    router.push({
      pathname: '/live-stream-viewer',
      params: { streamId: stream._id },
    });
  };

  const isBroadcaster = (stream) => {
    if (!stream || !currentUser?._id) return false;
    
    // التحقق من broadcasters array
    if (stream.broadcasters && Array.isArray(stream.broadcasters)) {
      return stream.broadcasters.some(
        broadcaster => 
          (broadcaster._id?.toString() === currentUser._id.toString()) ||
          (broadcaster.toString() === currentUser._id.toString())
      );
    }
    
    // التحقق من user field كـ fallback
    if (stream.user) {
      return stream.user._id?.toString() === currentUser._id.toString() ||
             stream.user.toString() === currentUser._id.toString();
    }
    
    return false;
  };

  const handleStopStream = (stream) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setStreamToStop(stream);
    setShowStopConfirm(true);
  };

  const handleConfirmStop = async () => {
    if (!streamToStop) return;
    setShowStopConfirm(false);
    await executeStopStream(streamToStop);
    setStreamToStop(null);
  };

  const handleCancelStop = () => {
    setShowStopConfirm(false);
    setStreamToStop(null);
  };

  const executeStopStream = async (stream) => {
    try {
      logger.callEvent('Attempting to stop stream', { streamId: stream._id, roomId: stream._id });
      setStoppingStreamId(stream._id);
      
      const updatedRoom = await stopLiveStream({ roomId: stream._id });
      logger.callEvent('stopLiveStream returned', { updatedRoom, streamId: stream._id });
      
      // تحديث الـ room في Redux store
      if (updatedRoom) {
        const roomUpdate = {
          _id: updatedRoom._id || stream._id,
          ...updatedRoom,
          isLiveStream: updatedRoom.isLiveStream !== undefined ? updatedRoom.isLiveStream : false,
          liveStreamSettings: updatedRoom.liveStreamSettings || {
            ...stream.liveStreamSettings,
            isLive: false,
            endedAt: new Date(),
          },
          broadcasters: updatedRoom.broadcasters || stream.broadcasters || [],
          members: updatedRoom.members || stream.members || [],
        };
        dispatch(updateRoom(roomUpdate));
        logger.callEvent('Room updated in Redux after stopping stream', { roomId: stream._id });
      }
      
      // إزالة الستريم من القائمة
      setStreams(prev => {
        const filtered = prev.filter(s => s._id !== stream._id);
        logger.callEvent('Streams list updated', { before: prev.length, after: filtered.length, removedId: stream._id });
        return filtered;
      });
      
      dispatch(addAlert({
        type: 'success',
        message: 'Live stream stopped successfully',
      }));
      
      logger.callEvent('Stream stopped from list', { streamId: stream._id });
    } catch (error) {
      logger.error('Error stopping stream:', error);
      console.error('Full error object:', error);
      dispatch(addAlert({
        type: 'error',
        message: error.message || 'Failed to stop stream',
      }));
    } finally {
      setStoppingStreamId(null);
    }
  };

  const formatDuration = (startedAt) => {
    if (!startedAt) return '';
    const duration = moment.duration(moment().diff(moment(startedAt)));
    const hours = Math.floor(duration.asHours());
    const minutes = duration.minutes();
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  /**
   * ✅ Filtered & Sorted Streams
   */
  const filteredAndSortedStreams = useMemo(() => {
    let filtered = [...streams];

    // ✅ Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(stream => {
        const broadcaster = stream.broadcasters?.[0] || stream.user;
        const name = stream.name || '';
        const userName = broadcaster?.userName || broadcaster?.firstName || broadcaster?.lastName || '';
        
        return (
          name.toLowerCase().includes(query) ||
          userName.toLowerCase().includes(query) ||
          (broadcaster?.firstName && broadcaster.firstName.toLowerCase().includes(query)) ||
          (broadcaster?.lastName && broadcaster.lastName.toLowerCase().includes(query))
        );
      });
    }

    // ✅ Sort streams
    filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'viewers':
          aValue = a.liveStreamSettings?.viewersCount || 0;
          bValue = b.liveStreamSettings?.viewersCount || 0;
          break;
        case 'date':
          aValue = new Date(a.liveStreamSettings?.startedAt || 0).getTime();
          bValue = new Date(b.liveStreamSettings?.startedAt || 0).getTime();
          break;
        case 'name':
          const aBroadcaster = a.broadcasters?.[0] || a.user;
          const bBroadcaster = b.broadcasters?.[0] || b.user;
          aValue = (aBroadcaster?.userName || aBroadcaster?.firstName || '').toLowerCase();
          bValue = (bBroadcaster?.userName || bBroadcaster?.firstName || '').toLowerCase();
          break;
        default:
          return 0;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

    return filtered;
  }, [streams, searchQuery, sortBy, sortOrder]);

  const renderStreamItem = ({ item }) => {
    const broadcaster = item.broadcasters?.[0] || item.user;
    const viewersCount = item.liveStreamSettings?.viewersCount || 0;
    const startedAt = item.liveStreamSettings?.startedAt;
    const duration = formatDuration(startedAt);
    const isOwner = isBroadcaster(item);
    const isStopping = stoppingStreamId === item._id;

    return (
      <TouchableOpacity
        onPress={() => handleStreamPress(item)}
        activeOpacity={0.7}
        className={`mx-2 my-1.5 p-3 rounded-xl ${isDarkColorScheme ? 'bg-sec' : 'bg-gray-100'}`}
      >
        <View className="flex-row items-center">
          {/* Broadcaster Avatar */}
          <View className="relative">
            <UserImage
              onPress={null}
              showStatus={false}
              border="border-0"
              size="h-16 w-16"
              user={broadcaster}
            />
            {/* Live Indicator */}
            <View className="absolute -top-1 -right-1 bg-red-500 rounded-full px-2 py-0.5 flex-row items-center">
              <View className="w-2 h-2 bg-white rounded-full mr-1" />
              <Text className="text-white text-xs font-bold">{t('liveStreams.liveBadge')}</Text>
            </View>
          </View>

          {/* Stream Info */}
          <View className="ml-4 flex-1">
            <View className="flex-row items-center">
              <Text className={`font-bold text-lg ${isDarkColorScheme ? 'text-white' : 'text-black'}`} numberOfLines={1}>
                {broadcaster?.userName || broadcaster?.firstName || t('liveStreams.unknownUser')}
              </Text>
              {isOwner && (
                <View className={`ml-2 px-2 py-0.5 rounded-full ${isDarkColorScheme ? 'bg-blue-900' : 'bg-blue-100'}`}>
                  <Text className={`text-xs font-semibold ${isDarkColorScheme ? 'text-blue-300' : 'text-blue-700'}`}>
                    {t('liveStreams.you')}
                  </Text>
                </View>
              )}
            </View>
            <View className="flex-row items-center mt-1">
              <FeIcon 
                name="eye" 
                size={14} 
                color={isDarkColorScheme ? '#94a3b8' : '#64748b'} 
              />
              <Text className={`text-sm ml-1 ${isDarkColorScheme ? 'text-gray-400' : 'text-gray-600'}`}>
                {viewersCount} {viewersCount === 1 ? t('liveStreams.viewerOne') : t('liveStreams.viewerMany')}
              </Text>
              {duration && (
                <>
                  <Text className={`text-sm mx-2 ${isDarkColorScheme ? 'text-gray-500' : 'text-gray-400'}`}>
                    •
                  </Text>
                  <Text className={`text-sm ${isDarkColorScheme ? 'text-gray-400' : 'text-gray-600'}`}>
                    {duration}
                  </Text>
                </>
              )}
            </View>
            {item.name && (
              <Text className={`text-sm mt-1 ${isDarkColorScheme ? 'text-gray-400' : 'text-gray-600'}`} numberOfLines={1}>
                {item.name}
              </Text>
            )}
          </View>

          {/* Actions */}
          <View className="flex-row items-center gap-2">
            {isOwner && (
              <ContextMenu
                width={180}
                placement="left"
                px="px-0"
                itemClassName="rounded-xl"
                options={[
                  {
                    name: t('liveStreams.stopStream'),
                    onPress: () => {
                      logger.callEvent('Stop Stream option pressed', { streamId: item._id });
                      handleStopStream(item);
                    },
                    icon: <FeIcon name="square" size={16} color={isDarkColorScheme ? '#ef4444' : '#dc2626'} />,
                  },
                  {
                    name: t('liveStreams.viewStream'),
                    onPress: () => {
                      logger.callEvent('View Stream option pressed', { streamId: item._id });
                      handleStreamPress(item);
                    },
                    icon: <FeIcon name="eye" size={16} color={isDarkColorScheme ? '#94a3b8' : '#64748b'} />,
                  },
                ]}
              >
                <View 
                  className={`p-2 ${isStopping ? 'opacity-50' : ''}`}
                  onStartShouldSetResponder={() => true}
                  onTouchEnd={(e) => {
                    if (e && typeof e.stopPropagation === "function") {
                      e.stopPropagation();
                    }
                    if (Platform.OS !== 'web') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                >
                  {isStopping ? (
                    <ActivityIndicator size="small" color={isDarkColorScheme ? '#ef4444' : '#dc2626'} />
                  ) : (
                    <FeIcon 
                      name="more-vertical" 
                      size={20} 
                      color={isDarkColorScheme ? '#94a3b8' : '#64748b'} 
                    />
                  )}
                </View>
              </ContextMenu>
            )}
            {!isOwner && (
              <FeIcon 
                name="chevron-right" 
                size={20} 
                color={isDarkColorScheme ? '#64748b' : '#94a3b8'} 
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && streams.length === 0) {
    return (
      <View className={`flex-1 w-full linker-w items-center justify-center ${isDarkColorScheme ? 'bg-[#12141b]' : 'bg-white'}`}>
        <ActivityIndicator size="large" color={isDarkColorScheme ? '#3b82f6' : '#2563eb'} />
        <Text className={`mt-4 text-base ${isDarkColorScheme ? 'text-slate-400' : 'text-slate-600'}`}>
          {t('liveStreams.loading')}
        </Text>
      </View>
    );
  }

  if (error && streams.length === 0) {
    return (
      <View className={`flex-1 w-full linker-w items-center justify-center px-4 ${isDarkColorScheme ? 'bg-[#12141b]' : 'bg-white'}`}>
        <FeIcon 
          name="alert-circle" 
          size={48} 
          color={isDarkColorScheme ? '#ef4444' : '#dc2626'} 
        />
        <Text className={`mt-4 text-lg font-semibold text-center ${isDarkColorScheme ? 'text-red-400' : 'text-red-600'}`}>
          {t('liveStreams.errorTitle')}
        </Text>
        <Text className={`mt-2 text-base text-center ${isDarkColorScheme ? 'text-slate-400' : 'text-slate-600'}`}>
          {error}
        </Text>
        <TouchableOpacity
          onPress={loadStreams}
          className={`mt-6 px-6 py-3 rounded-full ${isDarkColorScheme ? 'bg-blue-600' : 'bg-blue-500'}`}
        >
          <Text className="text-white font-semibold">{t('liveStreams.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
    className={`flex-1 w-full linker-w ${isDarkColorScheme ? "bg-[#12141b]" : "bg-[#dee4e6]"}`}
  >
      {/* Header */}
      <View className={`px-4 py-2 border-b ${isDarkColorScheme ? 'border-slate-800' : 'border-gray-200'}`}>
        <Text className={`text-xl font-bold ${isDarkColorScheme ? 'text-white' : 'text-black'}`}>
          {t('liveStreams.title')}
        </Text>
        <Text className={`text-xs mt-0.5 ${isDarkColorScheme ? 'text-slate-400' : 'text-gray-600'}`}>
          {t('liveStreams.subtitle')}
        </Text>
      </View>

      {/* ✅ Search Bar */}
      <View className={`px-4 py-2 border-b flex-row items-center ${isDarkColorScheme ? 'border-slate-800' : 'border-gray-200'}`}>
        <View className="flex-1">
          <TextInput
            className={`w-full h-10 text-base px-3 rounded-lg ${isDarkColorScheme ? 'bg-slate-800 text-white' : 'bg-gray-100 text-black'}`}
            placeholder={t('liveStreams.searchPlaceholder')}
            placeholderTextColor={isDarkColorScheme ? '#94a3b8' : '#64748b'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        {searchQuery.trim() && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            className="ml-2 p-2"
          >
            <FeIcon 
              name="x" 
              size={20} 
              color={isDarkColorScheme ? '#94a3b8' : '#64748b'} 
            />
          </TouchableOpacity>
        )}
      </View>

      {/* ✅ Sort Controls */}
      <View className={`px-4 py-2 flex-row items-center justify-between border-b ${isDarkColorScheme ? 'border-slate-800' : 'border-gray-200'}`}>
        <Text className={`text-sm ${isDarkColorScheme ? 'text-slate-400' : 'text-gray-600'}`}>
          {filteredAndSortedStreams.length === 1
            ? t('liveStreams.streamCountOne', { count: filteredAndSortedStreams.length })
            : t('liveStreams.streamCountMany', { count: filteredAndSortedStreams.length })}
        </Text>
        <View className="flex-row items-center gap-x-2">
          <ContextMenu
            width={200}
            placement="bottom"
            px="px-0"
            itemClassName="rounded-xl"
            options={[
              {
                name: sortBy === 'viewers' && sortOrder === 'desc' ? '✓ Most Viewers' : 'Most Viewers',
                onPress: () => {
                  setSortBy('viewers');
                  setSortOrder('desc');
                  setShowSortMenu(false);
                },
                icon: <FeIcon name="eye" size={16} color={isDarkColorScheme ? '#94a3b8' : '#64748b'} />,
              },
              {
                name: sortBy === 'viewers' && sortOrder === 'asc' ? '✓ Least Viewers' : 'Least Viewers',
                onPress: () => {
                  setSortBy('viewers');
                  setSortOrder('asc');
                  setShowSortMenu(false);
                },
                icon: <FeIcon name="eye" size={16} color={isDarkColorScheme ? '#94a3b8' : '#64748b'} />,
              },
              {
                name: sortBy === 'date' && sortOrder === 'desc' ? '✓ Newest' : 'Newest',
                onPress: () => {
                  setSortBy('date');
                  setSortOrder('desc');
                  setShowSortMenu(false);
                },
                icon: <FeIcon name="clock" size={16} color={isDarkColorScheme ? '#94a3b8' : '#64748b'} />,
              },
              {
                name: sortBy === 'date' && sortOrder === 'asc' ? '✓ Oldest' : 'Oldest',
                onPress: () => {
                  setSortBy('date');
                  setSortOrder('asc');
                  setShowSortMenu(false);
                },
                icon: <FeIcon name="clock" size={16} color={isDarkColorScheme ? '#94a3b8' : '#64748b'} />,
              },
              {
                name: sortBy === 'name' && sortOrder === 'asc' ? '✓ Name (A-Z)' : 'Name (A-Z)',
                onPress: () => {
                  setSortBy('name');
                  setSortOrder('asc');
                  setShowSortMenu(false);
                },
                icon: <FeIcon name="type" size={16} color={isDarkColorScheme ? '#94a3b8' : '#64748b'} />,
              },
              {
                name: sortBy === 'name' && sortOrder === 'desc' ? '✓ Name (Z-A)' : 'Name (Z-A)',
                onPress: () => {
                  setSortBy('name');
                  setSortOrder('desc');
                  setShowSortMenu(false);
                },
                icon: <FeIcon name="type" size={16} color={isDarkColorScheme ? '#94a3b8' : '#64748b'} />,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => {
                setShowSortMenu(!showSortMenu);
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              }}
              className={`flex-row items-center gap-x-1.5 px-3 py-1.5 rounded-lg ${isDarkColorScheme ? 'bg-slate-800' : 'bg-gray-100'}`}
            >
              <FeIcon 
                name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'} 
                size={14} 
                color={isDarkColorScheme ? '#94a3b8' : '#64748b'} 
              />
              <Text className={`text-sm font-medium ${isDarkColorScheme ? 'text-slate-300' : 'text-gray-700'}`}>
                {sortBy === 'viewers'
                  ? t('liveStreams.sortViewers')
                  : sortBy === 'date'
                    ? t('liveStreams.sortDate')
                    : t('liveStreams.sortName')}
              </Text>
              <FeIcon 
                name="chevron-down" 
                size={14} 
                color={isDarkColorScheme ? '#94a3b8' : '#64748b'} 
              />
            </TouchableOpacity>
          </ContextMenu>
        </View>
      </View>

      <FlatList
        data={filteredAndSortedStreams}
        keyExtractor={(item) => item._id || item.id}
        renderItem={renderStreamItem}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={isDarkColorScheme ? '#3b82f6' : '#2563eb'}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20 px-4">
            {searchQuery.trim() ? (
              <>
                <FeIcon 
                  name="search" 
                  size={64} 
                  color={isDarkColorScheme ? '#475569' : '#94a3b8'} 
                />
                <Text className={`text-lg font-semibold mt-4 ${isDarkColorScheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  {t('liveStreams.searchEmptyTitle')}
                </Text>
                <Text className={`text-base text-center mt-2 ${isDarkColorScheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  {t('liveStreams.searchEmptySubtitle')}
                </Text>
              </>
            ) : (
              <>
                <FeIcon 
                  name="radio" 
                  size={64} 
                  color={isDarkColorScheme ? '#475569' : '#94a3b8'} 
                />
                <Text className={`text-lg font-semibold mt-4 ${isDarkColorScheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  {t('liveStreams.emptyTitle')}
                </Text>
                <Text className={`text-base text-center mt-2 ${isDarkColorScheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  {t('liveStreams.emptySubtitle')}
                </Text>
              </>
            )}
          </View>
        }
        contentContainerStyle={{
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* Stop Stream Confirmation Popup */}
      <Popup
        showModal={showStopConfirm}
        setShowModal={setShowStopConfirm}
        onClick={handleConfirmStop}
        onCancel={handleCancelStop}
        withCloseButton={true}
        swithColor={false}
      >
        <Text className={`text-lg font-semibold text-center mb-2 ${isDarkColorScheme ? 'text-white' : 'text-black'}`}>
          Stop Live Stream
        </Text>
        <Text className={`text-base text-center ${isDarkColorScheme ? 'text-slate-300' : 'text-slate-700'}`}>
          Are you sure you want to stop this live stream? All viewers will be disconnected.
        </Text>
      </Popup>
    </View>
  );
}

