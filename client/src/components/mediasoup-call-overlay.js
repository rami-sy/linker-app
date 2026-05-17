/**
 * MediaSoup Call Overlay
 * عرض المكالمة فوق المحتوى
 */

import React, { useContext } from 'react';
import { View } from "react-native";
import { MediasoupContext } from '../contexts/mediasoup.context';
import MediasoupCall from './mediasoup-call';
import CallWaitingNotification from './call-waiting-notification';
import logger from '../utils/logger';

const MediasoupCallOverlay = () => {
  const { isJoined, roomId, incomingCall, isVideoCall, waitingCall, currentRole } = useContext(MediasoupContext);

  // ✅ تم إزالة اللوغ المتكرر لتقليل الضغط على console
  // logger.roomEvent('MediasoupCallOverlay state:', { isJoined, roomId, incomingCall, isVideoCall, waitingCall, currentRole });
  
  // ✅ تحديد إذا كان المستخدم viewer
  const isViewer = currentRole === 'viewer';
  
  // ✅ عرض Call Waiting Notification إذا كان هناك waiting call
  if (waitingCall) {
    return (
      <View>
        {/* عرض المكالمة الحالية في الخلفية */}
        {isJoined && roomId && (
          <MediasoupCall roomId={roomId} isVideoCall={isVideoCall} isViewer={isViewer} />
        )}
        {/* عرض Call Waiting Notification في المقدمة */}
        <CallWaitingNotification />
      </View>
    );
  }
  
  // لا نعرض المكالمة إذا كان هناك incoming call (يجب أن يقبله أولاً)
  if (incomingCall) {
    return null;
  }
  
  // لا نعرض المكالمة إذا لم ننضم للغرفة
  if (!isJoined || !roomId) {
    return null;
  }

  // ✅ تمرير isViewer تلقائياً بناءً على currentRole
  return <MediasoupCall roomId={roomId} isVideoCall={isVideoCall} isViewer={isViewer} />;
};

export default MediasoupCallOverlay;


