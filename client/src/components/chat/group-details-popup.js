import React, { useContext, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  I18nManager,
  ScrollView,
  useWindowDimensions,
} from "react-native";

import Popup from "../popup";
import Button from "../button";
import FeIcon from "react-native-vector-icons/Feather";
import ImagePlaceholder from "../image-placeholder";
import UserImage from "../user-image";
import Input from "../input";
import { useTranslation } from "react-i18next";
import { SocketContext } from "../../contexts/socket.context";
import { useSelector } from "react-redux";
import GroupDetailsItem from "./group-details-item";
import { router } from "expo-router";
import { getLocales } from "expo-localization";
import UserInteractiveIcon from "../user/user-interactive-icon";
import { useColorScheme } from "../../../lib/useColorScheme";
import AlertBox from "../alert-box";
import { isRoomOwner } from "../../utils/permissions";

const GroupDetailsPopup = ({
  showModal,
  setShowModal,
  room,
  user,
  setAddMember,
  setGroupDetailsModal,
  setReturnToGroupDetails,
  dispatch,
  setShowConfirmRole,
  setShowDeleteMember,
  setSelectedMember,
  setWasGroupDetailsModalOpen,
  onCreateRoomWithMember,
}) => {
  const { t } = useTranslation();
  const { socket } = useContext(SocketContext);
  // Check if current user is the room owner
  const isOwner = isRoomOwner(user?._id, room);
  const isAdmin = room?.roles?.some(
    (role) => role.user === user._id && role.role === "admin"
  );
  const isModerator = room?.roles?.some(
    (role) => role.user === user._id && role.role === "moderator"
  );
  const { prevScreens } = useSelector((state) => state.app);
  const { isDarkColorScheme } = useColorScheme();
  const { height: screenHeight } = useWindowDimensions();
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

  return (
    <>
      <Popup
        showModal={showModal}
        setShowModal={setShowModal}
        withActions={false}
        justify="justify-start"
        items="items-start"
        pt="pt-0"
        p="p-0"
        withCloseButton={true}
        title={t("general.members") || "Members"}
        w="w-[95%] md:w-[85%] lg:w-[500px]"
        opacity="75"
      >
        <ScrollView
          className="flex-1 w-full"
          contentContainerStyle={{ padding: 16 }}
          style={{ maxHeight: screenHeight * 0.6 }}
          showsVerticalScrollIndicator={false}
        >
          {room?.description ? (
            <View className="mb-4 rounded-xl px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("general.description") || "Description"}
              </Text>
              <Text className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                {room.description}
              </Text>
            </View>
          ) : null}
          {/* Members List */}
          <View className="mb-4">
            {([user, ...room?.members] || []).map((item) => (
              <View key={item?._id?.toString()} className="mb-3">
                <GroupDetailsItem
                  item={item}
                  room={room}
                  socket={socket}
                  user={user}
                  dispatch={dispatch}
                  setShowModal={setShowModal}
                  isOwner={isOwner}
                  isAdmin={isAdmin}
                  isModerator={isModerator}
                  t={t}
                  setSelectedMember={setSelectedMember}
                  setShowConfirmRole={setShowConfirmRole}
                  setShowDeleteMember={setShowDeleteMember}
                  setGroupDetailsModal={setGroupDetailsModal}
                  setWasGroupDetailsModalOpen={setWasGroupDetailsModalOpen}
                  onCreateRoomWithMember={onCreateRoomWithMember}
                />
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Add Member Button (if owner/admin/moderator) */}
        {(isOwner || isAdmin || isModerator) && (
          <View className="w-full pt-4 pb-3 px-4">
            <Button
              label={t("header.addMember")}
              onPress={() => {
                setAddMember(true);
                setGroupDetailsModal(false);
                setReturnToGroupDetails(true);
              }}
              w="w-full"
              mb="mb-0"
            />
          </View>
        )}
      </Popup>
    </>
  );
};

export default GroupDetailsPopup;
