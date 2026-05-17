import React, { useRef, useState } from 'react';
import { View, TouchableOpacity, I18nManager, Text, ScrollView, Pressable, Dimensions } from 'react-native';
import Modal from './modal';
import { useColorScheme } from '~/lib/useColorScheme';
import FeIcon from 'react-native-vector-icons/Feather';

/**
 * ContextMenu
 * Menu positioned relative to trigger element with smart placement
 * props:
 *  - options: [{ name, onPress, icon, hide, submenu }]
 *  - placement: 'top' | 'bottom' | 'left' | 'right' (default: 'bottom')
 *  - width: number (px)
 *  - offset: number (px)
 *  - submenu: [{ name, onPress, icon, selected }] - for nested menus
 */
const ContextMenu = ({
  children,
  options = [],
  placement = 'bottom',
  width = 220,
  offset = 8,
  px = 'px-2',
  menuClassName = '',
  menuStyle,
  itemClassName = '',
  itemStyle,
  renderItem,
  onOpen,
  onClose,
  disabled = false, // ✅ New prop to disable the menu
}) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [menuH, setMenuH] = useState(0);
  const [menuW, setMenuW] = useState(0);
  const [activeSubmenu, setActiveSubmenu] = useState(null); // Track which submenu is open
  const [submenuCoords, setSubmenuCoords] = useState({ x: 0, y: 0, position: 'right' });
  const ref = useRef(null);
  const submenuRefs = useRef({});
  const { isDarkColorScheme } = useColorScheme();
  const isRTL = I18nManager.isRTL;
  
  // Get screen dimensions
  const getScreenDimensions = () => {
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    return { screenWidth, screenHeight };
  };

  const open = () => {
    if (disabled) return; // ✅ Don't open if disabled
    if (!ref.current) return;
    // measureInWindow works better on web/native
    if (ref.current.measureInWindow) {
      ref.current.measureInWindow((x, y, w, h) => {
        setCoords({ x, y, w, h });
        setVisible(true);
        setActiveSubmenu(null); // Reset submenu when opening main menu
        onOpen?.();
      });
    } else {
      ref.current.measure((x, y, w, h, pageX, pageY) => {
        setCoords({ x: pageX, y: pageY, w, h });
        setVisible(true);
        setActiveSubmenu(null); // Reset submenu when opening main menu
        onOpen?.();
      });
    }
  };

  React.useEffect(() => {
    if (!visible || typeof window === 'undefined') return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (activeSubmenu !== null) {
        setActiveSubmenu(null);
        return;
      }
      setVisible(false);
      onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, activeSubmenu, onClose]);

  const openSubmenu = (index, item) => {
    if (!item.submenu || !submenuRefs.current[index]) return;
    
    submenuRefs.current[index].measureInWindow((x, y, w, h) => {
      const { screenWidth } = getScreenDimensions();
      const submenuWidth = width;
      const padding = 8;
      
      // Check if submenu fits on the right
      const rightSpace = screenWidth - (x + w) - padding;
      const leftSpace = x - padding;
      
      // Determine submenu position: right if enough space, otherwise left
      const shouldShowOnRight = rightSpace >= submenuWidth;
      const submenuX = shouldShowOnRight ? x + w + 4 : x - submenuWidth - 4;
      
      setSubmenuCoords({ 
        x: submenuX, 
        y,
        position: shouldShowOnRight ? 'right' : 'left'
      });
      setActiveSubmenu(index);
    });
  };

  const closeSubmenu = () => {
    setActiveSubmenu(null);
  };

  const computeStyle = () => {
    const { screenWidth, screenHeight } = getScreenDimensions();
    const padding = 8; // Minimum padding from screen edges
    const maxAllowedWidth = screenWidth - (padding * 2);
    const actualMenuWidth = Math.min(menuW || width, maxAllowedWidth);
    const actualMenuHeight = menuH || 200; // fallback height
    const centerX = coords.x + coords.w / 2;
    const styles = { 
      position: 'absolute', 
      width: actualMenuWidth,
      maxWidth: maxAllowedWidth,
    };
    
    let top = 0;
    let left = 0;
    
    switch (placement) {
      case 'top':
        top = coords.y - actualMenuHeight - offset;
        left = centerX - actualMenuWidth / 2;
        break;
      case 'left':
        top = coords.y;
        left = coords.x - actualMenuWidth - offset;
        break;
      case 'right':
        top = coords.y;
        left = coords.x + coords.w + offset;
        break;
      case 'bottom':
      default:
        top = coords.y + coords.h + offset;
        left = centerX - actualMenuWidth / 2;
        break;
    }
    
    // ✅ Ensure menu doesn't go off-screen horizontally
    if (left < padding) {
      left = padding;
    } else if (left + actualMenuWidth > screenWidth - padding) {
      left = screenWidth - actualMenuWidth - padding;
    }
    
    // ✅ Ensure menu doesn't go off-screen vertically
    if (top < padding) {
      // If top placement doesn't fit, try bottom
      if (placement === 'top') {
        top = coords.y + coords.h + offset;
      } else {
        top = padding;
      }
    } else if (top + actualMenuHeight > screenHeight - padding) {
      // If bottom placement doesn't fit, try top
      if (placement === 'bottom') {
        top = coords.y - actualMenuHeight - offset;
        // If still doesn't fit, align to bottom of screen
        if (top < padding) {
          top = screenHeight - actualMenuHeight - padding;
        }
      } else {
        top = screenHeight - actualMenuHeight - padding;
      }
    }
    
    styles.top = Math.max(padding, top);
    styles.left = Math.max(padding, Math.min(left, screenWidth - actualMenuWidth - padding));
    
    if (isRTL) {
      // RTL adjustment: mirror the left position
      styles.right = screenWidth - styles.left - actualMenuWidth;
      styles.left = undefined;
    }
    
    return styles;
  };

  return (
    <View>
      <Pressable 
        ref={ref}
        onPress={open}
      >
        {children}
      </Pressable>
      {visible && options?.length ? (
        <Modal 
          showModal={visible} 
          setShowModal={(val) => {
            setVisible(val);
            if (!val) onClose?.();
          }} 
          opacity="0" 
          animationType="fade"
        >
          <View
            className={`rounded-xl py-2 ${px} shadow-md backdrop-blur-md bg-[#f6f8f9] dark:bg-sec ${menuClassName}`}
            onLayout={(e) => {
              setMenuH(e.nativeEvent.layout.height);
              setMenuW(e.nativeEvent.layout.width);
            }}
            style={{ 
              ...computeStyle(), 
              ...(menuStyle || {}),
            }}
          >
            {options
              .filter((o) => !o.hide)
              .map((o, idx) => {
                const hasSubmenu = o.submenu && Array.isArray(o.submenu) && o.submenu.length > 0;
                const isSubmenuOpen = activeSubmenu === idx;
                
                return renderItem ? (
                  <View key={idx}>
                    {renderItem({ option: o, close: () => {
                      setVisible(false);
                      onClose?.();
                    }})}
                  </View>
                ) : (
                  <View key={idx} style={{ position: 'relative' }}>
                    <TouchableOpacity
                      ref={(r) => { if (r) submenuRefs.current[idx] = r; }}
                      className={`flex-row items-center justify-between p-2 gap-x-2 ${itemClassName} ${o.className || ''} ${isSubmenuOpen ? 'bg-slate-200 dark:bg-slate-700' : ''}`}
                      style={{ 
                        ...(itemStyle || {}), 
                        ...(o.style || {}),
                      }}
                      onPress={() => {
                        if (hasSubmenu) {
                          openSubmenu(idx, o);
                        } else {
                          // Close any open submenu when clicking a main menu item
                          if (activeSubmenu !== null) {
                            setActiveSubmenu(null);
                          }
                          try { 
                            o.onPress?.(); 
                          } finally { 
                            // Only close main menu if keepOpen is not true
                            if (!o.keepOpen) {
                              setVisible(false);
                              setActiveSubmenu(null);
                              onClose?.();
                            }
                          }
                        }
                      }}
                      onMouseEnter={() => {
                        if (hasSubmenu) {
                          openSubmenu(idx, o);
                        }
                      }}
                    >
                      <View className="flex-row items-center gap-x-2 flex-1">
                        {o.icon || null}
                        {o.name ? (
                          <Text 
                            numberOfLines={1}
                            className="flex-1 text-placeholder dark:text-papaya"
                          >
                            {o.name}
                          </Text>
                        ) : null}
                      </View>
                      <View className="flex-row items-center gap-x-1">
                        {hasSubmenu && (
                          <FeIcon 
                            name="chevron-right" 
                            size={14} 
                            color={isDarkColorScheme ? '#94a3b8' : '#64748b'}
                          />
                        )}
                        {o.selected !== undefined && (
                          <View className={`w-2 h-2 rounded-full ${o.selected ? 'bg-primary' : 'bg-transparent'}`} />
                        )}
                      </View>
                    </TouchableOpacity>
                    
                    {/* Submenu */}
                    {hasSubmenu && isSubmenuOpen && (
                      <View
                        className={`absolute rounded-xl py-2 ${px} shadow-lg backdrop-blur-md z-50 bg-[#f6f8f9] dark:bg-sec`}
                        style={{
                          ...(submenuCoords.position === 'right' 
                            ? { left: width + 4 }
                            : { right: width + 4 }
                          ),
                          top: 0,
                          width: width,
                          maxHeight: 300,
                        }}
                      >
                        <ScrollView showsVerticalScrollIndicator={false}>
                          {o.submenu.map((subItem, subIdx) => (
                            <TouchableOpacity
                              key={subIdx}
                              disabled={subItem.disabled}
                              className={`flex-row items-center justify-between p-2 gap-x-2 ${itemClassName} ${subItem.className || ''} ${subItem.selected ? 'bg-slate-200 dark:bg-slate-700' : ''} ${subItem.disabled ? 'opacity-50' : ''}`}
                              style={{
                              }}
                              onPress={() => {
                                if (subItem.disabled) return;
                                try { 
                                  subItem.onPress?.(); 
                                } finally { 
                                  // For submenu items, keep submenu open by default
                                  // Only close if explicitly set to false
                                  if (subItem.keepOpen === false) {
                                    setActiveSubmenu(null);
                                    setVisible(false);
                                    onClose?.();
                                  }
                                  // If keepOpen is true or undefined, keep submenu open (do nothing)
                                }
                              }}
                            >
                              {subItem.icon || null}
                              {subItem.name ? (
                                <Text 
                                  numberOfLines={1}
                                  className="flex-1 text-placeholder dark:text-papaya"
                                >
                                  {subItem.name}
                                </Text>
                              ) : null}
                              {subItem.selected !== undefined && (
                                <View className={`w-2 h-2 rounded-full ${subItem.selected ? 'bg-primary' : 'bg-transparent'}`} />
                              )}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                );
              })}
          </View>
        </Modal>
      ) : null}
    </View>
  );
};

export default ContextMenu;


