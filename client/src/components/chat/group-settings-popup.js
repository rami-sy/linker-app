import React, { useState, useContext, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  I18nManager,
  TextInput,
} from "react-native";

import Popup from "../popup";
import FeIcon from "react-native-vector-icons/Feather";
import ImagePlaceholder from "../image-placeholder";
import UserImage from "../user-image";
import Input from "../input";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "../../../lib/useColorScheme";
import { useSelector, useDispatch } from "react-redux";
import { SocketContext } from "../../contexts/socket.context";
import UserCard from "./user-card";
import { clearRoom, setRoom, addRoom } from "../../redux/chatSlice";
import { router } from "expo-router";
import { checkChatPermission, isRoomOwner } from "../../utils/permissions";

const GroupSettingsPopup = ({
  showModal,
  setShowModal,
  room,
  groupName,
  setGroupName,
  setEditeRoom,
  editRoom,
  pickImage,
  handleSaveGroupName,
}) => {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  const isRTL = I18nManager.isRTL;
  const { user } = useSelector((state) => state.users);
  const { rooms } = useSelector((state) => state.chats);
  const { socket } = useContext(SocketContext);
  const dispatch = useDispatch();
  const [description, setDescription] = useState(room?.description ?? "");
  const [editDescription, setEditDescription] = useState(false);

  // Handle message press - create or navigate to chat with room creator
  const handleMessagePress = async (memberItem) => {
    if (!socket) return;
    
    setShowModal(false);
    await dispatch(clearRoom());

    socket.emit(
      "createRoom",
      {
        receiverId: memberItem?._id,
      },
      async (res) => {
        if (res?.type === "success") {
          dispatch(setRoom(res?.data));
          if (!rooms.find((r) => r._id === res?.data._id)) {
            dispatch(addRoom(res?.data));
          }
          router.replace(`/chats/${res?.data?._id}`);
        }
      }
    );
  };

  // Find the room creator
  const roomCreator = useMemo(() => {
    if (!room?.user) return null;
    // Check if current user is the creator
    if (isRoomOwner(user?._id, room)) {
      return user;
    }
    // Find creator in members
    const roomUserId = room.user?._id || room.user;
    return room?.members?.find((member) => String(member._id) === String(roomUserId));
  }, [room?.user, room?.members, user]);

  // Check if current user can edit group info
  const canEditGroupInfo = useMemo(() => {
    if (!room?.isGroup) return false;
    
    // Get the editGroupInfo setting, default to admin if not set
    const editGroupInfoSetting = room?.chatSettings?.editGroupInfo;
    
    // If no setting is configured or empty, default to admin only
    if (!editGroupInfoSetting || editGroupInfoSetting.length === 0) {
      // Owner always can edit
      if (isRoomOwner(user?._id, room)) return true;
      // Check if user is admin
      const userRole = room?.roles?.find(
        r => String(r.user) === String(user?._id) || String(r.user?._id) === String(user?._id)
      );
      return userRole?.role === "admin";
    }
    
    // Use permission check
    return checkChatPermission(user?._id, room, "editGroupInfo", { currentUser: user });
  }, [room, user]);

  const handleSaveDescription = () => {
    if (socket) {
      socket.emit("updateRoom", {
        room: room?._id,
        data: { description: description },
      });
    }
    setEditDescription(false);
  };

  return (
    <Popup
      showModal={showModal}
      setShowModal={setShowModal}
      withActions={false}
      justify="justify-start"
      items="items-start"
      pt="pt-0"
      p="p-0"
      withCloseButton={true}
      title={t("header.groupSettings") || "Group Settings"}
      w="w-[95%] md:w-[85%] lg:w-[500px]"
    >
      <ScrollView
        className="flex-1 w-full"
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {roomCreator ? (
          <View className="mb-5 rounded-xl px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("general.createdBy") || "Created by"}
            </Text>
            <Text className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              {roomCreator?.firstName || roomCreator?.userName || t("general.user")}
            </Text>
          </View>
        ) : null}
        {/* Group Avatar */}
        <View className="items-center mb-6">
          <TouchableOpacity
            onPress={() => {
              if (canEditGroupInfo) pickImage();
            }}
            className="items-center justify-center relative"
            activeOpacity={canEditGroupInfo ? 0.7 : 1}
            disabled={!canEditGroupInfo}
          >
            {room?.image ? (
              <UserImage
                size="h-32 w-32"
                border="border-0"
                user={{
                  images: [{ path: room?.image }],
                }}
                showStatus={false}
              />
            ) : (
              <ImagePlaceholder
                size="h-32 w-32"
                border="border-0"
                roomName={room?.name ?? t("general.gruopChat")}
                isGroup
                iconSize={48}
              />
            )}
            {/* Camera Icon Overlay - Only show if can edit */}
            {canEditGroupInfo && (
              <View className="absolute bottom-0 right-0 items-center justify-center w-10 h-10 rounded-full bg-blue-500 dark:bg-blue-600 border-2 border-white dark:border-slate-900 shadow-lg">
                <FeIcon name="camera" size={18} color="#f6f8f9" />
              </View>
            )}
          </TouchableOpacity>
          {canEditGroupInfo && (
            <TouchableOpacity
              onPress={() => {
                pickImage();
              }}
              className="mt-3"
              activeOpacity={0.7}
            >
              <Text className="text-sm text-blue-500 dark:text-blue-400 font-semibold">
                {t("general.changePhoto") || "Change Photo"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Group Name Input */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
            {t("general.groupName") || "Group Name"}
          </Text>
          <View className="flex-row items-center gap-x-3">
            <View className={`flex-1 ${!canEditGroupInfo ? "opacity-60" : ""}`}>
              <Input
                value={groupName}
                onChange={(e) => {
                  if (!canEditGroupInfo) return; // Block changes if no permission
                  if (!editRoom) {
                    setEditeRoom(true);
                  }
                  setGroupName(e);
                }}
                placeholder={t("general.enterGruopName")}
                containerStyle="w-full !mb-0"
                widthLabel={false}
                className={`text-placehoder dark:text-papaya font-medium ${
                  isRTL ? "text-right" : "text-left"
                }`}
                editable={canEditGroupInfo && editRoom}
                pointerEvents={canEditGroupInfo ? "auto" : "none"}
              />
            </View>
            {canEditGroupInfo && (
              <TouchableOpacity
                className="items-center justify-center w-12 h-12 rounded-xl bg-[#f6f8f9] dark:bg-slate-800 active:opacity-70"
                onPress={() => {
                  if (editRoom) {
                    handleSaveGroupName();
                    setEditeRoom(false);
                  } else {
                    setEditeRoom(true);
                  }
                }}
                activeOpacity={0.7}
              >
                {editRoom ? (
                  <FeIcon
                    name="check"
                    size={22}
                    color={isDarkColorScheme ? "#34d399" : "#059669"}
                  />
                ) : (
                  <FeIcon
                    name="edit-2"
                    size={20}
                    color={isDarkColorScheme ? "#93c5fd" : "#3b82f6"}
                  />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Group Description */}
        <View className="mb-6">
          <Text className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
            {t("general.groupDescription") || "Description"}
          </Text>
          <View className="flex-row items-start gap-x-3">
            <View className={`flex-1 ${!canEditGroupInfo ? "opacity-60" : ""}`} pointerEvents={canEditGroupInfo ? "auto" : "none"}>
              <TextInput
                value={description}
                onChangeText={(text) => {
                  if (!canEditGroupInfo) return; // Block changes if no permission
                  if (!editDescription) {
                    setEditDescription(true);
                  }
                  setDescription(text);
                }}
                placeholder={t("general.enterGroupDescription") || "Enter group description..."}
                placeholderTextColor={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                multiline={true}
                numberOfLines={4}
                editable={canEditGroupInfo && editDescription}
                className={`w-full p-3 bg-[#f6f8f9] dark:bg-sec text-placehoder dark:text-papaya rounded-2xl border border-stone-300 dark:border-stone-800 min-h-[100px] ${
                  isRTL ? "text-right" : "text-left"
                }`}
                style={{
                  textAlignVertical: "top",
                }}
              />
            </View>
            {canEditGroupInfo && (
              <TouchableOpacity
                className="items-center justify-center w-12 h-12 rounded-xl bg-[#f6f8f9] dark:bg-slate-800 active:opacity-70"
                onPress={() => {
                  if (editDescription) {
                    handleSaveDescription();
                  } else {
                    setEditDescription(true);
                  }
                }}
                activeOpacity={0.7}
              >
                {editDescription ? (
                  <FeIcon
                    name="check"
                    size={22}
                    color={isDarkColorScheme ? "#34d399" : "#059669"}
                  />
                ) : (
                  <FeIcon
                    name="edit-2"
                    size={20}
                    color={isDarkColorScheme ? "#93c5fd" : "#3b82f6"}
                  />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Created By Section */}
        {roomCreator && (
          <View className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <Text className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
              {t("general.createdBy") || "Created by"}
            </Text>
            <UserCard
              item={roomCreator}
              room={room}
              isOwner={true}
              showMessageIcon={true}
              onMessagePress={handleMessagePress}
              onCloseModal={() => setShowModal(false)}
            />
          </View>
        )}

      </ScrollView>
    </Popup>
  );
};

export default GroupSettingsPopup;








