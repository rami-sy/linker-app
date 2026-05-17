import React, { useCallback } from "react";
import {
  View,
  TouchableOpacity,
  Platform,
} from "react-native";
import FeIcon from "react-native-vector-icons/Feather";
import LocationIcon from "../../../assets/icons/location-icon";
import Modal from "../modal";
import { useColorScheme } from "../../../lib/useColorScheme";

const ATTACHMENT_OPTIONS = [
  { type: "camera", icon: "camera", action: "toggleCamera", bg: "bg-rose-700" },
  { type: "image", icon: "image", action: "pickFile", bg: "bg-purple-700" },
  { type: "video", icon: "video", action: "pickFile", bg: "bg-indigo-700" },
  {
    type: "document",
    icon: "file-text",
    action: "pickFile",
    bg: "bg-emerald-700",
  },
  {
    type: "audio",
    icon: "headphones",
    action: "pickFile",
    bg: "bg-amber-700",
  },

  {
    type: "location",
    icon: LocationIcon,
    action: "showLocationPicker",
    bg: "bg-teal-700",
  },
];

const ShowAttachment = ({
  pickFile,
  setShowAttachment,
  toggleCamera,
  setToggleCamera,
  setShowLocationPicker,
  showAttachment,
}) => {
  const { isDarkColorScheme } = useColorScheme();

  // Note: Permission checks are now handled at the footer level with canSend
  // If this component is rendered, the user has permission to send all types of content
  const handleOptionPress = useCallback(
    (option) => {
      setShowAttachment(false);
      if (option.action === "toggleCamera") {
        setToggleCamera((prev) => !prev);
      } else if (option.action === "pickFile") {
        pickFile(option.type);
      } else if (option.action === "showLocationPicker") {
        setShowLocationPicker(true);
      }
    },
    [setShowAttachment, setToggleCamera, pickFile, setShowLocationPicker]
  );

  return (
    <Modal
      showModal={showAttachment}
      setShowModal={setShowAttachment}
      onCancel={() => setShowAttachment(false)}
      opacity="50"
      animationType="fade"
    >
      <View
        style={{
          width: "100%",
          position: "absolute",
          bottom: Platform.OS === "web" ? 88 : 24,
          paddingHorizontal: 16,
        }}
      >
        <View
          className="flex-row flex-wrap justify-start p-3 bg-chatSurfaceLight dark:bg-chatSurfaceDark rounded-2xl border border-slate-200 dark:border-slate-700"
          style={{
            maxWidth: Platform.OS === "web" ? 760 : undefined,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {ATTACHMENT_OPTIONS.map((option) => {
            return (
              <TouchableOpacity
                key={option.type}
                onPress={() => handleOptionPress(option)}
                className={`flex items-center justify-center px-2 py-2 m-2 rounded-full ${option.bg} w-14 h-14`}
                accessibilityLabel={`Attach ${option.type}`}
              >
                {option.icon === LocationIcon ? (
                  <LocationIcon width={25} height={25} />
                ) : (
                  <FeIcon name={option.icon} size={30} color="#fff" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
};

export default React.memo(ShowAttachment);
