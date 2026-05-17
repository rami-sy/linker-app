# خطة التنفيذ - البث المباشر (Live Streaming)
## خطوة بخطوة - دليل تنفيذي كامل

---

## 📋 **نظرة عامة**

**الهدف**: إضافة ميزة البث المباشر (Live Streaming) مثل Twitch/Facebook Live  
**الوقت المقدر**: 3-4 أسابيع  
**الأولوية**: عالية ⭐⭐⭐⭐⭐

---

## 🎯 **المرحلة 1: التعديلات الأساسية في Backend** (أسبوع 1)

### ✅ **الخطوة 1.1: تحديث Room Model**

**الملف**: `server/src/models/room.model.js`

**ما يجب إضافته**:
```javascript
// إضافة بعد السطر 59 (بعد isGroup)
isLiveStream: {
  type: Boolean,
  default: false,
},
liveStreamSettings: {
  allowAnonymousViewers: {
    type: Boolean,
    default: false,
  },
  maxViewers: {
    type: Number,
    default: 1000,
  },
  allowViewersToSpeak: {
    type: Boolean,
    default: false,
  },
  isLive: {
    type: Boolean,
    default: false,
  },
  startedAt: Date,
  endedAt: Date,
  viewersCount: {
    type: Number,
    default: 0,
  },
},
broadcasters: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
}],
```

**التحقق**: 
- ✅ تشغيل migration (إذا لزم الأمر)
- ✅ اختبار إنشاء Room مع `isLiveStream: true`

---

### ✅ **الخطوة 1.2: تحديث Peer Class**

**الملف**: `server/src/mediasoup/peer.js`

**التعديلات**:
1. إضافة `role` في constructor (السطر 9):
```javascript
constructor({ id, userId, roomId, socket, userData = null, role = 'member' }) {
  // ... existing code ...
  this.role = role; // 'broadcaster' | 'viewer' | 'member'
  
  // تحديث metadata (السطر 28)
  this.metadata = {
    isAudioEnabled: role === 'broadcaster',
    isVideoEnabled: role === 'broadcaster',
    isScreenSharing: false,
    joinedAt: Date.now(),
    role: role, // ✅ إضافة role
  };
}
```

**التحقق**:
- ✅ اختبار إنشاء Peer مع role مختلف
- ✅ التأكد من metadata صحيح

---

### ✅ **الخطوة 1.3: تحديث verifyRoomMembership**

**الملف**: `server/src/sockets/handlers/mediasoup.handlers.js`

**السطر**: 48-74

**التعديل الكامل**:
```javascript
const verifyRoomMembership = async (roomId, userId, role = 'member') => {
  try {
    const chatRoom = await Room.findById(roomId);
    
    if (!chatRoom) {
      return { authorized: false, error: 'Room not found' };
    }
    
    // ✅ إذا كانت Live Stream
    if (chatRoom.isLiveStream && chatRoom.liveStreamSettings?.isLive) {
      // إذا كان broadcaster
      const isBroadcaster = chatRoom.broadcasters && chatRoom.broadcasters.some(
        id => id.toString() === userId.toString()
      );
      
      if (isBroadcaster) {
        return { authorized: true, room: chatRoom, role: 'broadcaster' };
      }
      
      // إذا كان viewer
      if (role === 'viewer') {
        // التحقق من allowAnonymousViewers
        if (!chatRoom.liveStreamSettings.allowAnonymousViewers && !userId) {
          return { authorized: false, error: 'Login required to view' };
        }
        
        // التحقق من maxViewers
        const currentViewers = chatRoom.liveStreamSettings.viewersCount || 0;
        if (currentViewers >= chatRoom.liveStreamSettings.maxViewers) {
          return { authorized: false, error: 'Stream is full' };
        }
        
        return { authorized: true, room: chatRoom, role: 'viewer' };
      }
    }
    
    // ✅ Logic العادي للغرف العادية
    const isMember = chatRoom.members.some(
      memberId => memberId.toString() === userId.toString()
    );
    
    if (!isMember) {
      return { authorized: false, error: 'User is not a member of this room' };
    }
    
    return { authorized: true, room: chatRoom, role: 'member' };
  } catch (error) {
    logger.error('❌ Error verifying room membership:', error);
    return { authorized: false, error: 'Error verifying room membership' };
  }
};
```

