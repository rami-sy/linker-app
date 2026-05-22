import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import Popup from "../../popup";
import Input from "../../input";
import Button from "../../button";
import ScheduleDateTimeFields from "../composer/ScheduleDateTimeFields";
import {
  toDateInputValue,
  toTimeInputValue,
  parseLocalDateTime,
  schedulePresetTarget,
} from "../../../utils/chatScheduleTime";

export default function RescheduleMessagePopup({
  message,
  setMessage,
  t,
  isDarkColorScheme,
  roomId,
  rescheduleScheduledMessage,
  setScheduledMessages,
  dispatch,
  addAlert,
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [showNativeDatePicker, setShowNativeDatePicker] = useState(false);
  const [showNativeTimePicker, setShowNativeTimePicker] = useState(false);

  React.useEffect(() => {
    if (!message) return;
    const base = message?.scheduledAt
      ? new Date(message.scheduledAt)
      : new Date(Date.now() + 10 * 60 * 1000);
    const safe = Number.isNaN(base.getTime())
      ? new Date(Date.now() + 10 * 60 * 1000)
      : base;
    setDate(toDateInputValue(safe));
    setTime(toTimeInputValue(safe));
  }, [message?._id]);

  const applyPreset = useCallback((preset) => {
    const target = schedulePresetTarget(preset);
    setDate(toDateInputValue(target));
    setTime(toTimeInputValue(target));
  }, []);

  const handleSave = async () => {
    if (!message || !date || !time) return;
    const targetDate = parseLocalDateTime(date, time);
    if (!targetDate) {
      dispatch(
        addAlert({
          type: "error",
          message: t("chat.scheduleSendFailedBody", {
            defaultValue:
              "We could not schedule your message. Please try again.",
          }),
        })
      );
      return;
    }
    if (targetDate.getTime() - Date.now() < 15 * 1000) {
      dispatch(
        addAlert({
          type: "error",
          message: t("chat.scheduleSendTooSoon", {
            defaultValue:
              "Please choose a time at least a few seconds ahead.",
          }),
        })
      );
      return;
    }
    const res = await rescheduleScheduledMessage?.({
      room: roomId,
      messageId: message?._id,
      scheduledAt: targetDate.toISOString(),
    });
    if (res?.type === "success") {
      setScheduledMessages((prev) =>
        (prev || []).map((item) =>
          String(item?._id) === String(message?._id)
            ? { ...item, scheduledAt: targetDate.toISOString() }
            : item
        )
      );
      setMessage(null);
    } else {
      dispatch(
        addAlert({
          type: "error",
          message: res?.message || t("general.somethingWentWrong"),
        })
      );
    }
  };

  if (!message) return null;

  return (
    <Popup
      showModal={!!message}
      setShowModal={(open) => {
        if (!open) setMessage(null);
      }}
      withActions={false}
      title={t("chat.rescheduleScheduledMessage", {
        defaultValue: "Reschedule message",
      })}
      w="w-[90%] max-w-[440px]"
    >
      <View className="w-full py-2">
        <Text className="text-sm text-slate-600 dark:text-slate-300 mb-2">
          {t("chat.scheduleSendPickerHint", {
            defaultValue: "Choose date and time for sending this message.",
          })}
        </Text>
        <View className="flex-row items-center gap-2 mb-3">
          <TouchableOpacity
            className="px-3 py-1 rounded-full bg-slate-500/20"
            onPress={() => applyPreset("in1h")}
          >
            <Text className="text-xs text-slate-700 dark:text-slate-200">
              {t("chat.quickScheduleIn1Hour", { defaultValue: "In 1 hour" })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="px-3 py-1 rounded-full bg-slate-500/20"
            onPress={() => applyPreset("tonight")}
          >
            <Text className="text-xs text-slate-700 dark:text-slate-200">
              {t("chat.quickScheduleTonight", {
                defaultValue: "Tonight 20:00",
              })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="px-3 py-1 rounded-full bg-slate-500/20"
            onPress={() => applyPreset("tomorrowMorning")}
          >
            <Text className="text-xs text-slate-700 dark:text-slate-200">
              {t("chat.quickScheduleTomorrowMorning", {
                defaultValue: "Tomorrow 09:00",
              })}
            </Text>
          </TouchableOpacity>
        </View>
        <View className="flex-row items-center gap-2 mb-4">
          {Platform.OS === "web" ? (
            <>
              <Input
                value={date}
                onChange={setDate}
                placeholder="YYYY-MM-DD"
                containerStyle="flex-1"
                widthLabel={false}
              />
              <Input
                value={time}
                onChange={setTime}
                placeholder="HH:mm"
                containerStyle="w-[120px]"
                widthLabel={false}
              />
            </>
          ) : (
            <ScheduleDateTimeFields
              date={date}
              setDate={setDate}
              time={time}
              setTime={setTime}
              showNativeDatePicker={showNativeDatePicker}
              setShowNativeDatePicker={setShowNativeDatePicker}
              showNativeTimePicker={showNativeTimePicker}
              setShowNativeTimePicker={setShowNativeTimePicker}
              isDarkColorScheme={isDarkColorScheme}
            />
          )}
        </View>
        <View className="flex-row justify-end items-center gap-3">
          <TouchableOpacity onPress={() => setMessage(null)}>
            <Text className="text-base text-slate-600 dark:text-slate-300">
              {t("general.cancel")}
            </Text>
          </TouchableOpacity>
          <Button
            label={t("chat.saveEdit", { defaultValue: "Save" })}
            onPress={handleSave}
          />
        </View>
      </View>
    </Popup>
  );
}
