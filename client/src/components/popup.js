import React, { useCallback, useRef, useEffect } from "react";
import { View, TouchableOpacity, Text, useWindowDimensions, Animated } from "react-native";
import Modal from "./modal";
import { useTranslation } from "react-i18next";
import FeIcon from "@expo/vector-icons/Feather";
import { useColorScheme } from "~/lib/useColorScheme";

export const ActionButton = ({ label, color, onPress, variant = "default", disabled = false }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (!disabled) {
      onPress?.();
    }
  };

  const isPrimary = variant === "primary";
  const buttonStyle = {
    backgroundColor: disabled 
      ? (isPrimary ? "#9ca3af" : "transparent")
      : (isPrimary ? color : "transparent"),
    borderWidth: isPrimary ? 0 : 1.5,
    borderColor: disabled ? "#9ca3af" : color,
    opacity: disabled ? 0.6 : 1,
  };

  const textColor = isPrimary 
    ? "#f6f8f9" 
    : (disabled ? "#9ca3af" : color);

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
      }}
    >
  <TouchableOpacity
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={{
          ...buttonStyle,
          marginHorizontal: 8,
          minWidth: 100,
          height: 44,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 20,
        }}
        activeOpacity={0.8}
      >
        <Text
    style={{
            color: textColor,
            fontSize: 15,
            fontWeight: "600",
    }}
  >
          {label}
        </Text>
  </TouchableOpacity>
    </Animated.View>
);
};

