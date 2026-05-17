import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

import Popup from "../popup";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";

const DeleteModalPopup = ({
  showModal,
  setShowModal,
  selectedMessages,
  onDeleteMessage,
}) => {
  const { t } = useTranslation();
  const { user } = useSelector((state) => state.users);
  return (
    <Popup
      showModal={showModal}
      setShowModal={setShowModal}
      withActions={false}
      justify="justify-center"
      items="items-center"
      title={t("header.deleteMessages") || "Delete Messages"}
    >
      <Text className="text-base text-center text-placehoder dark:text-papaya mb-4">
        {t("header.confirmDeleteMessages", {
          count: selectedMessages.length,
          plural: selectedMessages.length > 1 ? "s" : "",
        })}
      </Text>

      <View
        className={`flex items-center flex-row justify-center w-full mb-4 gap-x-2`}
      >
        {selectedMessages.every((msg) => msg.user === user._id) && (
          <TouchableOpacity
            className={`items-center justify-center px-3 h-12 bg-sec rounded-2xl`}
            onPress={() => onDeleteMessage(true)}
          >
            <Text className={`text-base text-papaya`}>
              {t("header.deleteForEveryone")}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          className={`items-center justify-center px-3 h-12 bg-sec rounded-2xl`}
          onPress={() => onDeleteMessage(false)}
        >
          <Text className={`text-base text-papaya`}>
            {t("header.deleteForMe")}
          </Text>
        </TouchableOpacity>
      </View>
    </Popup>
  );
};

export default DeleteModalPopup;
