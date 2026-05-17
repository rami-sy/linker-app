import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useColorScheme } from "~/lib/useColorScheme";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { ProfileGlyph } from "../profile/profile-icon-map";

const MenuButton = React.memo(
  ({
    IconName,
    buttonText,
    navigationLink,
    children,
    h = "h-14",
    m = "mb-2",
    onPress,
    rounded = "rounded-2xl",
    hide = false,
    size = 32,
    rightIcon,
    isRTL,
    lastChild,
    isParent = true,
    iconColor,
    iconBg,
    iconWeight = "duotone",
  }) => {
    const [showChildren, setShowChildren] = useState(false);
    const [accordionState, setAccordionState] = useState("closed");
    const { isDarkColorScheme } = useColorScheme();
    let currentColor = isDarkColorScheme ? "#dee4e6" : "#2D2D37";
    
    // Animation values
    const rotate = useSharedValue(0);
    const childrenHeight = useSharedValue(0);
    const childrenOpacity = useSharedValue(0);
    
    // Animated styles
    
    const animatedChevronStyle = useAnimatedStyle(() => {
      return {
        transform: [{ rotate: `${rotate.value}deg` }],
      };
    });
    
    const animatedChildrenStyle = useAnimatedStyle(() => {
      return {
        height: childrenHeight.value,
        opacity: childrenOpacity.value,
      };
    });
    
    React.useEffect(() => {
      if (!children?.length) return;

      if (showChildren) {
        setAccordionState("opening");
        rotate.value = withSpring(180);
        childrenOpacity.value = withTiming(1, { duration: 300 });
        childrenHeight.value = withTiming(
          children.length * 48,
          { duration: 300 },
          (finished) => {
            if (finished) {
              runOnJS(setAccordionState)("open");
            }
          }
        );
      } else {
        setAccordionState("closing");
        rotate.value = withSpring(0);
        childrenOpacity.value = withTiming(0, { duration: 200 });
        childrenHeight.value = withTiming(0, { duration: 300 }, (finished) => {
          if (finished) {
            runOnJS(setAccordionState)("closed");
          }
        });
      }
    }, [showChildren, children?.length]);
    
    const handlePress = useCallback(() => {
      if (navigationLink) {
        router.push(navigationLink);
      } else if (onPress) {
        onPress();
      } else {
        setShowChildren((prev) => !prev);
      }
    }, [navigationLink, onPress]);
    
    const subMenuIconOffsetStyle = !isParent
      ? isRTL
        ? { marginRight: 8 }
        : { marginLeft: 8 }
      : null;
    const hasChildren = Array.isArray(children) && children.length > 0;

    return (
      !hide && (
        <View className={`flex flex-col ${m} w-full`}>
          <TouchableOpacity
              className={`flex-row items-center ${h} justify-between w-full px-4 py-3 ${
                accordionState !== "closed" ? "rounded-b-none" : ""
              } ${rounded}`}
              style={{
                backgroundColor: isDarkColorScheme ? "#171b25" : "#f8fafb",
                shadowColor: "#000",
                shadowOffset: {
                  width: 0,
                  height: 4,
                },
                shadowOpacity: isDarkColorScheme ? 0.18 : 0.1,
                shadowRadius: 8,
                elevation: 4,
                borderBottomRightRadius:
                  (accordionState === "closed" && hasChildren) ||
                  lastChild ||
                  (isParent && !hasChildren)
                    ? 16
                    : 0,
                borderBottomLeftRadius:
                  (accordionState === "closed" && hasChildren) ||
                  lastChild ||
                  (isParent && !hasChildren)
                    ? 16
                    : 0,
              }}
              activeOpacity={0.7}
              onPress={handlePress}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={buttonText || "Menu item"}
              accessibilityState={hasChildren ? { expanded: !!showChildren } : {}}
              accessibilityHint={
                hasChildren
                  ? showChildren
                    ? "Double tap to collapse submenu"
                    : "Double tap to expand submenu"
                  : undefined
              }
            >
              <View className={`flex-row items-center gap-x-3 flex-1`}>
                <View
                  className="flex items-center justify-center w-10 h-10 rounded-xl"
                  style={{
                    backgroundColor:
                      iconBg || (isDarkColorScheme ? "#252833" : "#f0f4f6"),
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 2,
                    ...(subMenuIconOffsetStyle || {}),
                  }}
                >
                  {typeof IconName === "string" ? (
                    <ProfileGlyph
                      name={IconName}
                      color={iconColor || currentColor}
                      size={size * 0.9}
                      weight={iconWeight}
                    />
                  ) : IconName ? (
                    <IconName />
                  ) : (
                    null
                  )}
                </View>
                <Text
                  className="text-base font-semibold flex-1 text-slate-800 dark:text-slate-100"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {buttonText}
                </Text>
              </View>
              {hasChildren && (
                <Animated.View style={animatedChevronStyle}>
                  <ProfileGlyph
                    name={
                      showChildren
                        ? "chevron-down"
                        : isRTL
                        ? "chevron-left"
                        : "chevron-right"
                    }
                    size={22}
                    color={isDarkColorScheme ? "#9ca3af" : "#6b7280"}
                    weight="bold"
                  />
                </Animated.View>
              )}

              {rightIcon?.show && (
                <ProfileGlyph
                  name={rightIcon.name}
                  size={22}
                  color={rightIcon.color}
                  weight="bold"
                />
              )}
            </TouchableOpacity>
          {hasChildren && (
            <Animated.View 
              style={[animatedChildrenStyle, { overflow: 'hidden' }]}
              className="w-full"
            >
              <View className={`w-full`}>
                {children.map((child, index) => (
                  <MenuButton
                    isRTL={isRTL}
                    key={`${child.navigationLink || child.buttonText || "child"}-${index}`}
                    IconName={child.IconName}
                    buttonText={child.buttonText}
                    navigationLink={child.navigationLink}
                    onPress={child.onPress}
                    h={"h-12"}
                    m="mb-0"
                    size={24}
                    hide={child.hide}
                    rounded={
                      index === children.length - 1
                        ? "rounded-b-2xl"
                        : "rounded-none"
                    }
                    lastChild={index === children.length - 1}
                    rightIcon={child?.rightIcon}
                    isParent={false}
                    iconColor={child?.iconColor}
                    iconBg={child?.iconBg}
                    iconWeight={child?.iconWeight}
                  />
                ))}
              </View>
            </Animated.View>
          )}
        </View>
      )
    );
  }
);

export default MenuButton;
