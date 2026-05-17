import React from "react";
import { Text } from "react-native";

import Popup from "../popup";
import { addAlert } from "../../redux/alertSlice";
const BlockUserPopup = ({
  showModal,
  setShowModal,
  youBlockedUser,
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
      title={youBlockedUser ? t("header.unblockUser") || "Unblock User" : t("header.blockUser") || "Block User"}
      onClick={() => {
        if (socket) {
          if (youBlockedUser) {
            socket.emit("blockUser", {
              targetUser: room?.members[0]._id,
              block: false,
              room: room?._id,
            });
            dispatch(
              addAlert({ message: t("header.unblockUser"), type: "success" })
            );
          } else {
            socket.emit("blockUser", {
              targetUser: room?.members[0]._id,
              block: true,
              room: room?._id,
            });
            dispatch(
              addAlert({ message: t("header.blockUser"), type: "success" })
            );
          }
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
        {youBlockedUser ? t("header.confirmUnblock") : t("header.confirmBlock")}
      </Text>
    </Popup>
  );
};

export default BlockUserPopup;
