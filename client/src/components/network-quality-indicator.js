/**
 * Network Quality Indicator Component
 * مؤشر جودة الاتصال في UI
 */

import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, Platform, Animated, TouchableOpacity } from 'react-native';
import FeIcon from 'react-native-vector-icons/Feather';
import { MediasoupContext } from '../contexts/mediasoup.context';
import MediasoupCallDuration from './mediasoup-call-duration';
import Tooltip from './tooltip';
import { useColorScheme } from '../../lib/useColorScheme';

const NetworkQualityIndicator = ({
  peers = [],
  startedAt = null,
  onShowMetrics = null,
}) => {
  const { isDarkColorScheme } = useColorScheme();
  const { getConnectionStatistics, isJoined } = useContext(MediasoupContext);
  
  const [quality, setQuality] = useState('good'); // 'good', 'fair', 'poor', 'unknown'
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!isJoined || Platform.OS !== 'web') {
      return;
    }

    let intervalId;
    let isActive = true;

    const updateQuality = async () => {
      try {
        const connectionStats = await getConnectionStatistics();
        if (!isActive || !connectionStats) return;

        // حساب جودة الاتصال بناءً على الإحصائيات
        let calculatedQuality = 'unknown';
        let packetLossRate = 0;
        let bitrate = 0;
        let rtt = 0;

        // جمع إحصائيات من جميع producers و consumers
        const allStats = {
          producers: connectionStats.producers || {},
          consumers: connectionStats.consumers || {},
        };

        let totalPacketsSent = 0;
        let totalPacketsLost = 0;
        let totalBitrate = 0;
        let totalRtt = 0;
        let count = 0;

        // معالجة Producers
        for (const producerId in allStats.producers) {
          const producer = allStats.producers[producerId];
          if (producer.stats && Array.isArray(producer.stats)) {
            producer.stats.forEach(stat => {
              if (stat.type === 'outbound-rtp') {
                if (stat.packetsSent) totalPacketsSent += stat.packetsSent;
                if (stat.packetsLost) totalPacketsLost += stat.packetsLost;
                if (stat.bitrate) totalBitrate += stat.bitrate;
                if (stat.roundTripTime) {
                  totalRtt += stat.roundTripTime;
                  count++;
                }
              }
            });
          }
        }

        // معالجة Consumers
        for (const consumerId in allStats.consumers) {
          const consumer = allStats.consumers[consumerId];
          if (consumer.stats && Array.isArray(consumer.stats)) {
            consumer.stats.forEach(stat => {
              if (stat.type === 'inbound-rtp') {
                if (stat.packetsReceived) totalPacketsSent += stat.packetsReceived;
                if (stat.packetsLost) totalPacketsLost += stat.packetsLost;
                // أيضاً نحصل على RTT من inbound-rtp
                if (stat.jitter !== undefined && stat.jitter > 0) {
                  // استخدام jitter كتقدير تقريبي للـ latency
                  totalRtt += stat.jitter * 10; // تحويل jitter إلى ms تقريبي
                  count++;
                }
              }
            });
          }
        }

        // حساب معدل فقدان الحزم (فقط إذا كانت هناك حزم)
        if (totalPacketsSent > 0) {
          packetLossRate = (totalPacketsLost / totalPacketsSent) * 100;
        }

        // حساب متوسط RTT (بالمللي ثانية)
        if (count > 0) {
          rtt = totalRtt / count;
        }

        // حساب متوسط Bitrate (kbps) - فقط من producers
        // نحسب bitrate من producers فقط لأنهم من يرسلون البيانات
        let producerCount = 0;
        for (const producerId in allStats.producers) {
          const producer = allStats.producers[producerId];
          if (producer.stats && Array.isArray(producer.stats)) {
            producer.stats.forEach(stat => {
              if (stat.type === 'outbound-rtp' && stat.bitrate) {
                producerCount++;
              }
            });
          }
        }
        bitrate = producerCount > 0 ? totalBitrate / producerCount / 1000 : 0;

        // تحديد جودة الاتصال
        // معايير الجودة:
        // - Good: packet loss < 1%, RTT < 150ms, bitrate > 100 kbps
        // - Fair: packet loss < 5%, RTT < 300ms, bitrate > 50 kbps
        // - Poor: packet loss >= 5% أو RTT >= 300ms أو bitrate <= 50 kbps

        // إذا لم تكن هناك بيانات كافية، نبقى على unknown
        if (totalPacketsSent === 0 && rtt === 0 && bitrate === 0) {
          calculatedQuality = 'unknown';
        } else {
          // تحقق من المعايير بشكل منطقي
          // نبدأ بالجودة الأفضل وننزل تدريجياً
          
          // Good: كل المعايير ممتازة (يجب أن تكون البيانات متوفرة)
          const hasGoodData = totalPacketsSent > 0 || rtt > 0 || bitrate > 0;
          const isGood = hasGoodData &&
            packetLossRate < 1 &&
            (rtt === 0 || rtt < 150) &&
            (bitrate === 0 || bitrate > 100);
          
          // Fair: معايير مقبولة
          const isFair = hasGoodData &&
            packetLossRate < 5 &&
            (rtt === 0 || rtt < 300) &&
            (bitrate === 0 || bitrate > 50);
          
          // Poor: معايير سيئة (يجب أن تكون البيانات موجودة لتحديد أنها سيئة)
          const isPoor = hasGoodData && (
            packetLossRate >= 5 ||
            (rtt >= 300 && rtt > 0) ||
            (bitrate > 0 && bitrate <= 50)
          );
          
          // ✅ تم إزالة console.log لتقليل اللوغات المتكررة
          if (isGood) {
            calculatedQuality = 'good';
          } else if (isFair && !isPoor) {
            calculatedQuality = 'fair';
          } else if (isPoor) {
            calculatedQuality = 'poor';
          } else {
            // افتراضي: fair إذا كانت هناك بيانات ولكن غير كافية للتحقق بدقة
            calculatedQuality = 'fair';
          }
        }

        // حفظ الإحصائيات مع القيم المحسوبة
        setStats({
          ...connectionStats,
          packetLossRate,
          bitrate,
          rtt,
        });
        setQuality(calculatedQuality);
      } catch (error) {
        // ✅ تم إزالة console.error لتقليل اللوغات المتكررة
        // logger.error('Error updating network quality:', error);
        if (isActive) {
          setQuality('unknown');
        }
      }
    };

    // تحديث أولي
    updateQuality();

    // تحديث دوري كل 3 ثوانٍ
    intervalId = setInterval(updateQuality, 3000);

    return () => {
      isActive = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isJoined, getConnectionStatistics]);

  if (!isJoined || Platform.OS !== 'web') {
    return null;
  }

  // ✅ ألوان وحالات المؤشر محسّنة مع visual indicators أوضح
  const qualityConfig = {
    good: {
      color: '#10b981', // green
      icon: 'wifi', // ✅ أيقونة WiFi أوضح
      label: 'ممتاز',
      bgColor: isDarkColorScheme ? 'bg-green-500/20' : 'bg-green-100',
      pulseColor: '#10b981',
      glow: true, // ✅ إضافة glow effect للجودة الجيدة
    },
    fair: {
      color: '#f59e0b', // amber
      icon: 'wifi', // ✅ أيقونة WiFi
      label: 'مقبول',
      bgColor: isDarkColorScheme ? 'bg-amber-500/20' : 'bg-amber-100',
      pulseColor: '#f59e0b',
      glow: false,
    },
    poor: {
      color: '#ef4444', // red
      icon: 'wifi-off', // ✅ أيقونة WiFi-off للجودة الضعيفة
      label: 'ضعيف',
      bgColor: isDarkColorScheme ? 'bg-red-500/20' : 'bg-red-100',
      pulseColor: '#ef4444',
      glow: false,
    },
    unknown: {
      color: '#6b7280', // gray
      icon: 'loader', // ✅ أيقونة loader أثناء القياس
      label: '...',
      bgColor: isDarkColorScheme ? 'bg-gray-500/20' : 'bg-gray-100',
      pulseColor: '#6b7280',
      glow: false,
    },
  };

  const config = qualityConfig[quality] || qualityConfig.unknown;

  /**
   * ✅ الحصول على نص Tooltip محسّن مع Tips
   */
  const getNetworkQualityTooltip = () => {
    if (!stats) {
      return 'Checking network quality...';
    }

    const packetLossRate = stats.packetLossRate || 0;
    const bitrate = stats.bitrate || 0;
    const rtt = stats.rtt || 0;
    const connectionState = stats.transports?.producer?.connectionState || 'unknown';

    let tooltipText = '';
    let tips = [];
    
    switch (quality) {
      case 'good':
        tooltipText = '✅ جودة الشبكة ممتازة';
        break;
      case 'fair':
        tooltipText = '⚠️ جودة الشبكة مقبولة ولكن يمكن تحسينها';
        tips = [
          '• تأكد من اتصالك بشبكة WiFi مستقرة',
          '• أغلق التطبيقات التي تستهلك bandwidth',
          '• اقترب من جهاز الراوتر إذا أمكن',
        ];
        break;
      case 'poor':
        tooltipText = '❌ جودة الشبكة ضعيفة';
        tips = [
          '• تحقق من اتصال الإنترنت',
          '• جرب الانتقال إلى شبكة WiFi أقوى',
          '• أغلق التطبيقات الأخرى',
          '• أعد تشغيل الراوتر إذا لزم الأمر',
          '• تأكد من عدم وجود تداخل في الإشارة',
        ];
        break;
      case 'unknown':
      default:
        tooltipText = '⏳ جاري قياس جودة الشبكة...';
        break;
    }

    // إضافة تفاصيل إضافية
    const details = [];
    if (packetLossRate > 0) {
      const lossStatus = packetLossRate < 1 ? '✅' : packetLossRate < 5 ? '⚠️' : '❌';
      details.push(`${lossStatus} فقدان الحزم: ${packetLossRate.toFixed(1)}%`);
    }
    if (bitrate > 0) {
      const bitrateStatus = bitrate > 1000 ? '✅' : bitrate > 500 ? '⚠️' : '❌';
      details.push(`${bitrateStatus} سرعة الإرسال: ${bitrate.toFixed(0)} kbps`);
    }
    if (rtt > 0) {
      const rttStatus = rtt < 150 ? '✅' : rtt < 300 ? '⚠️' : '❌';
      details.push(`${rttStatus} زمن الاستجابة: ${rtt.toFixed(0)}ms`);
    }
    if (connectionState !== 'connected') {
      details.push(`🔌 الحالة: ${connectionState}`);
    }

    let fullTooltip = tooltipText;
    
    if (details.length > 0) {
      fullTooltip += `\n\n📊 التفاصيل:\n${details.join('\n')}`;
    }

    if (tips.length > 0) {
      fullTooltip += `\n\n💡 نصائح لتحسين الجودة:\n${tips.join('\n')}`;
    }

    return fullTooltip;
  };

  // Animation for quality change (Native only)
  const scaleAnimRef = useRef(null);
  
  useEffect(() => {
    if (Platform.OS !== 'web') {
      if (!scaleAnimRef.current) {
        scaleAnimRef.current = new Animated.Value(1);
      }
      Animated.sequence([
        Animated.timing(scaleAnimRef.current, {
          toValue: 1.2,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnimRef.current, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [quality]);

  const animatedStyle = Platform.OS !== 'web' && scaleAnimRef.current ? {
    transform: [{ scale: scaleAnimRef.current }],
  } : {};

  return (
    <Tooltip text={getNetworkQualityTooltip()}>
      <TouchableOpacity
        onPress={() => onShowMetrics && onShowMetrics()}
        onLongPress={() => onShowMetrics && onShowMetrics()}
        activeOpacity={0.7}
      >
        <View 
          className="rounded-xl px-3 py-2 flex-row items-center gap-x-2.5 mt-3"
          style={[
            animatedStyle,
            {
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              backdropFilter: 'blur(5px)',
              elevation: 8,
              padding: 10,
              ...(config.glow && Platform.OS === 'web' ? {
                boxShadow: `0 0 8px ${config.color}40`,
              } : {}),
            }
          ]}
        >
          {/* ✅ Network Quality Icon محسّن مع visual indicator */}
          <View 
            className="flex-row items-center relative"
          >
            <FeIcon 
              name={config.icon} 
              size={24} 
              color={config.color}
              style={Platform.OS === 'web' ? {
                transition: 'all 0.3s ease',
                opacity: stats?.transports?.producer?.connectionState === 'connected' ? 1 : 0.5,
                filter: config.glow 
                  ? `drop-shadow(0 0 6px ${config.color}80)` 
                  : `drop-shadow(0 0 4px ${config.color}60)`,
                animation: quality === 'unknown' && Platform.OS === 'web' 
                  ? 'pulse 2s ease-in-out infinite' 
                  : 'none',
              } : {
                opacity: stats?.transports?.producer?.connectionState === 'connected' ? 1 : 0.5,
              }}
            />
            {/* ✅ Quality Badge - شارة صغيرة تعرض الحالة */}
            {quality !== 'unknown' && (
              <View 
                className="absolute -top-1 -right-1"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: config.color,
                  ...(config.glow && Platform.OS === 'web' ? {
                    boxShadow: `0 0 4px ${config.color}`,
                  } : {}),
                }}
              />
            )}
          </View>


      {/* Divider - خط فاصل بسيط */}
      {peers.length > 0 && (
        <View 
          className="h-4 w-px" 
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }} 
        />
      )}

          {/* Call Duration - نص بسيط بدون تأثيرات قوية */}
          {startedAt && <MediasoupCallDuration startedAt={startedAt} />}

        </View>
      </TouchableOpacity>
    </Tooltip>
  );
};

export default NetworkQualityIndicator;

