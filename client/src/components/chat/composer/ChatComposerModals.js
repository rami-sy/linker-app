import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import Popup from "../../popup";
import ScheduleDateTimeFields from "./ScheduleDateTimeFields";

export default function ChatComposerModals({
  t,
  isDarkColorScheme,
  schedule,
  callSchedule,
  gif,
  poll,
  sticker,
  stickerPresets,
}) {
  return (
    <>
      {schedule.open && (
        <Popup
          showModal={schedule.open}
          setShowModal={schedule.setOpen}
          withActions={false}
          title={t("chat.scheduleSendAction", {
            defaultValue: "Schedule send",
          })}
          w="w-[90%] max-w-[420px]"
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
                onPress={() => schedule.applyPreset("in1h")}
              >
                <Text className="text-xs text-slate-700 dark:text-slate-200">
                  {t("chat.quickScheduleIn1Hour", { defaultValue: "In 1 hour" })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-3 py-1 rounded-full bg-slate-500/20"
                onPress={() => schedule.applyPreset("tonight")}
              >
                <Text className="text-xs text-slate-700 dark:text-slate-200">
                  {t("chat.quickScheduleTonight", {
                    defaultValue: "Tonight 20:00",
                  })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-3 py-1 rounded-full bg-slate-500/20"
                onPress={() => schedule.applyPreset("tomorrowMorning")}
              >
                <Text className="text-xs text-slate-700 dark:text-slate-200">
                  {t("chat.quickScheduleTomorrowMorning", {
                    defaultValue: "Tomorrow 09:00",
                  })}
                </Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center gap-2 mb-3">
              <ScheduleDateTimeFields
                date={schedule.date}
                setDate={schedule.setDate}
                time={schedule.time}
                setTime={schedule.setTime}
                showNativeDatePicker={schedule.showNativeDatePicker}
                setShowNativeDatePicker={schedule.setShowNativeDatePicker}
                showNativeTimePicker={schedule.showNativeTimePicker}
                setShowNativeTimePicker={schedule.setShowNativeTimePicker}
                isDarkColorScheme={isDarkColorScheme}
              />
            </View>
            <View className="flex-row justify-end items-center gap-3">
              <TouchableOpacity onPress={() => schedule.setOpen(false)}>
                <Text className="text-base text-slate-600 dark:text-slate-300">
                  {t("general.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-4 py-2 rounded-xl bg-chatAccent"
                onPress={schedule.submit}
              >
                <Text className="text-sm font-semibold text-slate-100">
                  {t("chat.scheduleSendAction", {
                    defaultValue: "Schedule send",
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Popup>
      )}

      {callSchedule.open && (
        <Popup
          showModal={callSchedule.open}
          setShowModal={callSchedule.setOpen}
          withActions={false}
          title={t("chat.scheduleCallAction", {
            defaultValue: "Schedule call",
          })}
          w="w-[90%] max-w-[420px]"
        >
          <View className="w-full py-2">
            <Text className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              {t("chat.scheduleCallPickerHint", {
                defaultValue: "Choose date, time and call type.",
              })}
            </Text>
            <View className="flex-row items-center gap-2 mb-3">
              <TouchableOpacity
                className={`px-3 py-1 rounded-full ${
                  callSchedule.video ? "bg-chatAccent/20" : "bg-slate-500/20"
                }`}
                onPress={() => callSchedule.setVideo(true)}
              >
                <Text className="text-xs text-slate-700 dark:text-slate-200">
                  {t("call.videoCall", { defaultValue: "Video call" })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`px-3 py-1 rounded-full ${
                  !callSchedule.video ? "bg-chatAccent/20" : "bg-slate-500/20"
                }`}
                onPress={() => callSchedule.setVideo(false)}
              >
                <Text className="text-xs text-slate-700 dark:text-slate-200">
                  {t("call.audioCall", { defaultValue: "Audio call" })}
                </Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center gap-2 mb-3">
              <ScheduleDateTimeFields
                date={callSchedule.date}
                setDate={callSchedule.setDate}
                time={callSchedule.time}
                setTime={callSchedule.setTime}
                showNativeDatePicker={callSchedule.showNativeDatePicker}
                setShowNativeDatePicker={callSchedule.setShowNativeDatePicker}
                showNativeTimePicker={callSchedule.showNativeTimePicker}
                setShowNativeTimePicker={callSchedule.setShowNativeTimePicker}
                isDarkColorScheme={isDarkColorScheme}
              />
            </View>
            <View className="flex-row justify-end items-center gap-3">
              <TouchableOpacity onPress={() => callSchedule.setOpen(false)}>
                <Text className="text-base text-slate-600 dark:text-slate-300">
                  {t("general.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-4 py-2 rounded-xl bg-chatAccent"
                onPress={callSchedule.submit}
              >
                <Text className="text-sm font-semibold text-slate-100">
                  {t("chat.scheduleCallAction", {
                    defaultValue: "Schedule call",
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Popup>
      )}

      {gif.open && (
        <Popup
          showModal={gif.open}
          setShowModal={gif.setOpen}
          withActions={false}
          title={t("chat.sendGifAction", { defaultValue: "Send GIF" })}
          w="w-[90%] max-w-[420px]"
        >
          <View className="w-full py-2">
            <Text className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              {t("chat.gifModalHint", {
                defaultValue: "Paste a GIF link (http/https).",
              })}
            </Text>
            <TextInput
              value={gif.url}
              onChangeText={gif.setUrl}
              placeholder={t("chat.gifUrlPlaceholder", {
                defaultValue: "https://...",
              })}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
              placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View className="flex-row justify-end items-center gap-3 mt-3">
              <TouchableOpacity onPress={() => gif.setOpen(false)}>
                <Text className="text-base text-slate-600 dark:text-slate-300">
                  {t("general.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-4 py-2 rounded-xl bg-chatAccent"
                onPress={gif.submit}
                disabled={!String(gif.url || "").trim()}
              >
                <Text className="text-sm font-semibold text-slate-100">
                  {t("general.send", { defaultValue: "Send" })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Popup>
      )}

      {poll.open && (
        <Popup
          showModal={poll.open}
          setShowModal={poll.setOpen}
          withActions={false}
          title={t("chat.createPollAction", {
            defaultValue: "Create poll",
          })}
          w="w-[90%] max-w-[460px]"
        >
          <View className="w-full py-2">
            <Text className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              {t("chat.pollModalHint", {
                defaultValue: "Ask a question and add options.",
              })}
            </Text>
            <TextInput
              value={poll.question}
              onChangeText={poll.setQuestion}
              placeholder={t("chat.pollQuestionPlaceholder", {
                defaultValue: "Question",
              })}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 mb-2"
              placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
            />
            <TextInput
              value={poll.optionA}
              onChangeText={poll.setOptionA}
              placeholder={t("chat.pollOptionPlaceholder", {
                defaultValue: "Option {{index}}",
                index: 1,
              })}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 mb-2"
              placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
            />
            <TextInput
              value={poll.optionB}
              onChangeText={poll.setOptionB}
              placeholder={t("chat.pollOptionPlaceholder", {
                defaultValue: "Option {{index}}",
                index: 2,
              })}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 mb-2"
              placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
            />
            <TextInput
              value={poll.optionC}
              onChangeText={poll.setOptionC}
              placeholder={t("chat.pollOptionPlaceholder", {
                defaultValue: "Option {{index}}",
                index: 3,
              })}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 mb-2"
              placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
            />
            <TouchableOpacity
              className="flex-row items-center mb-3"
              onPress={() => poll.setAllowMultiple((prev) => !prev)}
            >
              <View
                className={`w-5 h-5 rounded border mr-2 items-center justify-center ${
                  poll.allowMultiple
                    ? "bg-chatAccent border-chatAccent"
                    : "border-slate-400"
                }`}
              >
                {poll.allowMultiple ? (
                  <Icon name="checkmark" size={14} color="#fff" />
                ) : null}
              </View>
              <Text className="text-sm text-slate-600 dark:text-slate-300">
                {t("chat.pollAllowMultiple", {
                  defaultValue: "Allow multiple selections",
                })}
              </Text>
            </TouchableOpacity>
            <View className="flex-row justify-end items-center gap-3 mt-1">
              <TouchableOpacity onPress={() => poll.setOpen(false)}>
                <Text className="text-base text-slate-600 dark:text-slate-300">
                  {t("general.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-4 py-2 rounded-xl bg-chatAccent"
                onPress={poll.submit}
              >
                <Text className="text-sm font-semibold text-slate-100">
                  {t("chat.createPollAction", {
                    defaultValue: "Create poll",
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Popup>
      )}

      {sticker.open && (
        <Popup
          showModal={sticker.open}
          setShowModal={sticker.setOpen}
          withActions={false}
          title={t("chat.sendStickerAction", {
            defaultValue: "Send sticker",
          })}
          w="w-[90%] max-w-[460px]"
        >
          <View className="w-full py-2">
            <Text className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              {t("chat.stickerModalHint", {
                defaultValue: "Pick a sticker to send.",
              })}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row items-center gap-2 pr-2">
                {stickerPresets.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    className="rounded-xl border border-slate-400/30 bg-slate-500/10 p-2"
                    onPress={() => sticker.submit(item)}
                  >
                    <Image
                      source={{ uri: item.url }}
                      style={{ width: 92, height: 92, resizeMode: "contain" }}
                    />
                    <Text className="text-center text-xs text-slate-500 dark:text-slate-300 mt-1">
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View className="flex-row justify-end items-center gap-3 mt-3">
              <TouchableOpacity onPress={() => sticker.setOpen(false)}>
                <Text className="text-base text-slate-600 dark:text-slate-300">
                  {t("general.cancel")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Popup>
      )}
    </>
  );
}
