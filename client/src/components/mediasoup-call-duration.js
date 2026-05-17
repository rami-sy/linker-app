/**
 * Mediasoup Call Duration Timer
 * مؤقت مدة المكالمة - مكون منفصل
 */

import React, { useMemo, useState, useEffect } from "react";
import { Text } from "react-native";
import { useColorScheme } from "~/lib/useColorScheme";

const normalizeStartedAtMs = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : null;
};

const MediasoupCallDuration = ({ startedAt = null, textClassName = "" }) => {
  const { isDarkColorScheme } = useColorScheme();
  const [callDuration, setCallDuration] = useState(0);
  const startMs = useMemo(() => normalizeStartedAtMs(startedAt), [startedAt]);

  useEffect(() => {
    if (!startMs) {
      setCallDuration(0);
      return;
    }

    const updateDuration = () => {
      const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setCallDuration(diff);
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);

    return () => clearInterval(interval);
  }, [startMs]);

  /**
   * تحويل الثواني إلى تنسيق MM:SS أو HH:MM:SS
   */
  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(
        2,
        "0"
      )}:${String(secs).padStart(2, "0")}`;
    }
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // لا نعرض المؤقت إذا لم تبدأ المكالمة بعد
  if (!startMs) {
    return null;
  }

  return (
    <Text
      className={`text-xs font-mono font-semibold ${
        isDarkColorScheme ? "text-slate-300" : "text-slate-500"
      } ${textClassName}`}
      style={{
        letterSpacing: 0.5,
        opacity: 0.95,
      }}
    >
      {formatDuration(callDuration)}
    </Text>
  );
};

export default MediasoupCallDuration;