**التحقق**:
- ✅ اختبار joinRoom كـ broadcaster
- ✅ اختبار joinRoom كـ viewer
- ✅ اختبار joinRoom في غرفة عادية

---

### ✅ **الخطوة 1.4: تحديث joinRoom Handler**

**الملف**: `server/src/sockets/handlers/mediasoup.handlers.js`

**السطر**: 385

**التعديلات**:
1. إضافة `role` parameter:
```javascript
socket.on('joinRoom', async ({ roomId, userId, userData, isCaller, isVideoCall, role = 'member' }, callback) => {
```

2. تحديث verifyRoomMembership call (السطر 412):
```javascript
const membershipCheck = await verifyRoomMembership(roomId, userId, role);
```

3. إضافة role في createPeer (السطر 428):
```javascript
const userRole = membershipCheck.role || role;

const peer = roomManager.createPeer({
  socketId: socket.id,
  userId,
  roomId,
  socket,
  userData,
  role: userRole, // ✅ إضافة role
});
```

4. تحديث viewersCount (بعد السطر 437):
```javascript
// إذا كان viewer، تحديث viewersCount
if (userRole === 'viewer') {
  await Room.findByIdAndUpdate(roomId, {
    $inc: { 'liveStreamSettings.viewersCount': 1 }
  });
}
```

**التحقق**:
- ✅ اختبار joinRoom مع role مختلف
- ✅ التحقق من تحديث viewersCount

---

### ✅ **الخطوة 1.5: منع Viewers من Produce**

**الملف**: `server/src/sockets/handlers/mediasoup.handlers.js`

**السطر**: 654 (في produce handler)

**التعديل**: إضافة check بعد السطر 680:
```javascript
const peer = room.getPeer(socket.id);
if (!peer) {
  throw createError(ERROR_CODES.PEER_NOT_FOUND);
}

// ✅ منع Viewers من إنتاج media
if (peer.role === 'viewer') {
  logger.warn(`❌ Viewer ${peer.userId} attempted to produce media`, {
    userId: peer.userId,
    roomId,
    socketId: socket.id
  });
  return callback({
    success: false,
    error: 'Viewers cannot produce media. Only broadcasters can stream.'
  });
}
```

**التحقق**:
- ✅ محاولة produce كـ viewer (يجب أن يفشل)
- ✅ produce كـ broadcaster (يجب أن ينجح)

---

### ✅ **الخطوة 1.6: تحديث leaveRoom Handler**

**الملف**: `server/src/sockets/handlers/mediasoup.handlers.js`

**البحث عن**: `socket.on('leaveRoom'`

**التعديل**: إضافة تقليل viewersCount:
```javascript
// بعد إزالة peer من room
const peer = room.getPeer(socket.id);

if (peer && peer.role === 'viewer') {
  await Room.findByIdAndUpdate(roomId, {
    $inc: { 'liveStreamSettings.viewersCount': -1 }
  });
}
```

**التحقق**:
- ✅ اختبار leaveRoom كـ viewer
- ✅ التحقق من تقليل viewersCount

---

## 🎯 **المرحلة 2: Live Stream Management** (أسبوع 2)

### ✅ **الخطوة 2.1: إضافة Socket Handlers للبث المباشر**

**الملف**: `server/src/sockets/handlers/mediasoup.handlers.js`

**إضافة في نهاية الملف (قبل module.exports closing)**:

