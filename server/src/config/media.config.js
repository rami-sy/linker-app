/**
 * MediaSoup Configuration
 * إعدادات MediaSoup للمكالمات الصوتية والمرئية
 */

const os = require('os');
const logger = require('../utils/logger');

/**
 * الحصول على IP المحلي للسيرفر
 * نُعطي الأولوية للشبكة المحلية (192.168.x.x) على VPN
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address });
      }
    }
  }
  
  // أولوية: WiFi/Ethernet المحلي (192.168.x.x) > VPN (26.x.x.x) > أي شيء آخر
  const localNetwork = addresses.find(a => a.address.startsWith('192.168.'));
  if (localNetwork) {
    logger.info(`🌐 Found local network interface: ${localNetwork.name} → ${localNetwork.address}`);
    return localNetwork.address;
  }
  
  const vpn = addresses.find(a => a.address.startsWith('26.'));
  if (vpn) {
    logger.info(`🌐 Found VPN interface: ${vpn.name} → ${vpn.address}`);
    return vpn.address;
  }
  
  if (addresses.length > 0) {
    logger.info(`🌐 Using first available interface: ${addresses[0].name} → ${addresses[0].address}`);
    return addresses[0].address;
  }
  
  return '127.0.0.1';
}

const localIP = getLocalIP();
logger.info(`🌐 Local IP detected: ${localIP}`);
logger.info(`🌐 MEDIASOUP_ANNOUNCED_IP env: ${process.env.MEDIASOUP_ANNOUNCED_IP || 'not set'}`);

// للتطوير من جهازين: استخدم IP الشبكة المحلية أو Public IP
// للتطوير على نفس الجهاز: استخدم 127.0.0.1
const announcedIP = process.env.MEDIASOUP_ANNOUNCED_IP || localIP;
logger.info(`🌐 Using announced IP: ${announcedIP}`);
logger.info(`💡 For testing from 2 devices: Set MEDIASOUP_ANNOUNCED_IP to your public IP or local network IP (192.168.x.x)`);

const mediaConfig = {
  // Worker Settings
  worker: {
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
    logLevel: 'warn', // 'debug' | 'warn' | 'error' | 'none'
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
      'rtx',
      'bwe',
      'score',
      'simulcast',
      'svc',
      'sctp'
    ],
  },

  // Router Settings
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
          'profile-id': 2,
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '4d0032',
          'level-asymmetry-allowed': 1,
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
          'x-google-start-bitrate': 1000,
        },
      },
    ],
  },

  // WebRTC Transport Settings
  webRtcTransport: {
    listenIps: [
      {
        ip: '0.0.0.0',
        // ⚠️ مهم جداً: ضع IP السيرفر العام هنا
        // للتطوير المحلي، نستخدم IP المحلي
        // للإنتاج على VPS/Cloud، ضع Public IP في MEDIASOUP_ANNOUNCED_IP
        announcedIp: announcedIP,
        // مثال: announcedIp: '95.179.143.226'
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000, // 1 Mbps
    minimumAvailableOutgoingBitrate: 600000,  // 600 Kbps
    maxSctpMessageSize: 262144,
    // ✅ تحسين الأداء: زيادة maxIncomingBitrate لدعم عدد أكبر من المشاهدين
    // للمشاهدين: ~500 kbps per viewer (Low quality)
    // للبث: ~2.5 Mbps per broadcaster
    maxIncomingBitrate: 5000000, // 5 Mbps (يمكن تعديله ديناميكياً حسب عدد المشاهدين)
  },

  // إعدادات الغرفة
  room: {
    maxPeers: 50, // الحد الأقصى للمستخدمين في الغرفة
  },
};

module.exports = mediaConfig;
