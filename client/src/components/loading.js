/**
 * ✅ Loading Component
 * مكون قابل لإعادة الاستخدام لعرض حالة التحميل
 */

import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useColorScheme } from "~/lib/useColorScheme";

const Loading = ({ 
  message = 'جاري التحميل...', 
  size = 'large', 
  color = null,
  fullScreen = false,
  overlay = false,
  style = {},
  textStyle = {},
}) => {
  const { isDarkColorScheme } = useColorScheme();

  const defaultColor = color || (isDarkColorScheme ? '#f6f8f9' : '#000000');
  const backgroundColor = overlay 
    ? (isDarkColorScheme ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)')
    : 'transparent';

  const containerStyle = fullScreen
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
        ...style,
      }
    : {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor,
        ...style,
      };

  return (
    <View style={containerStyle}>
      <ActivityIndicator size={size} color={defaultColor} />
      {message && (
        <Text
          style={{
            marginTop: 12,
            fontSize: 14,
            color: defaultColor,
            textAlign: 'center',
            ...textStyle,
          }}
        >
          {message}
        </Text>
      )}
    </View>
  );
};

export default Loading;