#### 2.1.1: startLiveStream
```javascript
/**
 * بدء البث المباشر
 */
socket.on('startLiveStream', async ({ roomId, settings = {} }, callback) => {
  try {
    // Rate limiting
    if (!socketRateLimiter.checkRateLimit(socket.id, 'startLiveStream')) {
      const rateLimitInfo = socketRateLimiter.getRateLimitInfo(socket.id, 'startLiveStream');
      return callback({ 
        success: false, 
        error: 'Too many start stream attempts, please slow down',
        rateLimitInfo 
      });
    }
    
    // Authorization
    const userIdCheck = verifyUserId(socket.user._id);
    if (!userIdCheck.authorized) {
      return callback({ success: false, error: userIdCheck.error });
    }
    
    const userId = socket.user._id;
    const room = await Room.findById(roomId);
    
    if (!room) {
      return callback({ success: false, error: 'Room not found' });
    }
    
    // التحقق من الصلاحيات
    const isBroadcaster = room.broadcasters && room.broadcasters.some(
      id => id.toString() === userId.toString()
    );
    
    if (!isBroadcaster && room.user?.toString() !== userId.toString()) {
      return callback({ success: false, error: 'Only broadcasters can start streams' });
    }
    
    // تحديث Room
    room.isLiveStream = true;
    room.liveStreamSettings = {
      allowAnonymousViewers: settings.allowAnonymousViewers ?? false,
      maxViewers: settings.maxViewers ?? 1000,
      allowViewersToSpeak: settings.allowViewersToSpeak ?? false,
      isLive: true,
      startedAt: new Date(),
      viewersCount: 0,
    };
    
    // إضافة broadcaster إذا لم يكن موجوداً
    if (!room.broadcasters || !room.broadcasters.some(id => id.toString() === userId.toString())) {
      if (!room.broadcasters) room.broadcasters = [];
      room.broadcasters.push(userId);
    }
    
    await room.save();
    
    // إشعار جميع المستخدمين
    io.emit('liveStreamStarted', {
      roomId,
      broadcaster: {
        _id: userId,
        userName: socket.user.userName || socket.user.firstName,
      },
      settings: room.liveStreamSettings,
    });
    
    logger.callEvent(`Live stream started: ${roomId}`, { roomId, userId });
    callback({ success: true, room: room.toObject() });
  } catch (error) {
    logger.error('❌ Error starting live stream:', error);
    callback({ success: false, error: error.message });
  }
});
```

#### 2.1.2: stopLiveStream
```javascript
/**
 * إيقاف البث المباشر
 */
socket.on('stopLiveStream', async ({ roomId }, callback) => {
  try {
    // Rate limiting
    if (!socketRateLimiter.checkRateLimit(socket.id, 'stopLiveStream')) {
      const rateLimitInfo = socketRateLimiter.getRateLimitInfo(socket.id, 'stopLiveStream');
      return callback({ 
        success: false, 
        error: 'Too many stop stream attempts, please slow down',
        rateLimitInfo 
      });
    }
    
    const userId = socket.user._id;
    const room = await Room.findById(roomId);
    
    if (!room) {
      return callback({ success: false, error: 'Room not found' });
    }
    
    // التحقق من الصلاحيات
    const isBroadcaster = room.broadcasters && room.broadcasters.some(
      id => id.toString() === userId.toString()
    );
    
    if (!isBroadcaster && room.user?.toString() !== userId.toString()) {
      return callback({ success: false, error: 'Only broadcasters can stop streams' });
    }
    
    room.liveStreamSettings.isLive = false;
    room.liveStreamSettings.endedAt = new Date();
    await room.save();
    
    // إشعار جميع المشاهدين
    io.to(roomId).emit('liveStreamEnded', { roomId });
    
    logger.callEvent(`Live stream stopped: ${roomId}`, { roomId, userId });
    callback({ success: true });
  } catch (error) {
    logger.error('❌ Error stopping live stream:', error);
    callback({ success: false, error: error.message });
  }
});
```

#### 2.1.3: getLiveStreams
```javascript
/**
 * الحصول على Live Streams النشطة
 */
socket.on('getLiveStreams', async ({ limit = 20, offset = 0 }, callback) => {
  try {
    const streams = await Room.find({
      isLiveStream: true,
      'liveStreamSettings.isLive': true,
    })
    .populate('broadcasters', 'userName firstName lastName images')
    .populate('user', 'userName firstName lastName images')
    .sort({ 'liveStreamSettings.startedAt': -1 })
    .limit(limit)
    .skip(offset)
    .lean();
    
    callback({ success: true, streams });
  } catch (error) {
    logger.error('❌ Error getting live streams:', error);
    callback({ success: false, error: error.message });
  }
});
```

#### 2.1.4: getStreamInfo
```javascript
/**
 * الحصول على معلومات stream محدد
 */
socket.on('getStreamInfo', async ({ roomId }, callback) => {
  try {
    const room = await Room.findById(roomId)
      .populate('broadcasters', 'userName firstName lastName images')
      .populate('user', 'userName firstName lastName images')
      .lean();
    
    if (!room || !room.isLiveStream || !room.liveStreamSettings?.isLive) {
      return callback({ success: false, error: 'Stream not found or not live' });
    }
    
    callback({ success: true, stream: room });
  } catch (error) {
    logger.error('❌ Error getting stream info:', error);
    callback({ success: false, error: error.message });
  }
});
```

