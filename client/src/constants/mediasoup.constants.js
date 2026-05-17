/**
 * MediaSoup Constants
 * جميع القيم الثابتة المستخدمة في MediaSoup
 */

// ===== Timeouts & Delays =====
export const TIMEOUTS = {
  // Socket operations
  SOCKET_ACK_TIMEOUT: 10000, // 10 seconds
  GET_RTP_CAPABILITIES_TIMEOUT: 8000, // 8 seconds
  JOIN_ROOM_TIMEOUT: 10000, // 10 seconds
  CREATE_TRANSPORT_TIMEOUT: 10000, // 10 seconds
  PRODUCE_TIMEOUT: 10000, // 10 seconds
  
  // Retry delays
  INITIAL_RETRY_DELAY: 1000, // 1 second
  STATS_RETRY_BASE_DELAY: 100, // 100ms
  STATS_RETRY_MAX_DELAY: 200, // 200ms
  TRANSCODING_FALLBACK_BASE_DELAY: 1000, // 1 second (base delay for transcoding retries)
  
  // UI delays
  VIDEO_PLAY_DELAY: 50, // 50ms
  BANDWIDTH_MONITOR_INITIAL_DELAY: 2000, // 2 seconds
  BANDWIDTH_MONITOR_INTERVAL_UPDATE_DELAY: 100, // 100ms
  MISSED_CALL_TIMEOUT: 60000, // 60 seconds
};

// ===== Retry Configuration =====
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  STATS_MAX_RETRIES: 2,
  GET_RTP_CAPABILITIES_RETRIES: 2,
  JOIN_ROOM_RETRIES: 2,
  STATS_RETRIES: 2,
  TRANSCODING_FALLBACK_RETRIES: 3, // 3 retries for transcoding fallback
};

// ===== Bandwidth Monitoring =====
export const BANDWIDTH_MONITORING = {
  // Intervals (in milliseconds)
  NO_PEERS_INTERVAL: 10000, // 10 seconds
  SCREEN_SHARING_INTERVAL: 3000, // 3 seconds
  LOW_QUALITY_INTERVAL: 2000, // 2 seconds
  NORMAL_INTERVAL: 5000, // 5 seconds
  VIEWER_INTERVAL: 8000, // 8 seconds - للمشاهدين: تردد أقل لتوفير الموارد
  
  // Network quality thresholds (للـ broadcasters)
  PACKET_LOSS_THRESHOLD_POOR: 5, // 5%
  PACKET_LOSS_THRESHOLD_GOOD: 1, // 1%
  BITRATE_THRESHOLD_LOW: 500000, // 500 kbps
  BITRATE_THRESHOLD_HIGH: 1500000, // 1.5 Mbps
  RTT_THRESHOLD_POOR: 300, // 300ms
  RTT_THRESHOLD_GOOD: 150, // 150ms
  
  // ✅ Network quality thresholds للمشاهدين (أكثر تحفظاً لتوفير bandwidth)
  VIEWER_PACKET_LOSS_THRESHOLD_POOR: 3, // 3% (أكثر تحفظاً)
  VIEWER_PACKET_LOSS_THRESHOLD_GOOD: 0.5, // 0.5% (أكثر تحفظاً)
  VIEWER_BITRATE_THRESHOLD_LOW: 300000, // 300 kbps (أكثر تحفظاً)
  VIEWER_BITRATE_THRESHOLD_MEDIUM: 1000000, // 1 Mbps (أكثر تحفظاً)
  VIEWER_BITRATE_THRESHOLD_HIGH: 2000000, // 2 Mbps (أكثر تحفظاً)
  VIEWER_RTT_THRESHOLD_POOR: 200, // 200ms (أكثر تحفظاً)
  VIEWER_RTT_THRESHOLD_GOOD: 100, // 100ms (أكثر تحفظاً)
  
  // ✅ Dynamic Layer Selection Settings
  HYSTERESIS_DOWN_THRESHOLD: 0.15, // 15% - تأخير في التغيير للأسفل (تجنب التغييرات المفاجئة)
  HYSTERESIS_UP_THRESHOLD: 0.10, // 10% - تأخير في التغيير للأعلى (أكثر حساسية للتحسين)
  MIN_STABLE_DURATION: 3000, // 3 seconds - مدة الاستقرار المطلوبة قبل التغيير
  TREND_WINDOW_SIZE: 5, // عدد القياسات لتحديد الاتجاه
  QUALITY_SCORE_WEIGHTS: {
    bitrate: 0.5, // وزن bitrate
    packetLoss: 0.3, // وزن packet loss
    rtt: 0.2, // وزن RTT
  },
};

// ===== Video Quality Settings =====
export const VIDEO_QUALITY = {
  // Simulcast layers
  LAYER_LOW: 0,
  LAYER_MEDIUM: 1,
  LAYER_HIGH: 2,
  
  // Bitrates (in bps)
  LOW_BITRATE: 500000, // 500 kbps
  MEDIUM_BITRATE: 1000000, // 1 Mbps
  HIGH_BITRATE: 2500000, // 2.5 Mbps
  
  // Frame rates
  LOW_FRAMERATE: 7.5,
  MEDIUM_FRAMERATE: 15,
  HIGH_FRAMERATE: 30,
  
  // Resolution scaling
  LOW_SCALE: 2, // scaleResolutionDownBy
  MEDIUM_SCALE: 1.5,
  HIGH_SCALE: 1,
  
  // Simulcast layer bitrates (for encoding parameters)
  SIMULCAST_LOW_BITRATE: 300000, // 300 kbps
  SIMULCAST_MEDIUM_BITRATE: 750000, // 750 kbps
  
  // Simulcast layer scaling
  SIMULCAST_LOW_SCALE: 4,
  SIMULCAST_MEDIUM_SCALE: 2,
};

// ===== Active Speaker Detection =====
export const ACTIVE_SPEAKER = {
  SPEAKING_THRESHOLD: 30, // dB
  MIN_SPEAKING_DURATION: 200, // 200ms
  UPDATE_INTERVAL: 150, // 150ms
  MAX_ANALYSIS_INTERVAL: 100, // 100ms
  SILENCE_DURATION: 1000, // 1000ms - يجب أن يصمت لمدة 1000ms قبل إزالة المؤشر
  ACTIVE_INTERVAL: 100, // 100ms - interval عند وجود متحدث نشط
  INACTIVE_INTERVAL: 300, // 300ms - interval عند عدم وجود متحدث نشط
};

// ===== UI Constants =====
export const UI = {
  HIDE_TIMEOUT: 5000, // 5 seconds
  ANIMATION_DURATION: 300, // 300ms
  TOAST_DURATION: 3000, // 3 seconds
};

// ===== Browser Version Thresholds =====
export const BROWSER_VERSIONS = {
  CHROME_111: 111,
  CHROME_74: 74,
  FIREFOX_120: 120,
  FIREFOX_60: 60,
  SAFARI_12: 12,
};

// ===== Call Duration Calculation =====
export const CALL_DURATION = {
  MILLISECONDS_PER_SECOND: 1000,
  SECONDS_PER_MINUTE: 60,
  MINUTES_PER_HOUR: 60,
};

export default {
  TIMEOUTS,
  RETRY_CONFIG,
  BANDWIDTH_MONITORING,
  VIDEO_QUALITY,
  ACTIVE_SPEAKER,
  UI,
  BROWSER_VERSIONS,
  CALL_DURATION,
};

