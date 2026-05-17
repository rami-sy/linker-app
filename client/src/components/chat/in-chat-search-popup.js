import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";

import Popup from "../popup";
import Input from "../input";
import { useColorScheme } from "~/lib/useColorScheme";

const InChatSearchPopup = ({
  showModal,
  setShowModal,
  roomId,
  emitWithAck,
  onSelectMessageKey,
}) => {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState("all");
  const [mentionsOnly, setMentionsOnly] = useState(false);

  const runSearch = useCallback(
    async (text) => {
      const q = String(text || "").trim();
      if (q.length < 2) {
        setResults([]);
        return;
      }
      if (!roomId || !emitWithAck) return;
      setLoading(true);
      const res = await emitWithAck(
        "searchRoomMessages",
        {
          room: roomId,
          query: q,
          limit: 25,
          type: searchType,
          hasMentions: mentionsOnly ? true : null,
        },
        15000
      );
      setLoading(false);
      if (res?.type === "success" && Array.isArray(res.messages)) {
        setResults(res.messages);
      } else {
        setResults([]);
      }
    },
    [emitWithAck, mentionsOnly, roomId, searchType]
  );

  useEffect(() => {
    if (!showModal) {
      setQuery("");
      setResults([]);
      setLoading(false);
      setSearchType("all");
      setMentionsOnly(false);
      return;
    }
    const timer = setTimeout(() => {
      runSearch(query);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, showModal, runSearch]);

  const formatTime = (createdAt) => {
    if (!createdAt) return "";
    try {
      return new Date(createdAt).toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return "";
    }
  };

  const snippet = (text) => {
    if (!text || typeof text !== "string") return "…";
    const oneLine = text.replace(/\s+/g, " ").trim();
    return oneLine.length > 120 ? `${oneLine.slice(0, 117)}…` : oneLine;
  };

  return (
    <Popup
      showModal={showModal}
      setShowModal={setShowModal}
      withActions={false}
      title={t("chat.searchInChat")}
      subtitle={t("chat.searchInChatHint")}
      w="w-[92%] max-w-[480px]"
    >
      <View className="w-full">
        <Input
          value={query}
          onChange={setQuery}
          placeholder={t("chat.searchPlaceholder")}
          containerStyle="w-full mb-3"
          widthLabel={false}
          autoFocus
        />
        <View className="flex-row items-center flex-wrap gap-2 mb-3">
          {[
            { id: "all", label: t("chat.searchFilterAll", { defaultValue: "All" }) },
            {
              id: "attachments",
              label: t("chat.searchFilterAttachments", { defaultValue: "Attachments" }),
            },
            {
              id: "call_events",
              label: t("chat.searchFilterCalls", { defaultValue: "Call events" }),
            },
          ].map((option) => {
            const active = searchType === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                className={`px-2.5 py-1 rounded-full ${
                  active
                    ? "bg-primary"
                    : isDarkColorScheme
                      ? "bg-slate-700"
                      : "bg-slate-200"
                }`}
                onPress={() => setSearchType(option.id)}
              >
                <Text
                  className={`text-xs ${
                    active ? "text-white" : isDarkColorScheme ? "text-slate-100" : "text-slate-800"
                  }`}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            className={`px-2.5 py-1 rounded-full ${
              mentionsOnly
                ? "bg-primary"
                : isDarkColorScheme
                  ? "bg-slate-700"
                  : "bg-slate-200"
            }`}
            onPress={() => setMentionsOnly((prev) => !prev)}
          >
            <Text
              className={`text-xs ${
                mentionsOnly
                  ? "text-white"
                  : isDarkColorScheme
                    ? "text-slate-100"
                    : "text-slate-800"
              }`}
            >
              {t("chat.searchFilterMentions", { defaultValue: "Mentions" })}
            </Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <View className="py-6 items-center justify-center">
            <ActivityIndicator
              size="small"
              color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
            />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item, index) =>
              String(item?.uuId || item?._id || index)
            }
            style={{ maxHeight: 320 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              query.trim().length >= 2 ? (
                <Text className="text-sm text-placehoder dark:text-papaya py-2 text-center">
                  {t("chat.searchNoResults")}
                </Text>
              ) : (
                <Text className="text-sm text-placehoder dark:text-papaya py-2 text-center">
                  {t("chat.searchMinChars")}
                </Text>
              )
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                className="py-2 border-b border-slate-200 dark:border-slate-600"
                onPress={() => {
                  const key = item?.uuId || item?._id;
                  if (key && onSelectMessageKey) {
                    onSelectMessageKey(key);
                  }
                  setShowModal(false);
                }}
              >
                <Text
                  className="text-xs text-placehoder dark:text-papaya mb-1"
                  numberOfLines={1}
                >
                  {formatTime(item?.createdAt)}
                </Text>
                <Text
                  className="text-sm text-slate-800 dark:text-slate-100"
                  numberOfLines={3}
                >
                  {snippet(item?.text)}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Popup>
  );
};

export default InChatSearchPopup;
