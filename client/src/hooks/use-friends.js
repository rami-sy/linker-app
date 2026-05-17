import { useContext, useEffect } from "react";
import { useFriendAction } from "../sockets/friend";
import { useDispatch } from "react-redux";
import { updateMe } from "../redux/userSlice";
import { SocketContext } from "../contexts/socket.context";

export const useFriends = () => {
  const {
    onSendFriendRequest,
    onCancelFriendRequest,
    onFriendRequestCanceled,
    onFriendRequestAccepted,
    onRemoveFriend,
    onBlockUser,
  } = useFriendAction();
  const dispatch = useDispatch();
  const { socket } = useContext(SocketContext);
  useEffect(() => {
    if (!socket) return;

    const handleBlockUser = async ({ targetUser, user, block }) => {
      await dispatch(updateMe({ blockedUsers: user.blockedUsers }));
      onBlockUser({ targetUser, user, block });
    };

    socket.on("sendFriendRequest", onSendFriendRequest);
    socket.on("cancelFriendRequest", onCancelFriendRequest);
    socket.on("friendRequestCanceled", onFriendRequestCanceled);
    socket.on("friendRequestAccepted", onFriendRequestAccepted);
    socket.on("removeFriend", onRemoveFriend);
    socket.on("blockUser", handleBlockUser);

    return () => {
      socket.off("sendFriendRequest", onSendFriendRequest);
      socket.off("cancelFriendRequest", onCancelFriendRequest);
      socket.off("friendRequestCanceled", onFriendRequestCanceled);
      socket.off("friendRequestAccepted", onFriendRequestAccepted);
      socket.off("removeFriend", onRemoveFriend);
      socket.off("blockUser", handleBlockUser);
    };
  }, [
    socket,
    dispatch,
    onSendFriendRequest,
    onCancelFriendRequest,
    onFriendRequestCanceled,
    onFriendRequestAccepted,
    onRemoveFriend,
    onBlockUser,
  ]);
};