**التحقق**:
- ✅ اختبار startLiveStream
- ✅ اختبار stopLiveStream
- ✅ اختبار getLiveStreams
- ✅ اختبار getStreamInfo

---

### ✅ **الخطوة 2.2: إضافة Rate Limits**

**الملف**: `server/src/middlewares/socketRateLimiter.js`

**إضافة**:
```javascript
startLiveStream: {
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 streams per minute
  message: 'Too many start stream attempts, please slow down'
},
stopLiveStream: {
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 stops per minute
  message: 'Too many stop stream attempts, please slow down'
},
getLiveStreams: {
  windowMs: 10 * 1000, // 10 seconds
  max: 20, // 20 requests per 10 seconds
  message: 'Too many get live streams requests, please slow down'
},
```

---

## 🎯 **المرحلة 3: Client-Side Implementation** (أسبوع 3)

### ✅ **الخطوة 3.1: تحديث useMediasoup Hook**

**الملف**: `client/src/hooks/useMediasoup.js`

**إضافة functions جديدة**:

#### 3.1.1: joinAsViewer
```javascript
/**
 * الانضمام كـ viewer (مشاهد فقط)
 */
const joinAsViewer = useCallback(async ({ roomId, userId, userData }) => {
  try {
    const stateMachine = callStateMachineRef.current;
    
    if (!stateMachine.canTransition(CALL_EVENTS.START_CALL)) {
      throw createError(ERROR_CODES.INVALID_STATE, `Cannot join as viewer in ${stateMachine.getState()} state`);
    }
    
    logger.callEvent('Joining as viewer', { roomId, userId });
    
    // الانتقال إلى حالة INVITING
    stateMachine.transition(CALL_EVENTS.START_CALL, { roomId, userId, userData, isVideoCall: true });
    
    // الانضمام كـ viewer
    socket.emit('joinRoom', {
      roomId,
      userId,
      userData,
      isCaller: false,
      isVideoCall: true,
      role: 'viewer', // ✅ إضافة role
    }, async (response) => {
      if (!response.success) {
        stateMachine.transition(CALL_EVENTS.CALL_FAILED, { error: response.error });
        throw createError(ERROR_CODES.OPERATION_FAILED, response.error);
      }
      
      // Setup device (viewer mode - لا يحتاج produce)
      await setupDevice({ isVideoCall: true, isViewer: true });
      
      // Setup transports (consumer only)
      await setupConsumerTransports(roomId, response.peers);
      
      stateMachine.transition(CALL_EVENTS.CALL_ACCEPTED);
    });
  } catch (error) {
    logger.error('Error joining as viewer:', error);
    throw error;
  }
}, [socket, setupDevice, setupConsumerTransports]);
```

#### 3.1.2: startLiveStream
```javascript
/**
 * بدء البث المباشر
 */
const startLiveStream = useCallback(async ({ roomId, settings = {} }) => {
  try {
    return new Promise((resolve, reject) => {
      socket.emit('startLiveStream', { roomId, settings }, (response) => {
        if (response.success) {
          resolve(response.room);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  } catch (error) {
    logger.error('Error starting live stream:', error);
    throw error;
  }
}, [socket]);
```

#### 3.1.3: stopLiveStream
```javascript
/**
 * إيقاف البث المباشر
 */
const stopLiveStream = useCallback(async ({ roomId }) => {
  try {
    return new Promise((resolve, reject) => {
      socket.emit('stopLiveStream', { roomId }, (response) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error));
        }
      });
    });
  } catch (error) {
    logger.error('Error stopping live stream:', error);
    throw error;
  }
}, [socket]);
```

#### 3.1.4: getLiveStreams
```javascript
/**
 * الحصول على Live Streams النشطة
 */
const getLiveStreams = useCallback(async ({ limit = 20, offset = 0 } = {}) => {
  try {
    return new Promise((resolve, reject) => {
      socket.emit('getLiveStreams', { limit, offset }, (response) => {
        if (response.success) {
          resolve(response.streams);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  } catch (error) {
    logger.error('Error getting live streams:', error);
    throw error;
  }
}, [socket]);
```

