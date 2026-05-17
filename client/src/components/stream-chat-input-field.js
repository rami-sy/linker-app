import React from "react";
import { View, TextInput, TouchableOpacity, Platform } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useColorScheme } from "~/lib/useColorScheme";

/**
 * ✅ Reusable Stream Chat Input Field Component
 * Used for both viewers and broadcasters in live streams
 */
const StreamChatInputField = ({
  value,
  onChangeText,
  onSend,
  placeholder = "Type a message",
  disabled = false,
  isSending = false,
  onFocus,
  onSubmitEditing,
}) => {
  const { isDarkColorScheme } = useColorScheme();

  return (
    <View className="flex-row items-end justify-between w-full">
      <View className="relative flex-1 mr-3">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={isDarkColorScheme ? "#EDF6F9" : "#023047"}
          style={{
            minHeight: 48,
            height: 48,
          }}
          className={`p-3 pr-16 text-papaya rounded-3xl ${
            isDarkColorScheme
              ? "bg-placehoder text-papaya"
              : "bg-papaya text-placehoder"
          } `}
          onFocus={onFocus}
          onSubmitEditing={onSubmitEditing || onSend}
          returnKeyType="send"
          multiline={true}
          showsVerticalScrollIndicator={false}
          editable={!disabled}
          keyboardType="default"
        />
      </View>

      {/* Send Button */}
      <TouchableOpacity
        className="w-12 h-12 rounded-full bg-[#0a97b9] items-center justify-center"
        onPress={onSend}
        disabled={disabled || !value?.trim() || isSending}
        style={{
          opacity: disabled || !value?.trim() || isSending ? 0.5 : 1,
        }}
      >
        <Icon
          name={isSending ? "hourglass" : "send"}
          size={25}
          color="#dee4e6"
        />
      </TouchableOpacity>
    </View>
  );
};

export default StreamChatInputField;

