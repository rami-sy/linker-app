import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import FeIcon from "react-native-vector-icons/Feather";
import Popup from "../../popup";
import { formatFriendlyScheduledAt } from "../../../utils/friendlyScheduledAt";
import {
  findScheduledMessageInRoomMap,
  scheduledMessagePlainBody,
} from "../../../utils/scheduledMessagePreview";

export default function ScheduledMessagesPopup({
  open,
  setOpen,
  t,
  i18n,
  isDarkColorScheme,
  loading,
  scheduledMessages,
  setScheduledMessages,
  e2eePlaintext,
  decryptDone,
  room,
  onReschedule,
  cancelScheduledMessage,
}) {
  if (!open) return null;

  return (
    <Popup
      showModal={open}
      setShowModal={setOpen}
      withActions={false}
      title={t("chat.scheduledMessagesTitle", {
        defaultValue: "Scheduled messages",
      })}
      subtitle={t("chat.scheduledMessagesHint", {
        defaultValue: "Only messages scheduled by you are shown.",
      })}
      w="w-[90%] max-w-[520px]"
    >
      <View className="w-full py-1">
        {loading ? (
          <View className="py-10 items-center justify-center gap-2">
            <ActivityIndicator
              size="small"
              color={isDarkColorScheme ? "#fbbf24" : "#0a97b9"}
            />
            <Text className="text-sm text-slate-500 dark:text-slate-400">
              {t("general.loading", { defaultValue: "Loading..." })}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ maxHeight: 440 }}
            showsVerticalScrollIndicator
            contentContainerStyle={{ paddingBottom: 4 }}
          >
            {(scheduledMessages || []).length === 0 ? (
              <View className="rounded-2xl border border-dashed border-slate-300/80 dark:border-slate-600 bg-chatSurfaceLight dark:bg-chatSurfaceDark px-5 py-10 items-center">
                <View className="w-14 h-14 rounded-full bg-slate-200/80 dark:bg-slate-800 items-center justify-center mb-3">
                  <FeIcon
                    name="clock"
                    size={26}
                    color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                  />
                </View>
                <Text className="text-base font-medium text-slate-700 dark:text-slate-200 text-center">
                  {t("chat.scheduledMessagesEmpty", {
                    defaultValue: "No scheduled messages.",
                  })}
                </Text>
              </View>
            ) : (
              (scheduledMessages || []).map((msg, schedIdx) => {
                const rowKey = String(
                  msg?._id || msg?.uuId || `sched-${schedIdx}`
                );
                const id = msg?._id != null ? String(msg._id) : "";
                const local = findScheduledMessageInRoomMap(
                  msg,
                  room?.messages || {}
                );
                const body =
                  scheduledMessagePlainBody(msg, local) ||
                  (id ? e2eePlaintext[id] : "") ||
                  "";
                const computedBody =
                  body ||
                  (msg?.type === "call_event"
                    ? t("chat.scheduledCallSystemText", {
                        defaultValue: "Scheduled call reminder",
                      })
                    : "");
                const hasCipher = !!msg?.e2ee?.ciphertext;
                const waitingDecrypt =
                  hasCipher && !computedBody && !decryptDone;
                const lockedEncrypted =
                  hasCipher && !computedBody && decryptDone;
                const emptyPlain = !hasCipher && !computedBody;

                const friendlyTime = msg?.scheduledAt
                  ? formatFriendlyScheduledAt(msg.scheduledAt, {
                      t,
                      locale: i18n.language,
                    })
                  : "";
                const timeLine =
                  friendlyTime ||
                  t("chat.scheduledMessageLabel", {
                    defaultValue: "Scheduled",
                  });

                return (
                  <View
                    key={rowKey}
                    className="mb-3.5 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700/85 bg-chatSurfaceLight dark:bg-chatSurfaceDark"
                    style={
                      Platform.OS === "web"
                        ? {
                            boxShadow: isDarkColorScheme
                              ? "0 8px 24px rgba(0,0,0,0.35)"
                              : "0 4px 20px rgba(15,23,42,0.08)",
                          }
                        : undefined
                    }
                  >
                    <View className="px-4 pt-3.5 pb-3">
                      <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                        {t("chat.scheduledListSectionMessage", {
                          defaultValue: "Message",
                        })}
                      </Text>
                      {computedBody ? (
                        <Text
                          className="text-base leading-6 text-slate-900 dark:text-slate-50 break-words"
                          numberOfLines={8}
                        >
                          {computedBody}
                        </Text>
                      ) : waitingDecrypt ? (
                        <View className="flex-row items-center py-2">
                          <ActivityIndicator
                            size="small"
                            color={
                              isDarkColorScheme ? "#fbbf24" : "#0a97b9"
                            }
                          />
                          <Text className="text-sm text-slate-600 dark:text-slate-300 ml-3 flex-1">
                            {t("chat.scheduledMessageDecryptingLabel", {
                              defaultValue: "Unlocking encrypted message…",
                            })}
                          </Text>
                        </View>
                      ) : lockedEncrypted || emptyPlain ? (
                        <Text className="text-sm leading-5 text-slate-500 dark:text-slate-400 italic">
                          {lockedEncrypted
                            ? t("chat.scheduledMessageEncryptedNoPreview", {
                                defaultValue:
                                  "This scheduled message is encrypted and could not be unlocked on this device.",
                              })
                            : t("chat.scheduledMessageEmptyBody", {
                                defaultValue: "No text in this message.",
                              })}
                        </Text>
                      ) : null}
                    </View>

                    <View className="px-4 py-2.5 bg-slate-100/90 dark:bg-slate-900/50 border-t border-slate-200/90 dark:border-slate-700/70">
                      <View className="flex-row items-center flex-wrap">
                        <FeIcon
                          name="clock"
                          size={15}
                          color={isDarkColorScheme ? "#fbbf24" : "#d97706"}
                          style={{ marginRight: 8 }}
                        />
                        <Text className="text-[13px] font-medium text-slate-700 dark:text-amber-100/90 flex-1 min-w-0">
                          {timeLine}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row px-4 pb-3.5 pt-3">
                      <TouchableOpacity
                        className="flex-1 mr-2 py-2.5 px-2 rounded-xl items-center justify-center bg-[#0a97b9]/12 dark:bg-[#0a97b9]/22 border border-[#0a97b9]/35 dark:border-[#22d3ee]/25"
                        onPress={() => onReschedule(msg)}
                        accessibilityRole="button"
                      >
                        <Text
                          className="text-xs font-semibold text-[#067a96] dark:text-sky-300 text-center"
                          numberOfLines={2}
                        >
                          {t("chat.rescheduleScheduledMessage", {
                            defaultValue: "Reschedule",
                          })}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="flex-1 py-2.5 px-2 rounded-xl items-center justify-center bg-red-500/[0.08] dark:bg-red-950/40 border border-red-500/30 dark:border-red-500/35"
                        onPress={async () => {
                          const res = await cancelScheduledMessage?.({
                            room: room._id,
                            messageId: msg?._id,
                          });
                          if (res?.type === "success") {
                            setScheduledMessages((prev) =>
                              (prev || []).filter(
                                (item) =>
                                  String(item?._id) !== String(msg?._id)
                              )
                            );
                          }
                        }}
                        accessibilityRole="button"
                      >
                        <Text
                          className="text-xs font-semibold text-red-600 dark:text-red-400 text-center"
                          numberOfLines={2}
                        >
                          {t("chat.cancelScheduledMessage", {
                            defaultValue: "Cancel",
                          })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </Popup>
  );
}
