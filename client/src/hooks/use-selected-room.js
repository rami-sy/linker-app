import { useSelector, shallowEqual } from "react-redux";
import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";

const useSelectedRoom = (roomIdParam = null) => {
  // ✅ Get rooms and roomId separately to ensure re-evaluation
  const rooms = useSelector((state) => state.chats.rooms, shallowEqual);
  const roomId = useSelector((state) => state.chats.roomId);
  const routeParams = useLocalSearchParams();
  const routeRoomIdRaw = routeParams?.roomId;
  const routeRoomId = Array.isArray(routeRoomIdRaw)
    ? routeRoomIdRaw[0]
    : routeRoomIdRaw;
  
  // ✅ استخدام roomIdParam إذا كان متوفراً، وإلا استخدام roomId من Redux
  const targetRoomId = roomIdParam || roomId || routeRoomId;
  
  // ✅ Use useMemo with dependencies on rooms array and targetRoomId
  // This ensures re-evaluation when rooms array reference changes (which happens in Redux Toolkit)
  return useMemo(() => {
    const foundRoom = rooms?.find?.(
      (room) => String(room?._id) === String(targetRoomId)
    );
    // Return a new object reference with new members array to force re-evaluation in components
    if (!foundRoom) return foundRoom;
    
    return {
      ...foundRoom,
      // ✅ Create a new members array to ensure re-evaluation
      members: foundRoom.members ? foundRoom.members.map(m => ({ ...m })) : foundRoom.members,
    };
  }, [rooms, targetRoomId]);
};

export default useSelectedRoom;