const Popup = ({
  showModal,
  setShowModal,
  children,
  onClick,
  onCancel,
  withActions = true,
  h = "h-auto",
  items = "items-center",
  justify = "justify-center",
  pt = "pt-4",
  p = "p-3",
  w = "w-11/12",
  rounded = "rounded-2xl",
  z = "z-10",
  withCloseButton = true,
  swithColor = false,
  opacity = "75",
  title,
  confirmLabel,
  cancelLabel,
  confirmColor,
  cancelColor,
  confirmVariant = "primary",
  cancelVariant = "outline",
  onClose,
  closeOnBackdrop = true,
  closeIconName = "x",
  /** Optional line under title (e.g. helper text); string or custom node */
  subtitle,
  minDialogWidth,
  maxDialogWidth,
  dialogWidthFraction = 0.9,
}) => {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [internalVisible, setInternalVisible] = React.useState(false);

  // Handle modal visibility with smooth fade animations
  useEffect(() => {
    if (showModal) {
      // Opening: show modal immediately, then fade in
      setInternalVisible(true);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (internalVisible) {
      // Closing: fade out, then hide modal
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setInternalVisible(false);
        // Reset animations for next open
        fadeAnim.setValue(0);
        backdropAnim.setValue(0);
      });
    }
  }, [showModal]);

  const handleConfirm = useCallback(() => {
    onClick?.();
    // Always close the modal after onClick, even if onClick is provided
    if (setShowModal) {
      setShowModal(false);
    }
    onClose?.();
  }, [onClick, setShowModal, onClose]);

  const handleDismiss = useCallback(() => {
    onCancel?.();
    if (setShowModal) {
      setShowModal(false);
    }
    onClose?.();
  }, [onCancel, setShowModal, onClose]);

  const handleClose = useCallback(() => {
    if (setShowModal) {
      setShowModal(false);
    }
    onCancel?.();
    onClose?.();
  }, [setShowModal, onCancel, onClose]);

  // Calculate width based on w prop
  const capMax = maxDialogWidth ?? 600;
  const capMin = minDialogWidth ?? 300;

  const getWidthStyle = () => {
    if (w === "w-11/12") {
      return {
        width: "auto",
        maxWidth: Math.min(capMax, screenWidth * dialogWidthFraction),
        minWidth: capMin,
        paddingHorizontal: 20,
      };
    }

    // Handle custom width like w-[95%] or w-[600px] or responsive w-[95%] md:w-[85%] lg:w-[600px]
    const widthMatch = w.match(/w-\[([^\]]+)\]/);
    if (widthMatch) {
      const widthValue = widthMatch[1];
      // For responsive, use the first (mobile) width
      const baseWidth = widthValue.split(" ")[0];

      if (baseWidth.includes("px")) {
        return {
          width: parseInt(baseWidth),
          maxWidth: Math.min(capMax, parseInt(baseWidth)),
        };
      } else if (baseWidth.includes("%")) {
        return {
          width: baseWidth,
          maxWidth: Math.min(
            capMax,
            screenWidth * (parseFloat(baseWidth) / 100)
          ),
        };
      }
    }

    return {
      width: "auto",
      maxWidth: capMax,
    };
  };

  const widthStyle = getWidthStyle();

  // Default colors based on theme
  const defaultConfirmColor = confirmColor || (swithColor ? "#0a97b9" : "#ef233c");
  const defaultCancelColor = cancelColor || (swithColor ? "#ef233c" : "#0a97b9");

  const bgColor = isDarkColorScheme ? "#12141b" : "#dee4e6"; // Using main dark color from project
  const borderColor = isDarkColorScheme ? "#1e212b" : "#f6f8f9"; // Using sec dark color for border
  const textColor = isDarkColorScheme ? "#f1f5f9" : "#0f172a";

  // Don't render if not visible
  if (!internalVisible && !showModal) {
    return null;
  }

  return (
    <Modal
      showModal={internalVisible}
      setShowModal={setShowModal}
      onCancel={closeOnBackdrop ? handleClose : undefined}
      onClose={onClose}
      opacity="0"
      backdropAnim={backdropAnim}
      backdropOpacity={opacity}
    >
      <Animated.View
        style={{
          opacity: fadeAnim,
          maxHeight: "95vh",
          ...widthStyle,
          alignSelf: "center",
          position: "relative",
          backgroundColor: bgColor,
          borderRadius: 20,
          padding: 20,
          paddingTop: pt === "pt-4" ? 16 : undefined,
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: 10,
          },
          shadowOpacity: 0.3,
          shadowRadius: 20,
          elevation: 10,
          borderWidth: 1,
          borderColor: borderColor,
          zIndex: z === "z-10" ? 10 : (z.includes("z-[") ? parseInt(z.replace("z-[", "").replace("]", "")) : (z.includes("z-") ? parseInt(z.replace("z-", "")) : 10)),
        }}
      >
        {/* Header with Title */}
        {title && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              width: "100%",
              paddingBottom: 16,
              marginBottom: 16,
            }}
          >
            <View style={{ flex: 1, marginRight: 12, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: textColor,
                }}
              >
                {title}
              </Text>
              {subtitle != null && subtitle !== "" && (
                typeof subtitle === "string" ? (
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "400",
                      color: textColor,
                      opacity: 0.78,
                      marginTop: 6,
                    }}
                    numberOfLines={3}
                  >
                    {subtitle}
                  </Text>
                ) : (
                  <View style={{ marginTop: 6 }}>{subtitle}</View>
                )
              )}
            </View>
            {withCloseButton && (
              <TouchableOpacity
                onPress={handleClose}
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: isDarkColorScheme ? "#334155" : "#f1f5f9",
                  marginLeft: 12,
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FeIcon
                  name={closeIconName}
                  size={18}
                  color={textColor}
                />
              </TouchableOpacity>
            )}
          </View>
        )}
        
        {/* Close Button when no title - positioned in top right */}
        {!title && withCloseButton && (
          <View
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 10,
            }}
          >
            <TouchableOpacity
              onPress={handleClose}
              style={{
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: isDarkColorScheme ? "#334155" : "#f1f5f9",
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <FeIcon
                name={closeIconName}
                size={18}
                color={textColor}
              />
            </TouchableOpacity>
          </View>
        )}
        
        {/* Content */}
        <View
          style={{
            paddingTop: title ? 0 : withCloseButton ? 8 : 0,
            // Symmetric horizontal inset so body content (e.g. full-width buttons) stays centered under the close control
            paddingHorizontal: title ? 0 : withCloseButton ? 48 : 0,
            width: "100%",
          }}
        >
          {children}
        </View>

        {/* Action Buttons */}
        {withActions && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 24,
              paddingTop: 20,
            }}
          >
            <ActionButton
              label={cancelLabel || t("general.no")}
              color={defaultCancelColor}
              onPress={handleDismiss}
              variant={cancelVariant}
            />
            <ActionButton
              label={confirmLabel || t("general.yes")}
              color={defaultConfirmColor}
              onPress={handleConfirm}
              variant={confirmVariant}
            />
          </View>
        )}
      </Animated.View>
    </Modal>
  );
};

export default Popup;
