import React from "react";
import { Text } from "react-native";
import Popup from "../../popup";

export default function RemoveMemberConfirmPopup({
  open,
  setOpen,
  t,
  room,
  selectedMember,
  socket,
  dispatch,
  addAlert,
}) {
  return (
    <Popup
      showModal={open}
      setShowModal={setOpen}
      withActions
      justify="justify-center"
      items="items-center"
      title={t("header.removeMember") || "Remove Member"}
      z="z-[100]"
      opacity="90"
      closeOnBackdrop
      onCancel={() => setOpen(false)}
      onClick={() => {
        if (socket && selectedMember) {
          socket.emit("removeMemberFromRoom", {
            room: room?._id,
            member: selectedMember?._id,
          });
        } else {
          dispatch(
            addAlert({
              message: t("general.connectionError"),
              type: "error",
            })
          );
        }
      }}
      confirmLabel={t("general.yes") || "Yes"}
      cancelLabel={t("general.no") || "No"}
      confirmColor="#ef4444"
    >
      <Text className="text-base text-center text-placehoder dark:text-papaya">
        {t("general.removeMemberConfirmation")}
      </Text>
    </Popup>
  );
}
