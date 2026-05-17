import React from "react";
import { View, Text, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "react-native-vector-icons/Ionicons";
import { useColorScheme } from "../../../lib/useColorScheme";
import Popup from "../popup";
import { UserDisplay } from "../user";
import normalizeMongoId from "../../utils/normalizeMongoId";

/** Same family as message bubbles in message-item.js (Ionicons checkmark / checkmark-done). */
const READ_ICON_SIZE = 22;
const READ_COLOR = "#059669";

export default function MessageReadReceiptsPopup({
  showModal,
  setShowModal,
  message,
  room,
}) {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  if (!message || !room) return null;

  const deliveredIconColor = isDarkColorScheme ? "#94a3b8" : "#64748b";

  const recipients = (message.sentTo || [])
    .map((id) => normalizeMongoId(id))
    .filter((id) => id && id !== normalizeMongoId(message.user));
  const seen = new Set((message.seenBy || []).map((id) => normalizeMongoId(id)));
  const delivered = new Set(
    (message.deliveredTo || []).map((id) => normalizeMongoId(id))
  );

  const read = [];
  const deliveredToUsers = [];
  for (const id of recipients) {
    const member = room.members?.find(
      (m) => normalizeMongoId(m?._id) === normalizeMongoId(id)
    );
    const u = member || { _id: id };
    const sid = normalizeMongoId(id);
    const isRead = seen.has(sid);
    const isDelivered = delivered.has(sid) || isRead; // Read always implies delivered

    if (isRead) {
      read.push(u);
    }
    if (isDelivered) {
      deliveredToUsers.push(u);
    }
  }

  const renderUserRow = (u, keyPrefix, kind) => (
    <UserDisplay
      key={`${keyPrefix}-${String(u._id)}`}
      user={u}
      imageSize="h-10 w-10"
      imageBorder="border-0"
      variant="modal"
      className="mb-2 bg-white dark:bg-slate-800/50 rounded-xl"
      actions={
        kind === "read" ? (
          <Icon
            name="checkmark-done"
            size={READ_ICON_SIZE}
            color={READ_COLOR}
          />
        ) : (
          <Icon
            name="checkmark-done"
            size={READ_ICON_SIZE}
            color={deliveredIconColor}
          />
        )
      }
    />
  );

  return (
    <Popup
      showModal={showModal}
      setShowModal={setShowModal}
      withActions={false}
      title={t("chat.readReceipts")}
      w="w-[90%] max-w-[400px]"
    >
      <ScrollView style={{ maxHeight: 320 }} className="w-full">
        <Text className="text-sm font-semibold mb-2 text-slate-800 dark:text-slate-100">
          {t("chat.readBy")}
        </Text>
        {read.length === 0 ? (
          <Text className="text-placehoder dark:text-papaya text-sm mb-3">
            {t("chat.noneYet")}
          </Text>
        ) : (
          read.map((u) => renderUserRow(u, "read", "read"))
        )}
        <Text className="text-sm font-semibold mb-2 mt-2 text-slate-800 dark:text-slate-100">
          {t("chat.deliveredTo")}
        </Text>
        {deliveredToUsers.length === 0 ? (
          <Text className="text-placehoder dark:text-papaya text-sm">
            {t("chat.noneYet")}
          </Text>
        ) : (
          deliveredToUsers.map((u) => renderUserRow(u, "delivered", "delivered"))
        )}
      </ScrollView>
    </Popup>
  );
}
