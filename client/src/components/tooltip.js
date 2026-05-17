import React, { useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { useColorScheme } from '../../lib/useColorScheme';

/**
 * Tooltip Component
 * يعرض tooltip عند hover على الويب فقط
 */
const Tooltip = ({ children, text, placement = 'top' }) => {
  const [show, setShow] = useState(false);
  const { isDarkColorScheme } = useColorScheme();

  if (Platform.OS !== 'web') {
    // على native، فقط نعرض children بدون tooltip
    return children;
  }

  return (
    <View
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative' }}
    >
      {children}
      {show && text && (
        <View
          className="absolute z-[10001] px-2 py-1 rounded-md bg-gray-900/90 dark:bg-black/90"
          style={{
            ...(placement === 'top' && { bottom: '100%', marginBottom: 8, left: '50%', transform: [{ translateX: -50 }] }),
            ...(placement === 'bottom' && { top: '100%', marginTop: 8, left: '50%', transform: [{ translateX: -50 }] }),
            ...(placement === 'left' && { right: '100%', marginRight: 8, top: '50%', transform: [{ translateY: -50 }] }),
            ...(placement === 'right' && { left: '100%', marginLeft: 8, top: '50%', transform: [{ translateY: -50 }] }),
            pointerEvents: 'none',
          }}
        >
          <Text className="text-white text-xs" style={{ maxWidth: 200 }}>
            {text.split('\n').map((line, index) => (
              <Text key={index}>
                {line}
                {index < text.split('\n').length - 1 && '\n'}
              </Text>
            ))}
          </Text>
          {/* Arrow */}
          <View
            className="absolute bg-gray-900/90 dark:bg-black/90"
            style={{
              width: 6,
              height: 6,
              ...(placement === 'top' && { bottom: -3, left: '50%', transform: [{ translateX: -3 }, { rotate: '45deg' }] }),
              ...(placement === 'bottom' && { top: -3, left: '50%', transform: [{ translateX: -3 }, { rotate: '45deg' }] }),
              ...(placement === 'left' && { right: -3, top: '50%', transform: [{ translateY: -3 }, { rotate: '45deg' }] }),
              ...(placement === 'right' && { left: -3, top: '50%', transform: [{ translateY: -3 }, { rotate: '45deg' }] }),
            }}
          />
        </View>
      )}
    </View>
  );
};

export default Tooltip;

