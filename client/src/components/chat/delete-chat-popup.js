import React from "react";
import { Text } from "react-native";
import Popup from "../popup";

import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { addAlert } from "../../redux/alertSlice";
import { useColorScheme } from "~/lib/useColorScheme";

const DeleteChatPopup = ({ showModal, setShowModal, room, user, socket }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  return (
    <Popup
      showModal={showModal}
      setShowModal={setShowModal}
      justify="justify-center"
      items="items-center"
      title={t("header.deleteChat") || "Delete Chat"}
      onClick={() => {
        if (socket) {
          socket.emit("deleteChat", {
            room: room?._id,
          });
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
        {t("header.confirmDeleteChat")}
      </Text>
    </Popup>
  );
};

export default DeleteChatPopup;
