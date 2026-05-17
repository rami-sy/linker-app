import { View } from "react-native";
import React, { useContext } from "react";

import FeIcon from "react-native-vector-icons/Feather";
import { useSelector, useDispatch } from "react-redux";
import { router } from "expo-router";
import { useColorScheme } from "../../../lib/useColorScheme";
import UserCard from "./user-card";
import { SocketContext } from "../../contexts/socket.context";
import { clearRoom, setRoom, addRoom } from "../../redux/chatSlice";
import { isRoomOwner, checkChatPermission } from "../../utils/permissions";

const GroupDetailsItem = ({
  item,
  room,
  socket,
  user,
  dispatch,
  setShowModal,
  isAdmin,
  isModerator,
  isOwner: currentUserIsOwner,
  t,
  setSelectedMember,
  setShowConfirmRole,
  setShowDeleteMember,
  setGroupDetailsModal,
  setWasGroupDetailsModalOpen,
  onCreateRoomWithMember,
}) => {
  const role = room?.roles?.find((role) => String(role.user) === String(item._id))?.role;
  const { isDarkColorScheme } = useColorScheme();
  const { user: userData } = useSelector((state) => state.users);
  const { rooms } = useSelector((state) => state.chats);
  
  // Check if this member is the room owner
  const isItemOwner = isRoomOwner(item._id, room);
  const isCurrentUser = String(userData?._id) === String(item?._id);

  // Handle message press - create or navigate to chat
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

  // Build context menu options
  const contextMenuOptions = [];

  // Check permissions from chatSettings
  const canRemoveMembers = currentUserIsOwner || checkChatPermission(userData?._id, room, "removeMembers", { currentUser: userData });
  const canManageRoles = currentUserIsOwner || checkChatPermission(userData?._id, room, "manageRoles", { currentUser: userData });

  // Change Role option - Based on manageRoles permission
  if (canManageRoles && !isItemOwner && !isCurrentUser) {
    contextMenuOptions.push({
      name: t("header.changeRole"),
      icon: (
        <FeIcon
          name="users"
          size={18}
          color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
        />
      ),
      onPress: () => {
        setSelectedMember({ ...item, role, isItemOwner });
        if (setWasGroupDetailsModalOpen) {
          setWasGroupDetailsModalOpen(true);
        }
        setShowConfirmRole(true);
        if (setGroupDetailsModal) {
          setGroupDetailsModal(false);
        }
      },
    });
  }

  // Remove Member option - Based on removeMembers permission
  if (canRemoveMembers && !isItemOwner && !isCurrentUser) {
    contextMenuOptions.push({
      name: t("header.removeMember"),
      icon: (
        <FeIcon
          name="x"
          size={18}
          color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
        />
      ),
      onPress: () => {
        setSelectedMember(item);
        if (setWasGroupDetailsModalOpen) {
          setWasGroupDetailsModalOpen(true);
        }
        setShowDeleteMember(true);
        if (setGroupDetailsModal) {
          setGroupDetailsModal(false);
        }
      },
    });
  }

  const onMessagePress = onCreateRoomWithMember ?? handleMessagePress;

  return (
    <UserCard
      item={item}
      room={room}
      role={role}
      isOwner={isItemOwner}
      showMessageIcon={true}
      onMessagePress={(memberItem) => onMessagePress(memberItem ?? item)}
      showContextMenu={contextMenuOptions.length > 0}
      contextMenuProps={{
        options: contextMenuOptions,
        placement: "left",
        width: 180,
      }}
      onCloseModal={() => setShowModal(false)}
    />
  );
};

export default GroupDetailsItem;
