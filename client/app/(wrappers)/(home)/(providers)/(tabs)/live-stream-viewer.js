import React, { useEffect, useState, useRef, useContext } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSelector } from "react-redux";
// ✅ تم إزالة MediasoupCall - سنستخدم MediasoupCallOverlay من الـ layout
import Layout from "../../../../../src/components/layout";
import FeIcon from "react-native-vector-icons/Feather";
import logger from "../../../../../src/utils/logger";
import * as Haptics from "expo-haptics";
import { StreamComments } from "../../../../../src/components/live-stream/stream-comments";
import { StreamReactions } from "../../../../../src/components/live-stream/stream-reactions";
import { MediasoupContext } from "../../../../../src/contexts/mediasoup.context";
import Button from "~/src/components/button";
import { useColorScheme } from "~/lib/useColorScheme";

export default function LiveStreamViewerScreen() {
  const { streamId } = useLocalSearchParams();
  const router = useRouter();
  const { isDarkColorScheme } = useColorScheme();
  const { user: currentUser } = useSelector((state) => state.users);
  const {
    joinAsViewer,
    joinRoom,
    remoteStreams,
    isJoined,
    leaveRoom,
    getStreamInfo,
  } = useContext(MediasoupContext);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streamInfo, setStreamInfo] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const hasJoinedRef = useRef(false); // ✅ لتتبع ما إذا تم استدعاء joinStream بالفعل
  const isJoinedRef = useRef(false); // ✅ لتتبع isJoined الحالي في cleanup
  const loadingRef = useRef(loading); // ✅ لتتبع loading الحالي

  // ✅ تحديث loadingRef عند تغيير loading
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const joinStream = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!streamId || !currentUser?._id) {
          throw new Error("Missing stream ID or user information");
        }

        // 1. التحقق من حالة الستريم أولاً
        let streamInfoData = null;
        try {
          streamInfoData = await getStreamInfo({ roomId: streamId });
          if (!streamInfoData || !streamInfoData.liveStreamSettings?.isLive) {
            throw new Error("Stream is not live or has ended");
          }
          setStreamInfo(streamInfoData);
          logger.callEvent("Stream info retrieved", {
            streamId,
            isLive: streamInfoData.liveStreamSettings?.isLive,
          });
        } catch (infoError) {
          // إذا فشل getStreamInfo، نتابع المحاولة (قد يكون الستريم نشط لكن getStreamInfo فشل)
          logger.warn(
            "Could not get stream info, proceeding anyway:",
            infoError
          );
        }

        // 2. ✅ الانضمام كـ viewer دائماً (حتى لو كان المستخدم broadcaster سابقاً)
        // إذا أراد المستخدم الدخول كـ broadcaster، يجب أن يستخدم mediasoup-call.js مباشرة
        // هذا يضمن أن live-stream-viewer.js يستخدم فقط للدخول كمشاهد
        await joinAsViewer({
          roomId: streamId,
          userId: currentUser._id,
          userData: {
            _id: currentUser._id,
            userName: currentUser.userName,
            firstName: currentUser.firstName,
            lastName: currentUser.lastName,
            images: currentUser.images,
          },
        });

        // ✅ لا نضع setLoading(false) هنا - سنستخدم useEffect لمراقبة isJoined
        // setLoading(false);
      } catch (err) {
        logger.error("Error joining stream:", err);
        // تحسين رسالة الخطأ
        let errorMessage = err.message || "Failed to join stream";
        if (
          errorMessage.includes("Stream is not live") ||
          errorMessage.includes("not live")
        ) {
          errorMessage = "This stream has ended or is not currently live";
        } else if (errorMessage.includes("Cannot join as viewer")) {
          errorMessage = "Unable to join stream. Please try again.";
        }
        setError(errorMessage);
        setLoading(false);
      }
    };

    // ✅ فحص إضافي: إذا كان المستخدم منضم بالفعل أو تم استدعاء joinStream بالفعل، لا نعيد المحاولة
    if (streamId && currentUser?._id && !isJoined && !hasJoinedRef.current) {
      hasJoinedRef.current = true;
      joinStream().finally(() => {
        // إعادة تعيين hasJoinedRef عند الانتهاء (نجاح أو فشل)
        // لكن فقط إذا لم يكن منضم (في حالة الفشل)
        // نستخدم setTimeout لتأخير التحقق حتى يتم تحديث isJoined
        setTimeout(() => {
          if (!isJoined) {
            hasJoinedRef.current = false;
          }
        }, 1000);
      });
    }

    // Cleanup on unmount فقط (لا نستدعي leaveRoom عند تغيير isJoined)
    return () => {
      // ✅ استخدام ref لتتبع ما إذا كان cleanup تم استدعاؤه بالفعل
      const shouldCleanup = hasJoinedRef.current && isJoinedRef.current;
      if (shouldCleanup) {
        logger.callEvent("Cleaning up on unmount", {
          streamId,
          isJoined: isJoinedRef.current,
        });
        leaveRoom().catch((err) => {
          logger.error("Error leaving stream on unmount:", err);
        });
      }
      // إعادة تعيين hasJoinedRef عند unmount
      hasJoinedRef.current = false;
      isJoinedRef.current = false;
    };
  }, [streamId, currentUser?._id, joinAsViewer, leaveRoom]); // ✅ إزالة isJoined من dependencies لتجنب إعادة التشغيل

  // ✅ مراقبة isJoined لتحديث loading state و ref
  useEffect(() => {
    isJoinedRef.current = isJoined; // ✅ تحديث ref مع isJoined
    if (isJoined) {
      logger.callEvent("Viewer successfully joined, hiding loading", {
        streamId,
        isJoined,
      });
      setLoading(false);
      setError(null);
    }
  }, [isJoined, streamId]);

  // ✅ timeout احتياطي: إذا استمر loading لأكثر من 10 ثوانٍ، نخفيه
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        if (loading) {
          logger.warn("Loading timeout - hiding loading screen", {
            streamId,
            isJoined,
          });
          setLoading(false);
        }
      }, 10000); // 10 seconds

      return () => clearTimeout(timeout);
    }
  }, [loading, streamId, isJoined]);

  const handleBack = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      if (isJoined) {
        await leaveRoom();
      }
    } catch (err) {
      logger.error("Error leaving stream:", err);
    }

    router.back();
  };

  if (loading) {
    return (
      <Layout>
        <View
          className={`flex-1 items-center justify-center ${isDarkColorScheme ? "bg-[#12141b]" : "bg-white"}`}
        >
          <ActivityIndicator
            size="large"
            color={isDarkColorScheme ? "#3b82f6" : "#2563eb"}
          />
          <Text
            className={`mt-4 text-base ${isDarkColorScheme ? "text-slate-400" : "text-slate-600"}`}
          >
            Joining stream...
          </Text>
        </View>
      </Layout>
    );
  }

  if (error) {
    // ✅ تحسين رسالة الخطأ بناءً على نوع الخطأ
    const isStreamEnded =
      error.includes("not a member") ||
      error.includes("not live") ||
      error.includes("ended");
    const errorTitle = isStreamEnded ? "Stream Ended" : "Error";
    const errorMessage = isStreamEnded
      ? "This stream has ended or is no longer available."
      : error;

    return (
      <Layout
        pb="pb-0"
        className={`flex-1 w-full linker-w ${isDarkColorScheme ? "bg-[#12141b]" : "bg-[#dee4e6]"} flex-1 items-center justify-center px-6`}
      >
        <View
          className={`items-center justify-center w-24 h-24 rounded-full ${isDarkColorScheme ? "bg-red-500/20" : "bg-red-100"} mb-6`}
        >
          <FeIcon
            name={isStreamEnded ? "radio" : "alert-circle"}
            size={48}
            color={isDarkColorScheme ? "#ef4444" : "#dc2626"}
          />
        </View>

        <Text
          className={`text-2xl font-bold mb-2 ${isDarkColorScheme ? "text-white" : "text-gray-900"}`}
        >
          {errorTitle}
        </Text>

        <Text
          className={`text-base text-center mb-8 max-w-sm ${isDarkColorScheme ? "text-slate-400" : "text-slate-600"}`}
        >
          {errorMessage}
        </Text>

        <Button onPress={handleBack} label="Go Back" />
      </Layout>
    );
  }

  return (
    <Layout>
      <View className="flex-1">
        {/* ✅ Header - تم حذف زر العودة للمشاهدين */}

        {/* Video Stream */}
        {/* ✅ MediasoupCallOverlay في الـ layout سيعرض المكالمة تلقائياً مع isViewer={true} */}
        <View className="flex-1 relative">
          {/* Buttons removed - Comments and Reactions */}
        </View>

        {/* Comments Panel removed */}
      </View>
    </Layout>
  );
}