**إضافة في return statement**:
```javascript
return {
  // ... existing returns ...
  joinAsViewer,
  startLiveStream,
  stopLiveStream,
  getLiveStreams,
};
```

---

### ✅ **الخطوة 3.2: تحديث joinRoom في useMediasoup**

**الملف**: `client/src/hooks/useMediasoup.js`

**البحث عن**: `const joinRoom = useCallback`

**إضافة parameter**:
```javascript
const joinRoom = useCallback(async ({ roomId, userId, userData, isCaller, isVideoCall, role = 'member' }) => {
  // ... existing code ...
  
  // في socket.emit('joinRoom', ...)
  socket.emit('joinRoom', {
    roomId,
    userId,
    userData,
    isCaller,
    isVideoCall,
    role, // ✅ إضافة role
  }, async (response) => {
    // ... existing code ...
  });
}, [/* dependencies */]);
```

---

### ✅ **الخطوة 3.3: إنشاء Live Stream Components**

#### 3.3.1: StartLiveButton Component

**الملف الجديد**: `client/src/components/live-stream/start-live-button.js`

```javascript
import React, { useState } from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator } from 'react-native';
import { useMediasoup } from '../../../hooks/useMediasoup';
import { useTheme } from '../../../contexts/theme.context';
import logger from '../../../utils/logger';

export const StartLiveButton = ({ roomId, onStart, onError }) => {
  const { startLiveStream } = useMediasoup();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    try {
      setLoading(true);
      await startLiveStream({
        roomId,
        settings: {
          allowAnonymousViewers: false,
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
      className={`px-6 py-3 rounded-full ${
        theme === 'dark' ? 'bg-red-600' : 'bg-red-500'
      }`}
    >
      {loading ? (
        <ActivityIndicator color="white" />
      ) : (
        <Text className="text-white font-bold text-base">Go Live</Text>
      )}
    </TouchableOpacity>
  );
};
```

#### 3.3.2: StopLiveButton Component

**الملف الجديد**: `client/src/components/live-stream/stop-live-button.js`

```javascript
import React, { useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { useMediasoup } from '../../../hooks/useMediasoup';
import { useTheme } from '../../../contexts/theme.context';
import logger from '../../../utils/logger';

export const StopLiveButton = ({ roomId, onStop, onError }) => {
  const { stopLiveStream } = useMediasoup();
  const { theme } = useTheme();
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
      className={`px-6 py-3 rounded-full ${
        theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'
      }`}
    >
      {loading ? (
        <ActivityIndicator color={theme === 'dark' ? 'white' : 'black'} />
      ) : (
        <Text className={`font-bold text-base ${
          theme === 'dark' ? 'text-white' : 'text-black'
        }`}>
          End Stream
        </Text>
      )}
    </TouchableOpacity>
  );
};
```

#### 3.3.3: LiveStreamViewer Component

**الملف الجديد**: `client/src/components/live-stream/live-stream-viewer.js`

```javascript
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useMediasoup } from '../../../hooks/useMediasoup';
import { useTheme } from '../../../contexts/theme.context';
import logger from '../../../utils/logger';

export const LiveStreamViewer = ({ streamId, userId, userData }) => {
  const { joinAsViewer, remoteStreams } = useMediasoup();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const joinStream = async () => {
      try {
        setLoading(true);
        await joinAsViewer({
          roomId: streamId,
          userId,
          userData,
        });
        setLoading(false);
      } catch (err) {
        logger.error('Error joining stream:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    joinStream();
  }, [streamId, userId, userData]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="mt-4">Joining stream...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-red-500">Error: {error}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      {/* Video streams will be rendered here */}
      {remoteStreams.map((stream, index) => (
        <View key={index} className="w-full h-full">
          {/* Render video stream */}
        </View>
      ))}
    </View>
  );
};
```

---

### ✅ **الخطوة 3.4: إنشاء Live Streams Discovery Screen**

**الملف الجديد**: `client/app/(wrappers)/(home)/(providers)/(tabs)/live-streams.js`

