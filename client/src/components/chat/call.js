// CallScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Platform, TouchableOpacity, Text } from "react-native";
import { RTCView } from "./web-rtc";
import { useWebRTC } from "../../hooks/use-web-rtc";
import { UserImage, UserName } from "../user";
import FeIcon from "react-native-vector-icons/Feather";
import Icon from "react-native-vector-icons/Ionicons";
import MDIcon from "react-native-vector-icons/MaterialIcons";
import IconButton from "../icon-button";
import { useDispatch, useSelector } from "react-redux";
import SpeakerIcon from "../../../assets/icons/speaker-icon";
import SpeakerFullActiveIcon from "../../../assets/icons/speaker-full-active-icon";
import MinimizeIcon from "../../../assets/icons/minimize-icon";
import Timer from "./timer";
import ImagePlaceholder from "../image-placeholder";
import { setIsMinimized } from "../../redux/callSlice";
import { useColorScheme } from "../../../lib/useColorScheme";

const CallScreen = () => {
  const { user: currentUser } = useSelector((state) => state.users);
  const dispatch = useDispatch();
  const {
    acceptCall = null,
    rejectCall,
    closeRoom,
    endCall,
    toggleMic,
    toggleCamera,
    switchCamera, // Function to switch camera
    toggleSpeaker,
    isMicOn,
  } = useWebRTC();
  const {
    callStatus,
    isSpeakerOn,
    callerSignal,
    callerUser,
    room,
    isVideoCall,
    isFrontCamera,
    localStream,
    remoteStreams,
    isMinimized,
  } = useSelector((state) => state.calls);
  const { isDarkColorScheme } = useColorScheme();
  const [isGroupCall, setIsGroupCall] = useState(false);
  const remoteUsers = Object.values(remoteStreams);

  useEffect(() => {
    setIsGroupCall(remoteUsers?.length > 1);
  }, [remoteUsers]);

  const minimizeCall = () => {
    dispatch(setIsMinimized(true));
  };
  const maximizeCall = () => {
    dispatch(setIsMinimized(false));
  };
  if (callStatus === "idle") return null;

  if (isMinimized) {
    return (
      <TouchableOpacity
        className="flex-row items-center justify-between w-full h-16 pl-12 overflow-hidden border-b-2 border-emerald-600"
        onPress={maximizeCall}
      >
        <View className="flex flex-row items-center justify-start w-full h-full p-2">
          {isGroupCall ? (
            <ImagePlaceholder
              size="h-10 w-10"
              border="border-0"
              roomName={room?.name ?? "Group Chat"}
              isGroup
            />
          ) : (
            remoteUsers?.[0]?.user && (
              <UserImage
                size="h-10 w-10"
                user={remoteUsers?.[0]?.user}
                showStatus={false}
                text="text-base font-bold"
                border={false}
              />
            )
          )}

          <Text
            className="mx-1 text-sm text-placeholder dark:text-papaya"
          >
            {callStatus === "incoming"
              ? "Incoming Call"
              : callStatus === "busy"
              ? "User is currently busy on another call."
              : callStatus === "calling"
              ? "Calling "
              : callStatus === "ringing"
              ? "Ringing "
              : "Call in progress"}
          </Text>
        </View>

        <Timer callStatus={callStatus} />
        <IconButton
          iconName="call"
          iconComponent={Icon}
          size={25}
          className="absolute right-0 w-10 h-10 bg-[#ef233c]/90 rotate-[135deg]"
          onPress={() => {
            endCall({
              room: room,
            });
          }}
        />
        <IconButton
          iconName={isMicOn ? "mic" : "mic-off"}
          iconComponent={FeIcon}
          size={25}
          className="absolute w-10 h-10 right-14 bg-[#0a97b9]/90"
          onPress={() => {
            toggleMic({ room, user: currentUser });
          }}
        />
      </TouchableOpacity>
    );
  }
  return (
    <View
      className={`flex-1 w-full h-screen overflow-y-auto items-center absolute top-0 left-0 z-10 bg-main`}
    >
      <TouchableOpacity
        className="absolute top-0 right-0 z-10 p-2 m-2 rounded-full bg-placehoder/90"
        onPress={() => {
          minimizeCall();
          if (isVideoCall) {
            toggleCamera({
              room: room,
              user: currentUser,
              streamId: localStream?.id,
            });
          }
        }}
      >
        <MinimizeIcon />
      </TouchableOpacity>
      {(callStatus === "calling" ||
        callStatus === "connecting" ||
        callStatus === "ringing" ||
        callStatus === "busy") && (
        <View className="relative z-10 flex flex-col items-center justify-center h-full">
          {isGroupCall ? (
            <ImagePlaceholder
              size="h-24 w-24"
              border="border-0"
              roomName={room?.name ?? "Group Chat"}
              isGroup
              iconSize={45}
            />
          ) : (
            remoteUsers?.[0]?.user && (
              <UserImage
                size="h-24 w-24"
                user={remoteUsers?.[0]?.user}
                showStatus={false}
                text="text-3xl font-bold"
              />
            )
          )}
          {callStatus !== "busy" &&
            (isGroupCall ? (
              <Text className="text-base font-semibold text-center text-slate-100">
                {room?.name ?? "Group Chat"}
              </Text>
            ) : (
              remoteUsers?.[0]?.user && (
                <UserName
                  className="text-base font-semibold text-center text-slate-100"
                  user={remoteUsers?.[0]?.user}
                  onlyFirst={true}
                />
              )
            ))}
          <View className="flex flex-row items-center justify-center mt-3 gap-x-2">
            <Text className={`text-base text-slate-200`}>
              {callStatus === "busy"
                ? "User is currently busy on another call."
                : callStatus === "calling"
                ? "Calling "
                : callStatus === "ringing"
                ? "Ringing "
                : "Connecting"}
            </Text>
          </View>
        </View>
      )}
      {callStatus === "incoming" && (
        <View className="relative z-10 flex flex-col items-center justify-center h-full">
          {isGroupCall || room?.isGroup ? (
            <ImagePlaceholder
              size="h-24 w-24"
              border="border-0"
              roomName={room?.name ?? "Group Chat"}
              isGroup
              iconSize={45}
            />
          ) : (
            <UserImage
              size="h-24 w-24"
              user={callerUser}
              showStatus={false}
              text="text-3xl font-bold"
            />
          )}
          <View className="flex flex-row items-center justify-center mt-3 gap-x-2">
            <Text className="text-base text-slate-300">
              Incoming{" "}
              <Text className="text-base font-semibold text-center text-slate-100">
                {isVideoCall ? "Video" : "Audio"}
              </Text>{" "}
              call from{" "}
              {isGroupCall || room?.isGroup ? (
                <Text className="text-base font-semibold text-center text-slate-100">
                  {room?.name ?? "Group Chat"}
                </Text>
              ) : (
                <UserName
                  className="text-base font-semibold text-center text-slate-100"
                  user={callerUser}
                  onlyFirst={true}
                />
              )}
            </Text>
          </View>
          <View className="absolute z-10 flex flex-row items-center justify-center bottom-10">
            <TouchableOpacity
              className="flex items-center justify-center p-3 mx-2 rounded-full w-14 h-14 bg-emerald-600 text-papaya"
              onPress={() => {
                acceptCall &&
                  acceptCall({
                    user: currentUser,
                    room: room,
                    signal: callerSignal,
                    callerUser,
                    isVideoCall,
                  });
              }}
            >
              <Icon
                name="call"
                size={35}
                color="#dee4e6"
              />
            </TouchableOpacity>
            <TouchableOpacity
              className="flex items-center justify-center p-3 mx-2 rounded-full w-14 h-14 bg-[#ef233c] text-papaya"
              onPress={() => {
                rejectCall({
                  room: room,
                });
              }}
            >
              <Icon
                name="call"
                size={35}
                className="rotate-[135deg]"
                color="#dee4e6"
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <>
        {callStatus === "connected" && (
          <Timer
            callStatus={callStatus}
            className="absolute z-10 top-3 left-1"
          />
        )}

        <View className="absolute z-10 flex flex-row items-center justify-between w-11/12 p-1 rounded-full bottom-10 bg-placehoder">
          {/* Switch Camera */}
          <IconButton
            iconName="flip-camera-android"
            iconComponent={MDIcon}
            size={25}
            className="w-12 h-12 bg-[#0a97b9]/90"
            onPress={() => {
              switchCamera({
                room: room,
                user: currentUser,
                localStream: localStream,
              });
            }}
          />
          <IconButton
            iconName={isMicOn ? "mic" : "mic-off"}
            iconComponent={FeIcon}
            size={25}
            className="w-12 h-12 bg-[#0a97b9]/90"
            onPress={() => {
              toggleMic({ room, user: currentUser });
            }}
          />
          <IconButton
            iconName="call"
            iconComponent={Icon}
            size={30}
            className="w-12 h-12 bg-[#ef233c]/90 rotate-[135deg]"
            onPress={() => {
              endCall({
                room: room,
              });
            }}
          />
          <IconButton
            iconName={isVideoCall ? "camera" : "camera-off"}
            iconComponent={FeIcon}
            size={25}
            className="w-12 h-12 bg-[#0a97b9]/90"
            onPress={() => {
              toggleCamera({
                room: room,
                user: currentUser,
                streamId: localStream?.id,
              });
            }}
          />
          {/* Add Members  */}
          {/* <IconButton
            iconName="user-plus"
            iconComponent={FeIcon}
            size={25}
            className="w-12 h-12 bg-[#0a97b9]/90"
            // onPress={() => {
            //   addMembers({
            //     room: room,
            //   });
            // }}
          /> */}
          <TouchableOpacity
            className={`flex-row items-center justify-center rounded-full w-12 h-12 bg-[#0a97b9]/90`}
            onPress={() => {
              toggleSpeaker();
            }}
          >
            {isSpeakerOn ? <SpeakerFullActiveIcon /> : <SpeakerIcon />}
          </TouchableOpacity>
        </View>
      </>

      <View className="absolute top-0 bottom-0 left-0 right-0 flex-row flex-wrap flex-1 w-full">
        {localStream && (
          <>
            {isVideoCall ? (
              <RTCView
                // className="flex-1 w-full overflow-hidden bg-main"
                className={`overflow-hidden bg-main h-1/2`}
                style={{
                  objectFit: "cover", // تعيين objectFit هنا في style
                  width: remoteUsers?.length + 1 < 3 ? "100%" : "50%",
                  height: remoteUsers?.length + 1 < 2 ? "100%" : "50%",
                  transform: [{ scaleX: isFrontCamera ? -1 : 1 }],
                }}
                mirror={isFrontCamera}
                {...(Platform.OS === "web"
                  ? { stream: localStream }
                  : { streamURL: localStream?.toURL() ?? "" })}
              />
            ) : (
              callStatus === "connected" && (
                <View
                  className={`overflow-hidden bg-main h-1/2 flex items-center justify-start pt-10 border border-[#1e212b]`}
                  style={{
                    objectFit: "cover",
                    width: remoteUsers?.length + 1 < 3 ? "100%" : "50%",
                    height: remoteUsers?.length + 1 < 2 ? "100%" : "50%",
                  }}
                >
                  <UserImage
                    size="h-24 w-24"
                    user={currentUser}
                    showStatus={false}
                    text="text-3xl font-bold"
                  />
                  <UserName
                    className="mt-2 text-base font-semibold text-center text-slate-100"
                    user={currentUser}
                    onlyFirst={true}
                  />
                </View>
              )
            )}
          </>
        )}

        {remoteUsers?.length > 0 &&
          remoteUsers.map(
            ({ stream, user: remoteUser, cameraOff, isFrontCamera }, index) => {
              console.log("Stream URL:", stream?.toURL, remoteUser);
              return (
                <View key={remoteUser?._id || index}>
                  {cameraOff && callStatus === "connected" ? (
                    <View
                      className={`overflow-hidden bg-main h-1/2 flex items-center justify-start pt-10 border border-[#1e212b]`}
                      style={{
                        objectFit: "cover",
                        width: remoteUsers?.length + 1 < 3 ? "100%" : "50%",
                        height: remoteUsers?.length + 1 < 2 ? "100%" : "50%",
                      }}
                    >
                      <UserImage
                        size="h-24 w-24"
                        user={remoteUser}
                        showStatus={false}
                        text="text-3xl font-bold"
                      />
                      <UserName
                        className="mt-2 text-base font-semibold text-center text-slate-100"
                        user={remoteUser}
                        onlyFirst={true}
                      />
                    </View>
                  ) : stream ? (
                    <RTCView
                      className={`overflow-hidden bg-main h-1/2`}
                      style={{
                        objectFit: "cover",
                        width: remoteUsers?.length + 1 < 3 ? "100%" : "50%",
                        transform: [{ scaleX: isFrontCamera ? -1 : 1 }],
                      }}
                      mirror={isFrontCamera}
                      {...(Platform.OS === "web"
                        ? { stream: stream }
                        : { streamURL: stream?.toURL() ?? "" })}
                    />
                  ) : null}
                </View>
              );
            }
          )}
      </View>
    </View>
  );
};

export default CallScreen;
