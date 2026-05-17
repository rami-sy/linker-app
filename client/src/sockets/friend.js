import { useContext } from "react";
import { useDispatch } from "react-redux";
import { SocketContext } from "../contexts/socket.context";
import {
  acceptFriendRequest,
  addBlockedUser,
  addIncomingFriendRequest,
  addOutgoingFriendRequest,
  removeBlockedUser,
  removeFriend,
  removeIncomingFriendRequest,
  removeOutgoingFriendRequest,
  setMe,
  updateMe,
} from "../redux/userSlice";

export const useFriendAction = () => {
  const { socket } = useContext(SocketContext);
  const dispatch = useDispatch();

  const onSendFriendRequest = ({ user, targetUser, triggeredBySender }) => {
    console.log("onSendFriendRequest", user, targetUser, triggeredBySender);
    dispatch(setMe({ ...user }));
    if (triggeredBySender) {
      dispatch(addOutgoingFriendRequest(targetUser));
    } else {
      dispatch(addIncomingFriendRequest(targetUser));
    }
  };

  const onCancelFriendRequest = ({ user, targetUser, triggeredBySender }) => {
    dispatch(setMe({ ...user }));
    if (triggeredBySender) {
      dispatch(removeOutgoingFriendRequest(targetUser));
    } else {
      dispatch(removeIncomingFriendRequest(targetUser));
    }
  };

  const onFriendRequestCanceled = ({ user, targetUser, triggeredBySender }) => {
    dispatch(setMe({ ...user }));
    if (triggeredBySender) {
      dispatch(removeIncomingFriendRequest(targetUser));
    } else {
      dispatch(removeOutgoingFriendRequest(targetUser));
    }
  };

  const onFriendRequestAccepted = ({ user }) => {
    dispatch(acceptFriendRequest(user));
  };

  const onRemoveFriend = ({ user }) => {
    dispatch(removeFriend(user));
  };

  const handleSendFriendRequest = async ({ targetUserId }) => {
    if (socket) {
      socket.emit("sendFriendRequest", {
        targetUserId,
      });
    }
  };

  const handleCancelFriendRequest = ({ targetUserId }) => {
    if (socket) {
      socket.emit("cancelFriendRequest", {
        targetUserId,
      });
    }
  };
  const handleAcceptFriend = ({ targetUserId }) => {
    if (socket) {
      socket.emit("acceptFriendRequest", {
        targetUserId,
      });
    }
  };

  const handleRemoveFriend = ({ targetUserId }) => {
    if (socket) {
      socket.emit("removeFriend", { targetUserId });
    }
  };

  const handleUnBlockUser = ({ targetUserId }) => {
    if (socket) {
      socket.emit("blockUser", {
        targetUser: targetUserId,
        block: false,
      });
    }
  };

  const onBlockUser = ({ targetUser, user, block }) => {
    dispatch(updateMe({ blockedUsers: user.blockedUsers }));

    if (block) {
      dispatch(addBlockedUser(targetUser));
    } else {
      dispatch(removeBlockedUser(targetUser));
    }
  };

  return {
    onSendFriendRequest,
    onCancelFriendRequest,
    onFriendRequestCanceled,
    onFriendRequestAccepted,
    onRemoveFriend,
    handleSendFriendRequest,
    handleCancelFriendRequest,
    handleAcceptFriend,
    handleRemoveFriend,
    handleUnBlockUser,
    onBlockUser,
  };
};
