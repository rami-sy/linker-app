import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

import Popup from "../popup";
import { useTranslation } from "react-i18next";
import { addAlert } from "../../redux/alertSlice";
const ClearChatPopup = ({
  showModal,
  setShowModal,
  room,
  user,
  socket,
  dispatch,
  t,
}) => {
  return (
    <Popup
      showModal={showModal}
      setShowModal={setShowModal}
      justify="justify-center"
      items="items-center"
      title={t("header.clearChat") || "Clear Chat"}
      onClick={() => {
        if (socket) {
          socket.emit("clearChat", {
            room: room?._id,
          });
          dispatch(
            addAlert({ message: t("header.clearChat"), type: "success" })
          );
        } else {
          dispatch(
            addAlert({ message: t("general.connectionError"), type: "error" })
          );
        }

        setShowModal(false);
      }}
      onCancel={() => {
        setShowModal(false);
      }}
    >
      <Text className="text-base text-center text-placehoder dark:text-papaya">
        {t("header.confirmClearChat")}
      </Text>
    </Popup>
  );
};

export default ClearChatPopup;
