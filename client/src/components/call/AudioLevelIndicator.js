/**
 * Audio Level Indicator Component
 * مؤشر مرئي لمستوى الصوت - دوائر متحركة و glow effect
 * يشبه Google Meet لكن أكثر حيوية
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, Easing } from 'react-native';

// Helper function لتحويل hex color إلى rgba
const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const AudioLevelIndicator = ({ 
  audioLevel = 0, // 0-255
  size = 100, // حجم الصورة
  isActive = false, // هل المستخدم يتحدث؟
  color = '#10b981' // لون الهالة (emerald-500)
}) => {
  // 4 layers - إضافة background glow layer
  const backgroundGlow = useRef(new Animated.Value(1)).current;
  const backgroundOpacity = useRef(new Animated.Value(0)).current;
  
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;
  
  const ring3Scale = useRef(new Animated.Value(1)).current;
  const ring3Opacity = useRef(new Animated.Value(0)).current;
  
  const ring4Scale = useRef(new Animated.Value(1)).current;
  const ring4Opacity = useRef(new Animated.Value(0)).current;

  // Smoothed audio level - لتجنب القفزات المفاجئة
  const [smoothedLevel, setSmoothedLevel] = useState(0);
  const smoothedLevelRef = useRef(0);
  
  // Smooth the audio level changes
  useEffect(() => {
    const smoothingFactor = 0.6; // زيادة للاستجابة الأسرع
    const targetLevel = audioLevel;
    
    const smoothInterval = setInterval(() => {
      smoothedLevelRef.current = smoothedLevelRef.current + (targetLevel - smoothedLevelRef.current) * smoothingFactor;
      setSmoothedLevel(smoothedLevelRef.current);
    }, 16); // ~60fps
    
    return () => clearInterval(smoothInterval);
  }, [audioLevel]);
  
  // Continuous subtle pulse animation
  useEffect(() => {
    const subtlePulse = Animated.loop(
      Animated.sequence([
        Animated.timing(backgroundGlow, {
          toValue: 1.04,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(backgroundGlow, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        })
      ])
    );
    
    if (isActive) {
      subtlePulse.start();
      Animated.timing(backgroundOpacity, {
        toValue: 0.12,
        duration: 400,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }).start();
    } else {
      subtlePulse.stop();
      Animated.timing(backgroundOpacity, {
        toValue: 0,
        duration: 600,
        easing: Easing.bezier(0.42, 0, 0.58, 1),
        useNativeDriver: true,
      }).start();
    }
    
    return () => subtlePulse.stop();
  }, [isActive]);
  
  useEffect(() => {
    if (isActive && smoothedLevel > 30) {
      // حساب intensity بناءً على مستوى الصوت المنعّم (0-1)
      const intensity = Math.min(smoothedLevel / 255, 1);
      
      // Ring 1 - الأقرب (استجابة فورية)
      Animated.parallel([
        Animated.timing(ring1Scale, {
          toValue: 1 + intensity * 0.22,
          duration: 80,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(ring1Opacity, {
          toValue: 0.90 + intensity * 0.10,
          duration: 70,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      ]).start();
      
      // Ring 2 - الوسط (سريع)
      Animated.parallel([
        Animated.timing(ring2Scale, {
          toValue: 1 + intensity * 0.38,
          duration: 100,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(ring2Opacity, {
          toValue: 0.75 + intensity * 0.15,
          duration: 90,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      ]).start();
      
      // Ring 3 - الخارجي (متوسط السرعة)
      Animated.parallel([
        Animated.timing(ring3Scale, {
          toValue: 1 + intensity * 0.55,
          duration: 120,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(ring3Opacity, {
          toValue: 0.60 + intensity * 0.20,
          duration: 110,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      ]).start();

      // Ring 4 - الأبعد (الأوسع)
      Animated.parallel([
        Animated.timing(ring4Scale, {
          toValue: 1 + intensity * 0.75,
          duration: 140,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(ring4Opacity, {
          toValue: 0.45 + intensity * 0.25,
          duration: 130,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      ]).start();
      
    } else {
      // إخفاء جميع الحلقات عند عدم التحدث - بشكل تدريجي
      Animated.parallel([
        // Ring 1
        Animated.timing(ring1Scale, {
          toValue: 1,
          duration: 350,
          easing: Easing.bezier(0.42, 0, 0.58, 1),
          useNativeDriver: true,
        }),
        Animated.timing(ring1Opacity, {
          toValue: 0,
          duration: 350,
          easing: Easing.bezier(0.42, 0, 0.58, 1),
          useNativeDriver: true,
        }),
        // Ring 2
        Animated.timing(ring2Scale, {
          toValue: 1,
          duration: 380,
          easing: Easing.bezier(0.42, 0, 0.58, 1),
          useNativeDriver: true,
        }),
        Animated.timing(ring2Opacity, {
          toValue: 0,
          duration: 380,
          easing: Easing.bezier(0.42, 0, 0.58, 1),
          useNativeDriver: true,
        }),
        // Ring 3
        Animated.timing(ring3Scale, {
          toValue: 1,
          duration: 400,
          easing: Easing.bezier(0.42, 0, 0.58, 1),
          useNativeDriver: true,
        }),
        Animated.timing(ring3Opacity, {
          toValue: 0,
          duration: 400,
          easing: Easing.bezier(0.42, 0, 0.58, 1),
          useNativeDriver: true,
        }),
        // Ring 4
        Animated.timing(ring4Scale, {
          toValue: 1,
          duration: 420,
          easing: Easing.bezier(0.42, 0, 0.58, 1),
          useNativeDriver: true,
        }),
        Animated.timing(ring4Opacity, {
          toValue: 0,
          duration: 420,
          easing: Easing.bezier(0.42, 0, 0.58, 1),
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [smoothedLevel, isActive]);
  
  return (
    <>
      {/* Background subtle glow - continuous pulse */}
      <Animated.View
        style={{
          position: 'absolute',
          top: -30,
          left: -30,
          right: -30,
          bottom: -30,
          borderRadius: 9999,
          backgroundColor: hexToRgba(color, 0.08),
          opacity: backgroundOpacity,
          transform: [{ scale: backgroundGlow }],
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.30,
          shadowRadius: 32,
        }}
        pointerEvents="none"
      />

      {/* Ring 4 - Outermost glow */}
      <Animated.View
        style={{
          position: 'absolute',
          top: -21,
          left: -21,
          right: -21,
          bottom: -21,
          borderRadius: 9999,
          borderWidth: 4,
          borderColor: hexToRgba(color, 0.30),
          opacity: ring4Opacity,
          transform: [{ scale: ring4Scale }],
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.35,
          shadowRadius: 28,
        }}
        pointerEvents="none"
      />
      
      {/* Ring 3 - Outer glow */}
      <Animated.View
        style={{
          position: 'absolute',
          top: -15,
          left: -15,
          right: -15,
          bottom: -15,
          borderRadius: 9999,
          borderWidth: 4,
          borderColor: hexToRgba(color, 0.45),
          opacity: ring3Opacity,
          transform: [{ scale: ring3Scale }],
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.45,
          shadowRadius: 22,
        }}
        pointerEvents="none"
      />
      
      {/* Ring 2 - Middle */}
      <Animated.View
        style={{
          position: 'absolute',
          top: -9,
          left: -9,
          right: -9,
          bottom: -9,
          borderRadius: 9999,
          borderWidth: 4,
          borderColor: hexToRgba(color, 0.60),
          opacity: ring2Opacity,
          transform: [{ scale: ring2Scale }],
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.60,
          shadowRadius: 16,
        }}
        pointerEvents="none"
      />
      
      {/* Ring 1 - Inner (Closer to center) */}
      <Animated.View
        style={{
          position: 'absolute',
          top: -3,
          left: -3,
          right: -3,
          bottom: -3,
          borderRadius: 9999,
          borderWidth: 4,
          borderColor: hexToRgba(color, 0.80),
          opacity: ring1Opacity,
          transform: [{ scale: ring1Scale }],
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.75,
          shadowRadius: 10,
        }}
        pointerEvents="none"
      />
    </>
  );
};

export default AudioLevelIndicator;
