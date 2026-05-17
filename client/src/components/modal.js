import React from "react";
import { View, Modal as RNModal, TouchableWithoutFeedback, Animated } from "react-native";

const Modal = ({
  showModal,
  setShowModal,
  onCancel,
  children,
  opacity = "75",
  animationType = "slide",
  presentationStyle = null,
  visible, // ✅ دعم visible كـ prop بديل
  onClose, // ✅ دعم onClose كـ prop بديل
  backdropAnim, // ✅ دعم animated backdrop
  backdropOpacity, // ✅ opacity value for animated backdrop
}) => {
  // ✅ استخدام visible إذا كان متوفراً، وإلا showModal
  const isVisible = visible !== undefined ? visible : showModal;
  
  // ✅ دالة للإغلاق مع التحقق من وجود الدوال
  const handleClose = () => {
    if (onCancel) {
      onCancel();
    } else if (onClose) {
      onClose();
    } else if (setShowModal && typeof setShowModal === 'function') {
      setShowModal(false);
    }
  };

  // Convert opacity string to number (e.g., "75" -> 0.75)
  const opacityValue = backdropOpacity 
    ? parseInt(backdropOpacity) / 100 
    : (opacity ? parseInt(opacity) / 100 : 0.75);

  // Container style (always fully visible)
  const containerStyle = {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
  };

  return (
    <RNModal
      visible={isVisible}
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={containerStyle}>
        {/* Animated backdrop layer */}
        {backdropAnim ? (
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: `rgba(0, 0, 0, ${opacityValue})`,
              opacity: backdropAnim,
            }}
          />
        ) : (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: `rgba(0, 0, 0, ${opacityValue})`,
            }}
          />
        )}
        
        {/* Touchable area for closing */}
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        </TouchableWithoutFeedback>
        
        {/* Content (not affected by backdrop opacity) */}
        <TouchableWithoutFeedback
          onPress={(e) => {
            if (e && typeof e.stopPropagation === "function") {
              e.stopPropagation();
            }
          }}
        >
          {children}
        </TouchableWithoutFeedback>
      </View>
    </RNModal>
  );
};

export default Modal;
