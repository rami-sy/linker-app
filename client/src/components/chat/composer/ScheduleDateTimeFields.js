import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  toDateInputValue,
  toTimeInputValue,
} from "../../../utils/chatScheduleTime";

/**
 * Web text inputs or native date/time pickers for schedule modals.
 */
export default function ScheduleDateTimeFields({
  date,
  setDate,
  time,
  setTime,
  showNativeDatePicker,
  setShowNativeDatePicker,
  showNativeTimePicker,
  setShowNativeTimePicker,
  isDarkColorScheme,
}) {
  if (Platform.OS === "web") {
    return (
      <>
        <TextInput
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
          placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
        />
        <TextInput
          value={time}
          onChangeText={setTime}
          placeholder="HH:mm"
          className="w-[110px] rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
          placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
        />
      </>
    );
  }

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-2 mb-2">
        <TouchableOpacity
          className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2"
          onPress={() => setShowNativeDatePicker(true)}
        >
          <Text className="text-slate-900 dark:text-slate-100">
            {date || "YYYY-MM-DD"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="w-[110px] rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2"
          onPress={() => setShowNativeTimePicker(true)}
        >
          <Text className="text-slate-900 dark:text-slate-100">
            {time || "HH:mm"}
          </Text>
        </TouchableOpacity>
      </View>
      {showNativeDatePicker && (
        <DateTimePicker
          mode="date"
          minimumDate={new Date()}
          value={
            new Date(
              `${date || toDateInputValue(new Date())}T${time || "12:00"}:00`
            )
          }
          onChange={(_, selectedDate) => {
            setShowNativeDatePicker(false);
            if (!selectedDate) return;
            setDate(toDateInputValue(selectedDate));
          }}
        />
      )}
      {showNativeTimePicker && (
        <DateTimePicker
          mode="time"
          value={
            new Date(
              `${date || toDateInputValue(new Date())}T${time || "12:00"}:00`
            )
          }
          onChange={(_, selectedDate) => {
            setShowNativeTimePicker(false);
            if (!selectedDate) return;
            setTime(toTimeInputValue(selectedDate));
          }}
        />
      )}
    </View>
  );
}