```javascript
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useMediasoup } from '../../../../../src/hooks/useMediasoup';
import { useTheme } from '../../../../../src/contexts/theme.context';
import { useRouter } from 'expo-router';
import logger from '../../../../../src/utils/logger';

export default function LiveStreamsScreen() {
  const { getLiveStreams } = useMediasoup();
  const { theme } = useTheme();
  const router = useRouter();
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadStreams();
  }, []);

  const loadStreams = async () => {
    try {
      setLoading(true);
      const liveStreams = await getLiveStreams({ limit: 20, offset: 0 });
      setStreams(liveStreams);
    } catch (error) {
      logger.error('Error loading live streams:', error);
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View className={`flex-1 ${theme === 'dark' ? 'bg-[#12141b]' : 'bg-white'}`}>
      <FlatList
        data={streams}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => handleStreamPress(item)}
            className={`m-2 p-4 rounded-2xl ${
              theme === 'dark' ? 'bg-sec' : 'bg-gray-100'
            }`}
          >
            <View className="flex-row items-center">
              <Image
                source={{ uri: item.broadcasters?.[0]?.images?.[0]?.path }}
                className="w-16 h-16 rounded-full"
              />
              <View className="ml-4 flex-1">
                <Text className={`font-bold text-lg ${
                  theme === 'dark' ? 'text-white' : 'text-black'
                }`}>
                  {item.broadcasters?.[0]?.userName || 'Unknown'}
                </Text>
                <Text className={`text-sm ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {item.liveStreamSettings?.viewersCount || 0} viewers
                </Text>
              </View>
              <View className="bg-red-500 px-3 py-1 rounded-full">
                <Text className="text-white text-xs font-bold">LIVE</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Text className={`text-lg ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}>
              No live streams available
            </Text>
          </View>
        }
      />
    </View>
  );
}
```

---

## 🎯 **المرحلة 4: Testing & Polish** (أسبوع 4)

### ✅ **الخطوة 4.1: Unit Tests**

**إنشاء**: `server/tests/live-stream.test.js`

**اختبارات أساسية**:
- ✅ startLiveStream
- ✅ stopLiveStream
- ✅ joinAsViewer
- ✅ verifyRoomMembership مع Live Stream
- ✅ viewersCount updates

---

### ✅ **الخطوة 4.2: Integration Tests**

**اختبارات التكامل**:
- ✅ بدء stream → انضمام viewer → إيقاف stream
- ✅ عدة viewers في نفس الوقت
- ✅ maxViewers limit
- ✅ broadcaster produce, viewer consume only

---

### ✅ **الخطوة 4.3: UI Polish**

- ✅ Loading states
- ✅ Error handling
- ✅ Empty states
- ✅ Animations
- ✅ Haptic feedback

---

## 📋 **Checklist التنفيذ**

### المرحلة 1: Backend ✅
- [ ] تحديث Room Model
- [ ] تحديث Peer Class
- [ ] تحديث verifyRoomMembership
- [ ] تحديث joinRoom Handler
- [ ] منع Viewers من Produce
- [ ] تحديث leaveRoom Handler

### المرحلة 2: Live Stream Management ✅
- [ ] startLiveStream handler
- [ ] stopLiveStream handler
- [ ] getLiveStreams handler
- [ ] getStreamInfo handler
- [ ] Rate limits

### المرحلة 3: Client-Side ✅
- [ ] joinAsViewer في useMediasoup
- [ ] startLiveStream في useMediasoup
- [ ] stopLiveStream في useMediasoup
- [ ] getLiveStreams في useMediasoup
- [ ] StartLiveButton component
- [ ] StopLiveButton component
- [ ] LiveStreamViewer component
- [ ] Live Streams Discovery Screen

### المرحلة 4: Testing & Polish ✅
- [ ] Unit tests
- [ ] Integration tests
- [ ] UI polish
- [ ] Error handling
- [ ] Documentation

---

## 🚀 **بدء التنفيذ**

**ابدأ بالترتيب التالي**:
1. ✅ المرحلة 1 - الخطوة 1.1 (Room Model)
2. ✅ المرحلة 1 - الخطوة 1.2 (Peer Class)
3. ✅ المرحلة 1 - الخطوة 1.3 (verifyRoomMembership)
4. ✅ المرحلة 1 - الخطوة 1.4 (joinRoom)
5. ✅ المرحلة 1 - الخطوة 1.5 (منع Produce)
6. ✅ المرحلة 1 - الخطوة 1.6 (leaveRoom)

**بعد الانتهاء من المرحلة 1، انتقل للمرحلة 2، وهكذا...**

---

**تاريخ الإنشاء**: نوفمبر 2025  
**الحالة**: جاهز للتنفيذ ✅

