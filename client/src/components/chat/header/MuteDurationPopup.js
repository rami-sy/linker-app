import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Popup from "../../popup";

export default function MuteDurationPopup({
  open,
  setOpen,
  t,
  muteDurations,
  onSelectDuration,
}) {
  return (
    <Popup
      showModal={open}
      setShowModal={setOpen}
      title={t("header.muteDuration") || "Mute notifications"}
      w="w-[320px]"
    >
      <View className="py-2">
        {muteDurations.map((duration, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => onSelectDuration(duration.value)}
            className="py-3 px-4 border-b border-gray-200 dark:border-gray-700"
          >
            <Text className="text-base text-gray-900 dark:text-gray-100">
              {duration.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => setOpen(false)} className="py-3 px-4">
          <Text className="text-base text-gray-500 dark:text-gray-400 text-center">
            {t("header.cancel")}
          </Text>
        </TouchableOpacity>
      </View>
    </Popup>
  );
}
