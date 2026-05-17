import React, {
  useState,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSelector, useDispatch } from "react-redux";
import { useColorScheme } from "../../../lib/useColorScheme";
import Modal from "../modal";
import ContextMenu from "../context-menu";
import FeIcon from "react-native-vector-icons/Feather";
import { SocketContext } from "../../contexts/socket.context";
import { setRoom } from "../../redux/chatSlice";
import useSelectedRoom from "../../hooks/use-selected-room";
import getFullName from "../../utils/getFullName";
import UserImage from "../user-image";
import { isRoomAdmin, canModifyRoomChatSettings, isRoomOwner } from "../../utils/permissions";
import { enableE2eeForRoom } from "../../crypto/e2eeRoom";
import {
  registerDeviceKeysOnServer,
  loadOrCreateDeviceKeys,
} from "../../crypto/e2eeDevice";

const ChatSettingsPopup = ({ showModal, setShowModal }) => {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  const { user: currentUser } = useSelector((state) => state.users);
  const dispatch = useDispatch();
  const room = useSelectedRoom();
  const { socket: currentSocket } = useContext(SocketContext);

  const [chatSettingsData, setChatSettingsData] = useState({});
  const [e2eeBusy, setE2eeBusy] = useState(false);

  // ✅ Check if current user is owner
  const isOwner = useMemo(() => {
    return isRoomOwner(currentUser?._id, room);
  }, [currentUser?._id, room]);

  // ✅ Check if current user can modify chat settings
  const canModify = useMemo(() => {
    return canModifyRoomChatSettings(currentUser?._id, room);
  }, [currentUser?._id, room]);

  const chatSettingsSignature = useMemo(() => {
    const cs = room?.chatSettings;
    if (!cs) return "";
    try {
      return JSON.stringify(cs);
    } catch {
      return "";
    }
  }, [room?.chatSettings]);

  const socketRef = useRef(currentSocket);
  socketRef.current = currentSocket;
  const lastChatSettingsLoadKeyRef = useRef("");

  // Load chat settings when modal opens - NOW from Room.chatSettings
  useEffect(() => {
    if (!showModal) {
      lastChatSettingsLoadKeyRef.current = "";
      return;
    }

    const sock = socketRef.current;
    const loadKey = [
      String(room?._id ?? ""),
      chatSettingsSignature,
      sock?.id ?? "",
    ].join("|");

    if (lastChatSettingsLoadKeyRef.current === loadKey) {
      return;
    }
    lastChatSettingsLoadKeyRef.current = loadKey;

    // Fetch room data to ensure members are loaded
    if (room?._id && sock) {
      sock.emit("getOneRoom", { room: room._id, update: false });
    }

    // ✅ Load from Room.chatSettings instead of User.privacySettings
    if (room?.chatSettings) {
      const chatSettings = room.chatSettings;
      const convertedSettings = {};

      Object.keys(chatSettings).forEach((key) => {
        if (key.endsWith("AllowedUsers")) {
          convertedSettings[key] = chatSettings[key];
        } else {
          const value = chatSettings[key];
          convertedSettings[key] = Array.isArray(value)
            ? value
            : value
              ? [value]
              : [];
        }
      });

      setChatSettingsData(convertedSettings);
    }
  }, [showModal, room?._id, chatSettingsSignature]);

  // Update chat settings with smart logic
  const updateChatSettings = useCallback(async (setting, value, allowedUsers = null) => {
    if (!canModify) {
      console.warn("Cannot update chat settings: user is not authorized");
      return;
    }
    
    const currentValue = chatSettingsData?.[setting] || [];
    const currentArray = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []);
    const currentAllowedUsers = chatSettingsData?.[`${setting}AllowedUsers`] || [];
    
    // Use provided allowedUsers or keep current ones
    const finalAllowedUsers = allowedUsers !== null ? allowedUsers : currentAllowedUsers;
    
    let updatedArray;
    
    // Special logic for "everyone" and "noOne"
    if (value === "everyone") {
      if (currentArray.includes("everyone")) {
        updatedArray = [];
      } else {
        updatedArray = ["everyone"];
      }
    } else if (value === "noOne") {
      if (currentArray.includes("noOne")) {
        updatedArray = [];
      } else {
        updatedArray = ["noOne"];
      }
    } else if (value === "specific") {
      let filteredArray = currentArray.filter(item => item !== "everyone" && item !== "noOne");
      
      if (finalAllowedUsers.length > 0) {
        if (!filteredArray.includes("specific")) {
          updatedArray = [...filteredArray, "specific"];
        } else {
          updatedArray = filteredArray;
        }
      } else {
        updatedArray = filteredArray.filter(item => item !== "specific");
      }
    } else {
      let filteredArray = currentArray.filter(item => item !== "everyone" && item !== "noOne");
      const hadSpecific = filteredArray.includes("specific");
      
      if (filteredArray.includes(value)) {
        updatedArray = filteredArray.filter(item => item !== value);
      } else {
        updatedArray = [...filteredArray, value];
      }
      
      if (hadSpecific && finalAllowedUsers.length > 0) {
        if (!updatedArray.includes("specific")) {
          updatedArray.push("specific");
        }
      } else {
        updatedArray = updatedArray.filter(item => item !== "specific");
      }
    }
    
    const updatedSettings = {
      ...chatSettingsData,
      [setting]: updatedArray,
    };
    
    if (value === "everyone" || value === "noOne") {
      updatedSettings[`${setting}AllowedUsers`] = [];
      updatedSettings[`${setting}ExceptUsers`] = []; // ✅ Clear exceptions when switching to everyone/noOne
    } else if (allowedUsers !== null && setting) {
      updatedSettings[`${setting}AllowedUsers`] = allowedUsers;
    }
    
    setChatSettingsData(updatedSettings);
    
    // Update via Socket.IO only
    if (!currentSocket || !room?._id) {
      console.warn("⚠️ [ChatSettings] Cannot update: missing socket or room");
      return;
    }
    
    try {
      console.log("📤 [ChatSettings] Emitting updateChatSettings via Socket.IO:", {
        roomId: room._id,
        userId: currentUser._id,
        setting,
        updatedSettings,
      });
      
      // ✅ Now updates Room.chatSettings
      currentSocket.emit("updateChatSettings", {
        roomId: room._id,
        chatSettings: updatedSettings,
        userId: currentUser._id,
      });
    } catch (error) {
      console.error("❌ [ChatSettings] Error emitting updateChatSettings:", error);
      setChatSettingsData(chatSettingsData);
    }
  }, [chatSettingsData, currentUser, currentSocket, room, canModify]);

  // ✅ Listen for chat settings updates
  useEffect(() => {
    if (!currentSocket || !room?._id) return;

    const handleChatSettingsUpdated = ({ roomId, chatSettings, updatedBy }) => {
      console.log("📥 [ChatSettings] Received chatSettingsUpdated event:", {
        roomId,
        chatSettings,
        updatedBy,
        currentRoomId: room?._id,
      });

      // Update local state if it's for the current room
      if (roomId === room?._id?.toString() || roomId === room?._id) {
        setChatSettingsData(chatSettings);
        
        // Also update the room in Redux
        dispatch(setRoom({
          ...room,
          chatSettings,
        }));
      }
    };

    currentSocket.on("chatSettingsUpdated", handleChatSettingsUpdated);

    return () => {
      currentSocket.off("chatSettingsUpdated", handleChatSettingsUpdated);
    };
  }, [currentSocket, room?._id, room, dispatch]);

  // Get display text for setting
  const getSettingDisplayText = useCallback((setting) => {
    const value = chatSettingsData?.[setting] || [];
    const valueArray = Array.isArray(value) ? value : (value ? [value] : []);
    const exceptUsers = chatSettingsData?.[`${setting}ExceptUsers`] || [];
    
    if (valueArray.length === 0) {
      return t("chatSettingsScreen.items.everyone");
    }
    
    // ✅ Check if "Everyone Except" is active
    if (valueArray.includes("everyone") && exceptUsers.length > 0) {
      const exceptLabel = t("chatSettingsScreen.items.everyoneExcept") || "Everyone Except";
      return `${exceptLabel} (${exceptUsers.length})`;
    }
    
    const labels = valueArray.map(v => {
      switch(v) {
        case "everyone": return t("chatSettingsScreen.items.everyone");
        case "admin": return t("chatSettingsScreen.items.admin");
        case "moderator": return t("chatSettingsScreen.items.moderator");
        case "friends": return t("chatSettingsScreen.items.friends");
        case "specific": return t("chatSettingsScreen.items.specific");
        case "noOne": return t("chatSettingsScreen.items.noOne");
        default: return v;
      }
    });
    
    return labels.join(", ");
  }, [chatSettingsData, t, room?.members]);

  // Create chat settings options
  const createChatSettingsOptions = useCallback((setting) => {
    const currentValue = chatSettingsData?.[setting] || [];
    const currentArray = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []);
    const allowedUsers = chatSettingsData?.[`${setting}AllowedUsers`] || [];
    const exceptUsers = chatSettingsData?.[`${setting}ExceptUsers`] || [];
    
    // Get room members for "specific" option
    const roomMembers = room?.members || [];
    
    return [
      {
        name: t("chatSettingsScreen.items.everyone"),
        selected: currentArray.includes("everyone") && exceptUsers.length === 0,
        keepOpen: true,
        onPress: () => updateChatSettings(setting, "everyone", null),
      },
      {
        name: t("chatSettingsScreen.items.admin"),
        selected: currentArray.includes("admin"),
        keepOpen: true,
        onPress: () => updateChatSettings(setting, "admin", null),
      },
      {
        name: t("chatSettingsScreen.items.moderator"),
        selected: currentArray.includes("moderator"),
        keepOpen: true,
        onPress: () => updateChatSettings(setting, "moderator", null),
      },
      {
        name: t("chatSettingsScreen.items.friends"),
        selected: currentArray.includes("friends"),
        keepOpen: true,
        onPress: () => updateChatSettings(setting, "friends", null),
      },
      {
        name: t("chatSettingsScreen.items.specific"),
        selected: currentArray.includes("specific"),
        keepOpen: true,
        submenu: roomMembers && roomMembers.length > 0 ? roomMembers
          .filter(member => member?._id)
          .map((member) => ({
          name: getFullName(member, false, 20),
          selected: allowedUsers.some(
            (id) => id?.toString() === member?._id?.toString()
          ),
          icon: (
            <UserImage
              user={member}
              size="w-8 h-8"
              border="border-0"
              showStatus={false}
            />
          ),
          onPress: () => {
            if (!member?._id) return;
            const memberId = member._id.toString();
            const isSelected = allowedUsers.some((id) => {
              const idStr = id?.toString?.() || String(id);
              return idStr === memberId;
            });
            const newAllowed = isSelected
              ? allowedUsers.filter((id) => {
                  const idStr = id?.toString?.() || String(id);
                  return idStr !== memberId;
                })
              : [...allowedUsers, member._id];
            updateChatSettings(setting, "specific", newAllowed);
          },
        })) : [
          {
            name: t("chatSettingsScreen.noMembers") || "No members in this room",
            disabled: true,
            onPress: () => {},
          }
        ],
      },
      // ✅ "Everyone Except" - allows everyone except selected users
      {
        name: t("chatSettingsScreen.items.everyoneExcept") || "Everyone Except",
        selected: currentArray.includes("everyone") && exceptUsers.length > 0,
        keepOpen: true,
        submenu: roomMembers && roomMembers.length > 0 ? roomMembers
          .filter(member => member?._id)
          .map((member) => {
            return {
              name: getFullName(member, false, 20),
              selected: exceptUsers.some(
                (id) => id?.toString() === member?._id?.toString()
              ),
              icon: (
                <UserImage
                  user={member}
                  size="w-8 h-8"
                  border="border-0"
                  showStatus={false}
                />
              ),
              onPress: () => {
                if (!member?._id) return;
                const memberId = member._id.toString();
                const currentExceptUsers = chatSettingsData?.[`${setting}ExceptUsers`] || [];
                const isSelected = currentExceptUsers.some((id) => {
                  const idStr = id?.toString?.() || String(id);
                  return idStr === memberId;
                });
                const newExceptUsers = isSelected
                  ? currentExceptUsers.filter((id) => {
                      const idStr = id?.toString?.() || String(id);
                      return idStr !== memberId;
                    })
                  : [...currentExceptUsers, member._id];
                
                // Update settings with "everyone" and exceptUsers
                const updatedSettings = {
                  ...chatSettingsData,
                  [setting]: ["everyone"],
                  [`${setting}AllowedUsers`]: [],
                  [`${setting}ExceptUsers`]: newExceptUsers,
                };
                setChatSettingsData(updatedSettings);
                
                // Emit update
                if (currentSocket && room?._id) {
                  currentSocket.emit("updateChatSettings", {
                    roomId: room._id,
                    chatSettings: updatedSettings,
                    userId: currentUser._id,
                  });
                }
              },
            };
          }) : [
          {
            name: t("chatSettingsScreen.noMembers") || "No members in this room",
            disabled: true,
            onPress: () => {},
          }
        ],
      },
      {
        name: t("chatSettingsScreen.items.noOne"),
        selected: currentArray.includes("noOne"),
        keepOpen: true,
        onPress: () => updateChatSettings(setting, "noOne", null),
      },
    ];
  }, [chatSettingsData, room?.members, t, updateChatSettings, currentSocket, room?._id, currentUser]);

  const handleEnableE2ee = async () => {
    if (!room?._id || !currentSocket || !currentUser?._id) return;
    setE2eeBusy(true);
    try {
      await loadOrCreateDeviceKeys();
      await registerDeviceKeysOnServer(currentSocket);
      await enableE2eeForRoom(currentSocket, room._id);
      currentSocket.emit("getOneRoom", { room: room._id, update: true });
      Alert.alert(
        "Encryption",
        "End-to-end encryption is enabled. New text messages are encrypted on your devices."
      );
    } catch (e) {
      Alert.alert(
        "Encryption",
        e?.message || "Could not enable encryption. Ensure every member has opened the app once."
      );
    } finally {
      setE2eeBusy(false);
    }
  };

  return (
    <Modal
      showModal={showModal}
      setShowModal={setShowModal}
      opacity="70"
      animationType="slide"
    >
      <View
        className={`w-11/12 md:w-1/2 lg:w-1/2 rounded-2xl pt-4 px-4 pb-4 ${
          isDarkColorScheme ? "bg-main" : "bg-[#dee4e6]"
        }`}
        style={
          Platform.OS === "web"
            ? { maxHeight: "95vh" }
            : { maxHeight: "90%" }
        }
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-4">
          <Text
            className={`text-xl font-bold ${
              isDarkColorScheme ? "text-papaya" : "text-placeholder"
            }`}
          >
            {t("chatSettingsScreen.title") || "Chat Settings"}
          </Text>
          <TouchableOpacity
            onPress={() => setShowModal(false)}
            className="items-center justify-center w-12 h-12 p-2"
          >
            <FeIcon
              name="x"
              size={30}
              color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
            />
          </TouchableOpacity>
        </View>

        {/* ✅ Info message for non-admins in group chats */}
        {room?.isGroup && !canModify && (
          <View className={`p-4 rounded-xl mb-4 ${
            isDarkColorScheme ? "bg-slate-800/50 border border-slate-700" : "bg-blue-50 border border-blue-200"
          }`}>
            <View className="flex-row items-center gap-x-2">
              <FeIcon 
                name="info" 
                size={18} 
                color={isDarkColorScheme ? "#94a3b8" : "#3b82f6"} 
              />
              <Text className={`text-sm flex-1 ${
                isDarkColorScheme ? "text-slate-300" : "text-blue-800"
              }`}>
                {t("chatSettingsScreen.readOnlyInfo") || "These settings are view-only. Only room admins can modify them."}
              </Text>
            </View>
          </View>
        )}

        {/* Chat Settings List */}
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View className="gap-y-6">
            {(room?.members?.length >= 2 || room?.isGroup) && (
              <View
                className={`p-4 rounded-xl ${
                  isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
                }`}
              >
                <View className="flex-row items-center gap-x-3 mb-2">
                  <FeIcon
                    name="lock"
                    size={20}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  />
                  <Text
                    className={`text-base font-semibold ${
                      isDarkColorScheme ? "text-papaya" : "text-placeholder"
                    }`}
                  >
                    End-to-end encryption
                  </Text>
                </View>
                {room?.e2ee?.enabled ? (
                  <Text
                    className={`text-sm ${
                      isDarkColorScheme ? "text-slate-300" : "text-slate-600"
                    }`}
                  >
                    On. Only chat members can read messages. The server stores
                    encrypted data only.
                  </Text>
                ) : canModify ? (
                  <View className="gap-y-2">
                    <Text
                      className={`text-sm ${
                        isDarkColorScheme ? "text-slate-400" : "text-slate-600"
                      }`}
                    >
                      Encrypt new text messages for everyone in this chat. All
                      members must have opened the app at least once.
                    </Text>
                    <TouchableOpacity
                      onPress={handleEnableE2ee}
                      disabled={e2eeBusy}
                      className={`py-3 px-4 rounded-xl items-center ${
                        isDarkColorScheme ? "bg-cyan-800" : "bg-cyan-600"
                      }`}
                    >
                      {e2eeBusy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-white font-semibold">
                          Enable encryption
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text
                    className={`text-sm ${
                      isDarkColorScheme ? "text-slate-400" : "text-slate-600"
                    }`}
                  >
                    Off
                  </Text>
                )}
              </View>
            )}

            {/* Video Call Permission */}
            <View className={`p-4 rounded-xl ${
              isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
            }`}>
              <View className="flex-row items-center gap-x-3 mb-3">
                <View className={`p-2 rounded-lg ${
                  isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                }`}>
                  <FeIcon
                    name="video"
                    size={20}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  />
                </View>
                <Text className={`text-base font-semibold ${
                  isDarkColorScheme ? "text-papaya" : "text-placeholder"
                }`}>
                  {t("chatSettingsScreen.fields.videoCall")}
                </Text>
              </View>
              {canModify ? (
                <ContextMenu
                  width={200}
                  placement="bottom"
                  px="px-2"
                  menuClassName="rounded-xl"
                  itemClassName="rounded-lg"
                  options={createChatSettingsOptions("videoCall")}
                >
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    }`}
                  >
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("videoCall")}
                    </Text>
                    <FeIcon
                      name="chevron-down"
                      size={16}
                      color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                    />
                  </View>
                </ContextMenu>
              ) : (
                <View
                  className={`flex-row items-center justify-between p-3 rounded-lg ${
                    isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                  } opacity-60`}
                >
                  <View className="flex-row items-center gap-x-2">
                    <FeIcon name="lock" size={14} color={isDarkColorScheme ? "#94a3b8" : "#64748b"} />
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("videoCall")}
                    </Text>
                  </View>
                  <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                    {t("settings.lockedByOwner") || "Owner only"}
                  </Text>
                </View>
              )}
            </View>
            
            {/* Audio Call Permission */}
            <View className={`p-4 rounded-xl ${
              isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
            }`}>
              <View className="flex-row items-center gap-x-3 mb-3">
                <View className={`p-2 rounded-lg ${
                  isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                }`}>
                  <FeIcon
                    name="phone"
                    size={20}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  />
                </View>
                <Text className={`text-base font-semibold ${
                  isDarkColorScheme ? "text-papaya" : "text-placeholder"
                }`}>
                  {t("chatSettingsScreen.fields.audioCall")}
                </Text>
              </View>
              {canModify ? (
                <ContextMenu
                  width={200}
                  placement="bottom"
                  px="px-2"
                  menuClassName="rounded-xl"
                  itemClassName="rounded-lg"
                  options={createChatSettingsOptions("audioCall")}
                >
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    }`}
                  >
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("audioCall")}
                    </Text>
                    <FeIcon
                      name="chevron-down"
                      size={16}
                      color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                    />
                  </View>
                </ContextMenu>
              ) : (
                <View
                  className={`flex-row items-center justify-between p-3 rounded-lg ${
                    isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                  } opacity-60`}
                >
                  <View className="flex-row items-center gap-x-2">
                    <FeIcon name="lock" size={14} color={isDarkColorScheme ? "#94a3b8" : "#64748b"} />
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("audioCall")}
                    </Text>
                  </View>
                  <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                    {t("settings.lockedByOwner") || "Owner only"}
                  </Text>
                </View>
              )}
            </View>
            
            {/* Can Send Permission - Controls entire chat footer */}
            <View className={`p-4 rounded-xl ${
              isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
            }`}>
              <View className="flex-row items-center gap-x-3 mb-3">
                <View className={`p-2 rounded-lg ${
                  isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                }`}>
                  <FeIcon
                    name="send"
                    size={20}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  />
                </View>
                <Text className={`text-base font-semibold ${
                  isDarkColorScheme ? "text-papaya" : "text-placeholder"
                }`}>
                  {t("chatSettingsScreen.fields.canSend")}
                </Text>
              </View>
              {canModify ? (
                <ContextMenu
                  width={200}
                  placement="bottom"
                  px="px-2"
                  menuClassName="rounded-xl"
                  itemClassName="rounded-lg"
                  options={createChatSettingsOptions("canSend")}
                >
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    }`}
                  >
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("canSend")}
                    </Text>
                    <FeIcon
                      name="chevron-down"
                      size={16}
                      color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                    />
                  </View>
                </ContextMenu>
              ) : (
                <View
                  className={`flex-row items-center justify-between p-3 rounded-lg ${
                    isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                  } opacity-60`}
                >
                  <View className="flex-row items-center gap-x-2">
                    <FeIcon name="lock" size={14} color={isDarkColorScheme ? "#94a3b8" : "#64748b"} />
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("canSend")}
                    </Text>
                  </View>
                  <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                    {t("settings.lockedByOwner") || "Owner only"}
                  </Text>
                </View>
              )}
            </View>
            
            {/* Edit Group Info Permission - Only for group chats */}
            {room?.isGroup && (
              <View className={`p-4 rounded-xl ${
                isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
              }`}>
                <View className="flex-row items-center gap-x-3 mb-3">
                  <View className={`p-2 rounded-lg ${
                    isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                  }`}>
                    <FeIcon
                      name="edit-3"
                      size={20}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  </View>
                  <Text className={`text-base font-semibold ${
                    isDarkColorScheme ? "text-papaya" : "text-placeholder"
                  }`}>
                    {t("chatSettingsScreen.fields.editGroupInfo") || "Edit Group Info"}
                  </Text>
                </View>
                {canModify ? (
                  <ContextMenu
                    width={200}
                    placement="bottom"
                    px="px-2"
                    menuClassName="rounded-xl"
                    itemClassName="rounded-lg"
                    options={createChatSettingsOptions("editGroupInfo")}
                  >
                    <View
                      className={`flex-row items-center justify-between p-3 rounded-lg ${
                        isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                      }`}
                    >
                      <Text className="text-placeholder dark:text-papaya">
                        {getSettingDisplayText("editGroupInfo")}
                      </Text>
                      <FeIcon
                        name="chevron-down"
                        size={16}
                        color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                      />
                    </View>
                  </ContextMenu>
                ) : (
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    } opacity-60`}
                  >
                    <View className="flex-row items-center gap-x-2">
                      <FeIcon name="lock" size={14} color={isDarkColorScheme ? "#94a3b8" : "#64748b"} />
                      <Text className="text-placeholder dark:text-papaya">
                        {getSettingDisplayText("editGroupInfo")}
                      </Text>
                    </View>
                    <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                      {t("settings.lockedByOwner") || "Owner only"}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ✅ Add Members Permission - Only for group chats */}
            {room?.isGroup && (
              <View className={`p-4 rounded-xl ${
                isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
              }`}>
                <View className="flex-row items-center gap-x-3 mb-3">
                  <View className={`p-2 rounded-lg ${
                    isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                  }`}>
                    <FeIcon
                      name="user-plus"
                      size={20}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  </View>
                  <Text className={`text-base font-semibold ${
                    isDarkColorScheme ? "text-papaya" : "text-placeholder"
                  }`}>
                    {t("chatSettingsScreen.fields.addMembers") || "Add Members"}
                  </Text>
                </View>
                {canModify ? (
                  <ContextMenu
                    width={200}
                    placement="bottom"
                    px="px-2"
                    menuClassName="rounded-xl"
                    itemClassName="rounded-lg"
                    options={createChatSettingsOptions("addMembers")}
                  >
                    <View
                      className={`flex-row items-center justify-between p-3 rounded-lg ${
                        isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                      }`}
                    >
                      <Text className="text-placeholder dark:text-papaya">
                        {getSettingDisplayText("addMembers")}
                      </Text>
                      <FeIcon
                        name="chevron-down"
                        size={16}
                        color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                      />
                    </View>
                  </ContextMenu>
                ) : (
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    } opacity-60`}
                  >
                    <View className="flex-row items-center gap-x-2">
                      <FeIcon name="lock" size={14} color={isDarkColorScheme ? "#94a3b8" : "#64748b"} />
                      <Text className="text-placeholder dark:text-papaya">
                        {getSettingDisplayText("addMembers")}
                      </Text>
                    </View>
                    <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                      {t("settings.lockedByOwner") || "Owner only"}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ✅ Disappearing Messages Permission - Who can change it */}
            <View className={`p-4 rounded-xl ${
              isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
            }`}>
              <View className="flex-row items-center gap-x-3 mb-3">
                <View className={`p-2 rounded-lg ${
                  isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                }`}>
                  <FeIcon
                    name="clock"
                    size={20}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  />
                </View>
                <Text className={`text-base font-semibold ${
                  isDarkColorScheme ? "text-papaya" : "text-placeholder"
                }`}>
                  {t("chatSettingsScreen.autoDelete.title") || "Disappearing Messages"}
                </Text>
              </View>
              {canModify ? (
                <ContextMenu
                  width={200}
                  placement="bottom"
                  px="px-2"
                  menuClassName="rounded-xl"
                  itemClassName="rounded-lg"
                  options={createChatSettingsOptions("disappearingMessages")}
                >
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    }`}
                  >
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("disappearingMessages")}
                    </Text>
                    <FeIcon
                      name="chevron-down"
                      size={16}
                      color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                    />
                  </View>
                </ContextMenu>
              ) : (
                <View
                  className={`flex-row items-center justify-between p-3 rounded-lg ${
                    isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                  } opacity-60`}
                >
                  <View className="flex-row items-center gap-x-2">
                    <FeIcon name="lock" size={14} color={isDarkColorScheme ? "#94a3b8" : "#64748b"} />
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("disappearingMessages")}
                    </Text>
                  </View>
                  <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                    {t("settings.lockedByOwner") || "Owner only"}
                  </Text>
                </View>
              )}
            </View>

            {/* ✅ Pin Messages Permission - Only for group chats */}
            {room?.isGroup && (
              <View className={`p-4 rounded-xl ${
                isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
              }`}>
                <View className="flex-row items-center gap-x-3 mb-3">
                  <View className={`p-2 rounded-lg ${
                    isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                  }`}>
                    <FeIcon
                      name="bookmark"
                      size={20}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  </View>
                  <Text className={`text-base font-semibold ${
                    isDarkColorScheme ? "text-papaya" : "text-placeholder"
                  }`}>
                    {t("chatSettingsScreen.fields.pinMessages") || "Pin Messages"}
                  </Text>
                </View>
                {canModify ? (
                  <ContextMenu
                    width={200}
                    placement="bottom"
                    px="px-2"
                    menuClassName="rounded-xl"
                    itemClassName="rounded-lg"
                    options={createChatSettingsOptions("pinMessages")}
                  >
                    <View
                      className={`flex-row items-center justify-between p-3 rounded-lg ${
                        isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                      }`}
                    >
                      <Text className="text-placeholder dark:text-papaya">
                        {getSettingDisplayText("pinMessages")}
                      </Text>
                      <FeIcon
                        name="chevron-down"
                        size={16}
                        color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                      />
                    </View>
                  </ContextMenu>
                ) : (
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    } opacity-60`}
                  >
                    <View className="flex-row items-center gap-x-2">
                      <FeIcon name="lock" size={14} color={isDarkColorScheme ? "#94a3b8" : "#64748b"} />
                      <Text className="text-placeholder dark:text-papaya">
                        {getSettingDisplayText("pinMessages")}
                      </Text>
                    </View>
                    <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                      {t("settings.lockedByOwner") || "Owner only"}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ✅ Delete Others' Messages Permission - Only for group chats */}
            {room?.isGroup && (
              <View className={`p-4 rounded-xl ${
                isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
              }`}>
                <View className="flex-row items-center gap-x-3 mb-3">
                  <View className={`p-2 rounded-lg ${
                    isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                  }`}>
                    <FeIcon
                      name="trash-2"
                      size={20}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  </View>
                  <Text className={`text-base font-semibold ${
                    isDarkColorScheme ? "text-papaya" : "text-placeholder"
                  }`}>
                    {t("chatSettingsScreen.fields.deleteOthersMessages") || "Delete Others' Messages"}
                  </Text>
                </View>
                {canModify ? (
                  <ContextMenu
                    width={200}
                    placement="bottom"
                    px="px-2"
                    menuClassName="rounded-xl"
                    itemClassName="rounded-lg"
                    options={createChatSettingsOptions("deleteOthersMessages")}
                  >
                    <View
                      className={`flex-row items-center justify-between p-3 rounded-lg ${
                        isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                      }`}
                    >
                      <Text className="text-placeholder dark:text-papaya">
                        {getSettingDisplayText("deleteOthersMessages")}
                      </Text>
                      <FeIcon
                        name="chevron-down"
                        size={16}
                        color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                      />
                    </View>
                  </ContextMenu>
                ) : (
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    } opacity-60`}
                  >
                    <View className="flex-row items-center gap-x-2">
                      <FeIcon name="lock" size={14} color={isDarkColorScheme ? "#94a3b8" : "#64748b"} />
                      <Text className="text-placeholder dark:text-papaya">
                        {getSettingDisplayText("deleteOthersMessages")}
                      </Text>
                    </View>
                    <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                      {t("settings.lockedByOwner") || "Owner only"}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ✅ Remove Members Permission - Only for group chats */}
            {room?.isGroup && (
              <View className={`p-4 rounded-xl ${
                isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
              }`}>
                <View className="flex-row items-center gap-x-3 mb-3">
                  <View className={`p-2 rounded-lg ${
                    isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                  }`}>
                    <FeIcon
                      name="user-minus"
                      size={20}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  </View>
                  <Text className={`text-base font-semibold ${
                    isDarkColorScheme ? "text-papaya" : "text-placeholder"
                  }`}>
                    {t("chatSettingsScreen.fields.removeMembers") || "Remove Members"}
                  </Text>
                </View>
                {canModify ? (
                  <ContextMenu
                    width={200}
                    placement="bottom"
                    px="px-2"
                    menuClassName="rounded-xl"
                    itemClassName="rounded-lg"
                    options={createChatSettingsOptions("removeMembers")}
                  >
                    <View
                      className={`flex-row items-center justify-between p-3 rounded-lg ${
                        isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                      }`}
                    >
                      <Text className="text-placeholder dark:text-papaya">
                        {getSettingDisplayText("removeMembers")}
                      </Text>
                      <FeIcon
                        name="chevron-down"
                        size={16}
                        color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                      />
                    </View>
                  </ContextMenu>
                ) : (
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    } opacity-60`}
                  >
                    <View className="flex-row items-center gap-x-2">
                      <FeIcon name="lock" size={14} color={isDarkColorScheme ? "#94a3b8" : "#64748b"} />
                      <Text className="text-placeholder dark:text-papaya">
                        {getSettingDisplayText("removeMembers")}
                      </Text>
                    </View>
                    <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                      {t("settings.lockedByOwner") || "Owner only"}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ✅ Manage Roles Permission - Only for group chats */}
            {room?.isGroup && (
              <View className={`p-4 rounded-xl ${
                isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
              }`}>
                <View className="flex-row items-center gap-x-3 mb-3">
                  <View className={`p-2 rounded-lg ${
                    isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                  }`}>
                    <FeIcon
                      name="shield"
                      size={20}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  </View>
                  <Text className={`text-base font-semibold ${
                    isDarkColorScheme ? "text-papaya" : "text-placeholder"
                  }`}>
                    {t("chatSettingsScreen.fields.manageRoles") || "Manage Roles"}
                  </Text>
                </View>
                {canModify ? (
                  <ContextMenu
                    width={200}
                    placement="bottom"
                    px="px-2"
                    menuClassName="rounded-xl"
                    itemClassName="rounded-lg"
                    options={createChatSettingsOptions("manageRoles")}
                  >
                    <View
                      className={`flex-row items-center justify-between p-3 rounded-lg ${
                        isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                      }`}
                    >
                      <Text className="text-placeholder dark:text-papaya">
                        {getSettingDisplayText("manageRoles")}
                      </Text>
                      <FeIcon
                        name="chevron-down"
                        size={16}
                        color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                      />
                    </View>
                  </ContextMenu>
                ) : (
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    } opacity-60`}
                  >
                    <View className="flex-row items-center gap-x-2">
                      <FeIcon name="lock" size={14} color={isDarkColorScheme ? "#94a3b8" : "#64748b"} />
                      <Text className="text-placeholder dark:text-papaya">
                        {getSettingDisplayText("manageRoles")}
                      </Text>
                    </View>
                    <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                      {t("settings.lockedByOwner") || "Owner only"}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

export default ChatSettingsPopup;
