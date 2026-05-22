import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import FeIcon from "react-native-vector-icons/Feather";
import Popup from "../../popup";

export default function ChangeRolePopup({
  open,
  setOpen,
  t,
  room,
  user,
  selectedMember,
  selectedNewRole,
  setSelectedNewRole,
  socket,
  dispatch,
  addAlert,
}) {
  return (
    <Popup
      showModal={open}
      setShowModal={(val) => {
        setOpen(val);
        if (!val) setSelectedNewRole(null);
      }}
      withActions
      justify="justify-center"
      items="items-center"
      title={t("header.changeRole") || "Change Role"}
      z="z-[100]"
      opacity="90"
      w="w-[350px]"
      closeOnBackdrop
      onCancel={() => {
        setOpen(false);
        setSelectedNewRole(null);
      }}
      onClick={() => {
        if (socket && selectedMember && selectedNewRole) {
          const currentRole =
            room?.roles?.find(
              (role) => String(role.user) === String(selectedMember._id)
            )?.role || "member";
          if (selectedNewRole !== currentRole) {
            socket.emit("changeUserRole", {
              room: room?._id,
              member: selectedMember?._id,
              newRole: selectedNewRole,
            });
          }
          setSelectedNewRole(null);
        } else if (!selectedNewRole) {
          dispatch(
            addAlert({
              message: t("general.selectRole") || "Please select a role",
              type: "warning",
            })
          );
        } else {
          dispatch(
            addAlert({
              message: t("general.connectionError"),
              type: "error",
            })
          );
        }
      }}
      confirmLabel={t("general.confirm") || "Confirm"}
      cancelLabel={t("general.cancel") || "Cancel"}
      confirmColor="#3b82f6"
    >
      <View className="w-full px-2">
        <Text className="text-sm text-center text-slate-600 dark:text-slate-400 mb-4">
          {t("general.selectNewRole") || "Select new role for"}{" "}
          {selectedMember?.firstName || selectedMember?.userName}
        </Text>
        <View className="gap-y-2">
          {String(room?.user) === String(user?._id) && (
            <RoleOption
              roleKey="admin"
              label={t("general.admin") || "Admin"}
              description={
                t("general.adminDescription") ||
                "Full permissions to manage group"
              }
              selectedNewRole={selectedNewRole}
              onSelect={setSelectedNewRole}
            />
          )}
          <RoleOption
            roleKey="moderator"
            label={t("general.moderator") || "Moderator"}
            description={
              t("general.moderatorDescription") || "Can manage members"
            }
            selectedNewRole={selectedNewRole}
            onSelect={setSelectedNewRole}
          />
          <RoleOption
            roleKey="member"
            label={t("general.member") || "Member"}
            description={
              t("general.memberDescription") || "Basic group permissions"
            }
            selectedNewRole={selectedNewRole}
            onSelect={setSelectedNewRole}
          />
        </View>
        <Text className="text-xs text-center text-slate-400 dark:text-slate-500 mt-3">
          {t("general.currentRole") || "Current role"}:{" "}
          {(() => {
            const currentRole =
              room?.roles?.find(
                (role) => String(role.user) === String(selectedMember?._id)
              )?.role || "member";
            return t(`general.${currentRole}`) || currentRole;
          })()}
        </Text>
      </View>
    </Popup>
  );
}

function RoleOption({ roleKey, label, description, selectedNewRole, onSelect }) {
  const selected = selectedNewRole === roleKey;
  return (
    <TouchableOpacity
      onPress={() => onSelect(roleKey)}
      className={`flex-row items-center p-3 rounded-lg border ${
        selected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
      }`}
    >
      <View
        className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
          selected
            ? "border-blue-500 bg-blue-500"
            : "border-slate-300 dark:border-slate-600"
        }`}
      >
        {selected ? <FeIcon name="check" size={12} color="#fff" /> : null}
      </View>
      <View className="flex-1">
        <Text
          className={`font-medium ${
            selected
              ? "text-blue-600 dark:text-blue-400"
              : "text-slate-700 dark:text-slate-300"
          }`}
        >
          {label}
        </Text>
        <Text className="text-xs text-slate-500 dark:text-slate-400">
          {description}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
