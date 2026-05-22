import React, {
  useState,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";
import { View, Text, ScrollView, TouchableOpacity, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { useSelector, useDispatch } from "react-redux";
import { useColorScheme } from "../../../lib/useColorScheme";
import Modal from "../modal";
import ContextMenu from "../context-menu";
import FeIcon from "react-native-vector-icons/Feather";
import MdIcon from "react-native-vector-icons/MaterialCommunityIcons";
import { SocketContext } from "../../contexts/socket.context";
import { MediasoupContext } from "../../contexts/mediasoup.context";
import { setMe } from "../../redux/userSlice";
import useSelectedRoom from "../../hooks/use-selected-room";
import getFullName from "../../utils/getFullName";
import UserImage from "../user-image";
import { isRoomOwner } from "../../utils/permissions";
import logger from "../../utils/logger";

/**
 * Call Settings Popup - For configuring DEFAULT call settings
 * These settings will be copied to Call.callSettings when starting a new call
 * Updates User.privacySettings.defaultCallSettings
 */
const CallSettingsPopup = ({ showModal, setShowModal }) => {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  const { user: currentUser } = useSelector((state) => state.users);
  const { socket: currentSocket } = useContext(SocketContext);
  const { callId, roomId: activeCallRoomId } = useContext(MediasoupContext);
  const dispatch = useDispatch();
  const room = useSelectedRoom();
  const roomId = room?._id;
  const roomActiveCallId = room?.activeCallId;

  const [callSettingsData, setCallSettingsData] = useState({});
  const [resolvedCallId, setResolvedCallId] = useState(null);

  // ✅ Check if current user is owner (only owner can modify call settings)
  const isOwner = useMemo(() => {
    return isRoomOwner(currentUser?._id, room);
  }, [currentUser?._id, room]);

  // ✅ Only owner can modify call settings in groups
  const canModify = useMemo(() => {
    // If not a group, everyone can modify their own settings
    if (!room?.isGroup) return true;
    // In groups, only owner can modify
    return isOwner;
  }, [room?.isGroup, isOwner]);

  /** Stable string so useEffect does not re-run on every new object reference from Redux */
  const defaultCallSettingsSignature = useMemo(() => {
    const d = currentUser?.privacySettings?.defaultCallSettings;
    if (!d) return "";
    try {
      return JSON.stringify(d);
    } catch {
      return "";
    }
  }, [currentUser?.privacySettings?.defaultCallSettings]);

  const isGroupRoom = useMemo(
    () => !!room?.isGroup,
    [room?._id, room?.isGroup]
  );

  const socketRef = useRef(currentSocket);
  socketRef.current = currentSocket;
  const lastCallSettingsLoadKeyRef = useRef("");

  // Load call settings when modal opens
  // ✅ If there's an active call, fetch settings from Call.callSettings
  // Otherwise, use User.privacySettings.defaultCallSettings
  useEffect(() => {
    if (!showModal) {
      lastCallSettingsLoadKeyRef.current = "";
      return;
    }

    if (!room?.hasActiveCall && !roomActiveCallId) {
      setResolvedCallId(null);
    }

    const roomIdStr = roomId != null ? String(roomId) : "";
    const effectiveCallId = callId || roomActiveCallId || resolvedCallId;
    const activeRoomMatch =
      !!effectiveCallId &&
      (activeCallRoomId === roomId ||
        String(activeCallRoomId ?? "") === String(roomId ?? ""));
    const loadSourceSignature = activeRoomMatch
      ? "__active_call_source__"
      : defaultCallSettingsSignature;


    const sock = socketRef.current;
    const loadKey = [
      roomIdStr,
      String(effectiveCallId ?? ""),
      String(activeCallRoomId ?? ""),
      loadSourceSignature,
      isGroupRoom ? "1" : "0",
      sock?.id ?? "",
      activeRoomMatch ? "call" : "default",
    ].join("|");

    if (lastCallSettingsLoadKeyRef.current === loadKey) {
      return;
    }
    lastCallSettingsLoadKeyRef.current = loadKey;

    // Fetch room data to ensure members are loaded
    if (roomId && sock) {
      sock.emit("getOneRoom", { room: roomId, update: false });
    }

    // ✅ If there's an active call in this room, get settings from the call
    if (activeRoomMatch) {
      if (sock) {
        sock.emit("getCallSettings", { callId: effectiveCallId }, (response) => {
          if (response?.callSettings) {
            const callSettings = response.callSettings;
            const convertedSettings = {};

            Object.keys(callSettings).forEach((key) => {
              if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
                convertedSettings[key] = callSettings[key];
              } else {
                const value = callSettings[key];
                convertedSettings[key] = Array.isArray(value)
                  ? value
                  : value
                    ? [value]
                    : [];
              }
            });

            setCallSettingsData(convertedSettings);
            logger.debug("callSettings.loadedFromActiveCall", {
              callId: effectiveCallId,
            });
          }
        });
      }
    } else if (room?.isGroup && room?.callSettings && Object.keys(room.callSettings).length > 0) {
      const callSettings = room.callSettings;
      const convertedSettings = {};

      Object.keys(callSettings).forEach((key) => {
        if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
          convertedSettings[key] = callSettings[key];
        } else {
          const value = callSettings[key];
          convertedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
        }
      });

      setCallSettingsData(convertedSettings);
    } else if (roomId && sock && !!room?.hasActiveCall) {
      // Fallback for minimized/in-background call where MediasoupContext callId is stale/empty
      sock.emit("getCallSettings", { roomId }, (response) => {
        const fetchedCallId = response?.callId;
        const fetchedSettings = response?.callSettings;
        if (fetchedCallId && fetchedSettings) {
          setResolvedCallId(fetchedCallId);
          const convertedSettings = {};
          Object.keys(fetchedSettings).forEach((key) => {
            if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
              convertedSettings[key] = fetchedSettings[key];
            } else {
              const value = fetchedSettings[key];
              convertedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
            }
          });
          setCallSettingsData(convertedSettings);
          return;
        }

        // Active-call lookup failed; fetch authoritative room-level settings from server.
        sock.emit("getRoomCallSettings", { roomId }, (roomSettingsResponse) => {
          const roomSettings = roomSettingsResponse?.callSettings;
          const roomSettingsKeys = Object.keys(roomSettings || {});

          if (roomSettingsKeys.length > 0) {
            const convertedSettings = {};
            roomSettingsKeys.forEach((key) => {
              if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
                convertedSettings[key] = roomSettings[key];
              } else {
                const value = roomSettings[key];
                convertedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
              }
            });
            setCallSettingsData(convertedSettings);
            return;
          }

          // Last fallback: user default settings
          if (currentUser?.privacySettings?.defaultCallSettings) {
            const convertedSettings = {};
            Object.keys(currentUser.privacySettings.defaultCallSettings).forEach((key) => {
              if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
                convertedSettings[key] = currentUser.privacySettings.defaultCallSettings[key];
              } else {
                const value = currentUser.privacySettings.defaultCallSettings[key];
                convertedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
              }
            });
            setCallSettingsData(convertedSettings);
          }
        });
      });
    } else if (currentUser?.privacySettings?.defaultCallSettings) {
      // ✅ No active call, load from User.privacySettings.defaultCallSettings
      const callSettings = currentUser.privacySettings.defaultCallSettings;
      const convertedSettings = {};

      Object.keys(callSettings).forEach((key) => {
        if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
          convertedSettings[key] = callSettings[key];
        } else {
          const value = callSettings[key];
          convertedSettings[key] = Array.isArray(value)
            ? value
            : value
              ? [value]
              : [];
        }
      });

      setCallSettingsData(convertedSettings);
    }
  }, [
    showModal,
    roomId,
    callId,
    roomActiveCallId,
    resolvedCallId,
    activeCallRoomId,
    room?.hasActiveCall,
    defaultCallSettingsSignature,
    isGroupRoom,
  ]);

  const emitCallSettingsUpdate = useCallback(
    (updatedSettings) => {
      if (!currentUser || !currentSocket) {
        logger.warn("callSettings.updateSkipped", {
          reason: "missing_required_data",
          roomId: room?._id ? String(room._id) : null,
        });
        return;
      }

      setCallSettingsData(updatedSettings);

      // ✅ Keep local defaults in sync
      dispatch(
        setMe({
          ...currentUser,
          privacySettings: {
            ...currentUser.privacySettings,
            defaultCallSettings: updatedSettings,
          },
        })
      );

      try {
        const effectiveCallId = callId || roomActiveCallId || resolvedCallId;
        currentSocket.emit("updateDefaultCallSettings", {
          callSettings: updatedSettings,
          userId: currentUser._id,
          roomId: room?.isGroup ? roomId : undefined,
        });

        const inActiveCallContext =
          activeCallRoomId === roomId ||
          room?._id?.toString() === activeCallRoomId?.toString() ||
          (room?.hasActiveCall &&
            String(room?.activeCallId ?? "") === String(effectiveCallId));

        if (effectiveCallId && inActiveCallContext) {
          currentSocket.emit("updateCallSettings", {
            callId: effectiveCallId,
            roomId: roomId || activeCallRoomId,
            callSettings: updatedSettings,
            userId: currentUser._id,
          });
        }
      } catch (error) {
        logger.error("callSettings.emitFailed", error);
        setCallSettingsData(callSettingsData);
        dispatch(
          setMe({
            ...currentUser,
            privacySettings: {
              ...currentUser.privacySettings,
              defaultCallSettings: callSettingsData,
            },
          })
        );
      }
    },
    [
      activeCallRoomId,
      callId,
      callSettingsData,
      currentSocket,
      currentUser,
      dispatch,
      resolvedCallId,
      room,
      roomActiveCallId,
      roomId,
    ]
  );

  // Update default call settings
  const updateCallSettings = useCallback((setting, value, allowedUsers = null) => {
    if (!canModify) {
      logger.warn("callSettings.updateSkipped", {
        reason: "unauthorized",
        roomId: room?._id ? String(room._id) : null,
        userId: currentUser?._id ? String(currentUser._id) : null,
      });
      return;
    }

    if (!currentUser || !currentSocket) {
      logger.warn("callSettings.updateSkipped", {
        reason: "missing_required_data",
        roomId: room?._id ? String(room._id) : null,
      });
      return;
    }

    const currentValue = callSettingsData?.[setting] || [];
    const currentArray = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []);
    const currentAllowedUsersRaw = callSettingsData?.[`${setting}AllowedUsers`] || [];
    const currentAllowedUsers = Array.isArray(currentAllowedUsersRaw)
      ? currentAllowedUsersRaw
      : currentAllowedUsersRaw
        ? [currentAllowedUsersRaw]
        : [];
    const currentExceptUsersRaw = callSettingsData?.[`${setting}ExceptUsers`] || [];
    const currentExceptUsers = Array.isArray(currentExceptUsersRaw)
      ? currentExceptUsersRaw
      : currentExceptUsersRaw
        ? [currentExceptUsersRaw]
        : [];
    
    const finalAllowedUsers = allowedUsers !== null ? allowedUsers : currentAllowedUsers;
    
    let updatedArray;
    
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
      ...callSettingsData,
      [setting]: updatedArray,
    };
    
    if (value === "everyone" || value === "noOne") {
      updatedSettings[`${setting}AllowedUsers`] = [];
      updatedSettings[`${setting}ExceptUsers`] = []; // ✅ Clear exceptions when switching to everyone/noOne
    } else if (value === "specific") {
      updatedSettings[`${setting}AllowedUsers`] =
        allowedUsers !== null
          ? (Array.isArray(allowedUsers) ? allowedUsers : [allowedUsers])
          : currentAllowedUsers;
      // "Specific" mode should not keep stale exclusions from "Everyone Except"
      updatedSettings[`${setting}ExceptUsers`] = [];
    } else {
      // For admin/moderator/friends, clear stale user-scoped lists.
      updatedSettings[`${setting}AllowedUsers`] = [];
      updatedSettings[`${setting}ExceptUsers`] = [];
    }
    
    emitCallSettingsUpdate(updatedSettings);
  }, [callSettingsData, canModify, currentSocket, currentUser, emitCallSettingsUpdate]);

  // ✅ Listen for call settings updates (real-time sync)
  useEffect(() => {
    if (!currentSocket || !currentUser?._id) return;

    // ✅ Listen for updates from active call
    const handleCallSettingsUpdated = ({ callId: updatedCallId, callSettings, updatedBy }) => {
      const normalizedIncomingCallId = String(updatedCallId ?? "");
      const normalizedCurrentCallId = String(callId || roomActiveCallId || "");
      logger.debug("callSettings.updated", {
        callId: updatedCallId,
        updatedBy,
      });

      // Update local state if it's for the current call
      if (normalizedCurrentCallId && normalizedIncomingCallId === normalizedCurrentCallId) {
        const convertedSettings = {};
        Object.keys(callSettings || {}).forEach((key) => {
          if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
            convertedSettings[key] = callSettings[key];
          } else {
            const value = callSettings[key];
            convertedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
          }
        });
        setCallSettingsData(convertedSettings);
      } else if (!normalizedCurrentCallId && normalizedIncomingCallId) {
        setResolvedCallId(updatedCallId);
        const convertedSettings = {};
        Object.keys(callSettings || {}).forEach((key) => {
          if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
            convertedSettings[key] = callSettings[key];
          } else {
            const value = callSettings[key];
            convertedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
          }
        });
        setCallSettingsData(convertedSettings);
      } else {
      }
    };

    // ✅ Listen for updates to default settings (when not in a call)
    const handleDefaultCallSettingsUpdated = ({ userId, callSettings }) => {
      if (!callId && (userId === currentUser?._id?.toString() || userId === currentUser?._id)) {
        const convertedSettings = {};
        Object.keys(callSettings || {}).forEach((key) => {
          if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
            convertedSettings[key] = callSettings[key];
          } else {
            const value = callSettings[key];
            convertedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
          }
        });
        setCallSettingsData(convertedSettings);
        
        // Also update Redux
        dispatch(setMe({
          ...currentUser,
          privacySettings: {
            ...currentUser.privacySettings,
            defaultCallSettings: callSettings,
          },
        }));
      }
    };

    const handleRoomCallSettingsUpdated = ({ roomId: updatedRoomId, callSettings }) => {
      const isSameRoom = String(updatedRoomId ?? "") === String(roomId ?? "");
      const hasActiveForThisRoom =
        String(activeCallRoomId ?? "") === String(roomId ?? "") &&
        !!(callId || roomActiveCallId || resolvedCallId);
      if (!isSameRoom || hasActiveForThisRoom) {
        return;
      }

      const convertedSettings = {};
      Object.keys(callSettings || {}).forEach((key) => {
        if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
          convertedSettings[key] = callSettings[key];
        } else {
          const value = callSettings[key];
          convertedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
        }
      });
      setCallSettingsData(convertedSettings);
    };

    currentSocket.on("callSettingsUpdated", handleCallSettingsUpdated);
    currentSocket.on("defaultCallSettingsUpdated", handleDefaultCallSettingsUpdated);
    currentSocket.on("roomCallSettingsUpdated", handleRoomCallSettingsUpdated);

    return () => {
      currentSocket.off("callSettingsUpdated", handleCallSettingsUpdated);
      currentSocket.off("defaultCallSettingsUpdated", handleDefaultCallSettingsUpdated);
      currentSocket.off("roomCallSettingsUpdated", handleRoomCallSettingsUpdated);
    };
  }, [currentSocket, currentUser, dispatch, callId, roomActiveCallId, resolvedCallId, roomId]);

  // Get display text for setting
  const getSettingDisplayText = useCallback((setting) => {
    const value = callSettingsData?.[setting] || [];
    const valueArray = Array.isArray(value) ? value : (value ? [value] : []);
    const exceptUsers = callSettingsData?.[`${setting}ExceptUsers`] || [];
    
    if (valueArray.length === 0) {
      return t("callSettingsScreen.items.everyone");
    }
    
    // ✅ Check if "Everyone Except" is active
    if (valueArray.includes("everyone") && exceptUsers.length > 0) {
      const exceptLabel = t("callSettingsScreen.items.everyoneExcept") || "Everyone Except";
      return `${exceptLabel} (${exceptUsers.length})`;
    }
    
    const labels = valueArray.map(v => {
      switch(v) {
        case "everyone": return t("callSettingsScreen.items.everyone");
        case "admin": return t("callSettingsScreen.items.admin");
        case "moderator": return t("callSettingsScreen.items.moderator");
        case "friends": return t("callSettingsScreen.items.friends");
        case "specific": return t("callSettingsScreen.items.specific");
        case "noOne": return t("callSettingsScreen.items.noOne");
        default: return v;
      }
    });
    
    return labels.join(", ");
  }, [callSettingsData, t, room?.members]);

  // Create call settings options
  const createCallSettingsOptions = useCallback((setting) => {
    const currentValue = callSettingsData?.[setting] || [];
    const currentArray = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []);
    const allowedUsers = callSettingsData?.[`${setting}AllowedUsers`] || [];
    const exceptUsers = callSettingsData?.[`${setting}ExceptUsers`] || [];
    
    // Get room members for "specific" option
    const roomMembers = room?.members || [];
    
    return [
      {
        name: t("callSettingsScreen.items.everyone"),
        selected: currentArray.includes("everyone") && exceptUsers.length === 0,
        keepOpen: true,
        onPress: () => updateCallSettings(setting, "everyone", null),
      },
      {
        name: t("callSettingsScreen.items.admin"),
        selected: currentArray.includes("admin"),
        keepOpen: true,
        onPress: () => updateCallSettings(setting, "admin", null),
      },
      {
        name: t("callSettingsScreen.items.moderator"),
        selected: currentArray.includes("moderator"),
        keepOpen: true,
        onPress: () => updateCallSettings(setting, "moderator", null),
      },
      {
        name: t("callSettingsScreen.items.friends"),
        selected: currentArray.includes("friends"),
        keepOpen: true,
        onPress: () => updateCallSettings(setting, "friends", null),
      },
      {
        name: t("callSettingsScreen.items.specific"),
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
            updateCallSettings(setting, "specific", newAllowed);
          },
        })) : [
          {
            name: t("callSettingsScreen.noMembers") || "No members in this room",
            disabled: true,
            onPress: () => {},
          }
        ],
      },
      // ✅ "Everyone Except" - allows everyone except selected users
      {
        name: t("callSettingsScreen.items.everyoneExcept") || "Everyone Except",
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
                const rawExcept = callSettingsData?.[`${setting}ExceptUsers`] || [];
                const currentExceptUsers = Array.isArray(rawExcept)
                  ? rawExcept
                  : rawExcept
                    ? [rawExcept]
                    : [];
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
                  ...callSettingsData,
                  [setting]: ["everyone"],
                  [`${setting}AllowedUsers`]: [],
                  [`${setting}ExceptUsers`]: newExceptUsers,
                };
                emitCallSettingsUpdate(updatedSettings);
              },
            };
          }) : [
          {
            name: t("callSettingsScreen.noMembers") || "No members in this room",
            disabled: true,
            onPress: () => {},
          }
        ],
      },
      {
        name: t("callSettingsScreen.items.noOne"),
        selected: currentArray.includes("noOne"),
        keepOpen: true,
        onPress: () => updateCallSettings(setting, "noOne", null),
      },
    ];
  }, [callSettingsData, room?.members, t, updateCallSettings, emitCallSettingsUpdate]);

  return (
    <Modal
      showModal={showModal}
      setShowModal={setShowModal}
      opacity="70"
      animationType="slide"
    >
      <View
        className={`w-11/12 linker-w rounded-2xl pt-4 px-4 pb-4 ${
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
            {t("callSettingsScreen.title") || "Call Settings"}
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

        {/* ✅ Info message for non-owners in group chats */}
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
                {t("callSettingsScreen.readOnlyInfo") || "These settings are view-only. Only room owner can modify them."}
              </Text>
            </View>
          </View>
        )}

        {/* Call Settings List */}
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View className="gap-y-6">
            {/* Screen Share Permission */}
            <View className={`p-4 rounded-xl ${
              isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
            }`}>
              <View className="flex-row items-center gap-x-3 mb-3">
                <View className={`p-2 rounded-lg ${
                  isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                }`}>
                  <MdIcon
                    name="monitor-share"
                    size={20}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  />
                </View>
                <Text className={`text-base font-semibold ${
                  isDarkColorScheme ? "text-papaya" : "text-placeholder"
                }`}>
                  {t("callSettingsScreen.fields.screenShare")}
                </Text>
              </View>
              {canModify ? (
                <ContextMenu
                  width={200}
                  placement="bottom"
                  px="px-2"
                  menuClassName="rounded-xl"
                  itemClassName="rounded-lg"
                  options={createCallSettingsOptions("screenShare")}
                >
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    }`}
                  >
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("screenShare")}
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
                      {getSettingDisplayText("screenShare")}
                    </Text>
                  </View>
                  <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                    {t("settings.lockedByOwner") || "Owner only"}
                  </Text>
                </View>
              )}
            </View>
            
            {/* Recording Permission */}
            <View className={`p-4 rounded-xl ${
              isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
            }`}>
              <View className="flex-row items-center gap-x-3 mb-3">
                <View className={`p-2 rounded-lg ${
                  isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                }`}>
                  <FeIcon
                    name="circle"
                    size={20}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  />
                </View>
                <Text className={`text-base font-semibold ${
                  isDarkColorScheme ? "text-papaya" : "text-placeholder"
                }`}>
                  {t("callSettingsScreen.fields.recording")}
                </Text>
              </View>
              {canModify ? (
                <ContextMenu
                  width={200}
                  placement="bottom"
                  px="px-2"
                  menuClassName="rounded-xl"
                  itemClassName="rounded-lg"
                  options={createCallSettingsOptions("recording")}
                >
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    }`}
                  >
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("recording")}
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
                      {getSettingDisplayText("recording")}
                    </Text>
                  </View>
                  <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                    {t("settings.lockedByOwner") || "Owner only"}
                  </Text>
                </View>
              )}
            </View>
            
            {/* Call Transfer Permission */}
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
                  {t("callSettingsScreen.fields.callTransfer")}
                </Text>
              </View>
              {canModify ? (
                <ContextMenu
                  width={200}
                  placement="bottom"
                  px="px-2"
                  menuClassName="rounded-xl"
                  itemClassName="rounded-lg"
                  options={createCallSettingsOptions("callTransfer")}
                >
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    }`}
                  >
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("callTransfer")}
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
                      {getSettingDisplayText("callTransfer")}
                    </Text>
                  </View>
                  <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                    {t("settings.lockedByOwner") || "Owner only"}
                  </Text>
                </View>
              )}
            </View>
            
            {/* Live Stream Permission */}
            <View className={`p-4 rounded-xl ${
              isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
            }`}>
              <View className="flex-row items-center gap-x-3 mb-3">
                <View className={`p-2 rounded-lg ${
                  isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                }`}>
                  <FeIcon
                    name="radio"
                    size={20}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  />
                </View>
                <Text className={`text-base font-semibold ${
                  isDarkColorScheme ? "text-papaya" : "text-placeholder"
                }`}>
                  {t("callSettingsScreen.fields.liveStream")}
                </Text>
              </View>
              {canModify ? (
                <ContextMenu
                  width={200}
                  placement="bottom"
                  px="px-2"
                  menuClassName="rounded-xl"
                  itemClassName="rounded-lg"
                  options={createCallSettingsOptions("liveStream")}
                >
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    }`}
                  >
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("liveStream")}
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
                      {getSettingDisplayText("liveStream")}
                    </Text>
                  </View>
                  <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                    {t("settings.lockedByOwner") || "Owner only"}
                  </Text>
                </View>
              )}
            </View>
            
            {/* Mute Others Permission */}
            <View className={`p-4 rounded-xl ${
              isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
            }`}>
              <View className="flex-row items-center gap-x-3 mb-3">
                <View className={`p-2 rounded-lg ${
                  isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                }`}>
                  <FeIcon
                    name="mic-off"
                    size={20}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  />
                </View>
                <Text className={`text-base font-semibold ${
                  isDarkColorScheme ? "text-papaya" : "text-placeholder"
                }`}>
                  {t("callSettingsScreen.fields.muteOthers") || "Mute Others"}
                </Text>
              </View>
              {canModify ? (
                <ContextMenu
                  width={200}
                  placement="bottom"
                  px="px-2"
                  menuClassName="rounded-xl"
                  itemClassName="rounded-lg"
                  options={createCallSettingsOptions("muteOthers")}
                >
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    }`}
                  >
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("muteOthers")}
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
                      {getSettingDisplayText("muteOthers")}
                    </Text>
                  </View>
                  <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                    {t("settings.lockedByOwner") || "Owner only"}
                  </Text>
                </View>
              )}
            </View>
            
            {/* Kick from Call Permission */}
            <View className={`p-4 rounded-xl ${
              isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
            }`}>
              <View className="flex-row items-center gap-x-3 mb-3">
                <View className={`p-2 rounded-lg ${
                  isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                }`}>
                  <FeIcon
                    name="user-x"
                    size={20}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  />
                </View>
                <Text className={`text-base font-semibold ${
                  isDarkColorScheme ? "text-papaya" : "text-placeholder"
                }`}>
                  {t("callSettingsScreen.fields.kickFromCall") || "Kick from Call"}
                </Text>
              </View>
              {canModify ? (
                <ContextMenu
                  width={200}
                  placement="bottom"
                  px="px-2"
                  menuClassName="rounded-xl"
                  itemClassName="rounded-lg"
                  options={createCallSettingsOptions("kickFromCall")}
                >
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    }`}
                  >
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("kickFromCall")}
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
                      {getSettingDisplayText("kickFromCall")}
                    </Text>
                  </View>
                  <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                    {t("settings.lockedByOwner") || "Owner only"}
                  </Text>
                </View>
              )}
            </View>
            
            {/* End Call for All Permission */}
            <View className={`p-4 rounded-xl ${
              isDarkColorScheme ? "bg-slate-800/30" : "bg-slate-50"
            }`}>
              <View className="flex-row items-center gap-x-3 mb-3">
                <View className={`p-2 rounded-lg ${
                  isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                }`}>
                  <FeIcon
                    name="phone-off"
                    size={20}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  />
                </View>
                <Text className={`text-base font-semibold ${
                  isDarkColorScheme ? "text-papaya" : "text-placeholder"
                }`}>
                  {t("callSettingsScreen.fields.endCallForAll") || "End Call for All"}
                </Text>
              </View>
              {canModify ? (
                <ContextMenu
                  width={200}
                  placement="bottom"
                  px="px-2"
                  menuClassName="rounded-xl"
                  itemClassName="rounded-lg"
                  options={createCallSettingsOptions("endCallForAll")}
                >
                  <View
                    className={`flex-row items-center justify-between p-3 rounded-lg ${
                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                    }`}
                  >
                    <Text className="text-placeholder dark:text-papaya">
                      {getSettingDisplayText("endCallForAll")}
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
                      {getSettingDisplayText("endCallForAll")}
                    </Text>
                  </View>
                  <Text className={`text-xs ${isDarkColorScheme ? "text-slate-500" : "text-slate-400"}`}>
                    {t("settings.lockedByOwner") || "Owner only"}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

export default CallSettingsPopup;
