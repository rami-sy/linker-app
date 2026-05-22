import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Popup from "../../popup";
import Input from "../../input";
import Button from "../../button";

export default function EditMessagePopup({
  editingMessage,
  setEditingMessage,
  setSelectedMessages,
  t,
  roomId,
  editMessage,
  dispatch,
  addAlert,
}) {
  const [editDraft, setEditDraft] = useState("");

  useEffect(() => {
    if (editingMessage) {
      setEditDraft(editingMessage.text || "");
    } else {
      setEditDraft("");
    }
  }, [editingMessage]);

  if (!editingMessage) return null;

  return (
    <Popup
      showModal={!!editingMessage}
      setShowModal={(open) => {
        if (!open) setEditingMessage(null);
      }}
      withActions={false}
      title={t("chat.editMessageTitle")}
      w="w-[90%] max-w-[440px]"
    >
      <View className="w-full py-2">
        <Input
          value={editDraft}
          onChange={setEditDraft}
          placeholder={t("chat.editMessagePlaceholder")}
          multiline
          numberOfLines={5}
          inputStyle="min-h-[100px]"
          containerStyle="w-full mb-4"
          widthLabel={false}
        />
        <View className="flex-row justify-end items-center gap-3">
          <TouchableOpacity onPress={() => setEditingMessage(null)}>
            <Text className="text-base text-slate-600 dark:text-slate-300">
              {t("general.cancel")}
            </Text>
          </TouchableOpacity>
          <Button
            label={t("chat.saveEdit")}
            onPress={async () => {
              const trimmed = editDraft.trim();
              if (!trimmed || !editingMessage) return;
              const res = await editMessage({
                room: roomId,
                messageId: editingMessage._id,
                uuId: editingMessage.uuId,
                text: trimmed,
                clientVersion: editingMessage.stateVersion,
              });
              if (res?.type === "success") {
                setEditingMessage(null);
                setSelectedMessages([]);
                dispatch(
                  addAlert({
                    type: "success",
                    message: t("chat.messageEditedSuccess"),
                  })
                );
              } else {
                dispatch(
                  addAlert({
                    type: "error",
                    message: res?.message || t("general.somethingWentWrong"),
                  })
                );
              }
            }}
          />
        </View>
      </View>
    </Popup>
  );
}
