import {
  View,
  Text,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Linking,
  Platform,
} from "react-native";
import React from "react";
import AudioPlayer from "../audio-player";

// Import your icons as needed
import PdfIcon from "../../../assets/icons/pdf.svg";
import DocIcon from "../../../assets/icons/doc.svg";
import XlsIcon from "../../../assets/icons/xls.svg";
import TxtIcon from "../../../assets/icons/txt.svg";
import PptXIcon from "../../../assets/icons/pptx.svg";
import PptIcon from "../../../assets/icons/ppt.svg";

import AudioIcon from "../../../assets/icons/audio.svg";
import VideoIcon from "../../../assets/icons/video.svg";
import ZipIcon from "../../../assets/icons/zip.svg";
// import ExeIcon from "../../../assets/icons/exe.svg";
import IsoIcon from "../../../assets/icons/iso.svg";
import ApkIcon from "../../../assets/icons/apk.svg";

import VideoPlayer from "../vedio-player";
import FeIcon from "react-native-vector-icons/Feather";
import CachedImage from "../cached-image";
import Constants from "expo-constants";
import { useSelector } from "react-redux";
import { useColorScheme } from "../../../lib/useColorScheme";
const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;

const resolveMediaUri = (rawPath) => {
  const p = String(rawPath || "");
  if (!p) return "";
  if (/^(https?:|file:)/i.test(p)) return p;
  return `${apiUrl}${p}`;
};

const safeParseContent = (raw) => {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
};

const Render = ({
  message,
  small,
  bg = "bg-black/20",
  rounded = "rounded-2xl",
  setShowImages = () => {},
  onVotePoll = null,
}) => {
  console.log("message", message);

  const content = safeParseContent(message?.content);

  // const mimeTypes = {
  //   jpg: "image/jpeg",
  //   jpeg: "image/jpeg",
  //   png: "image/png",
  //   gif: "image/gif",
  //   pdf: "application/pdf",
  //   webp: "image/webp",
  //   ico: "image/x-icon",
  //   svg: "image/svg+xml",
  //   mp4: "video/mp4",
  //   webm: "audio/webm",
  //   m4a: "audio/mp4",
  //   xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  //   xls: "application/vnd.ms-excel",
  //   doc: "application/msword",
  //   docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  //   ppt: "application/vnd.ms-powerpoint",
  //   pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  //   txt: "text/plain",
  // };

  const { isDarkColorScheme } = useColorScheme();
  const { user } = useSelector((state) => state.users);
  const getFileIconSource = (path) => {
    const extension = path?.split(".")?.pop();
    switch (extension) {
      case "pdf":
        return <PdfIcon width={30} height={30} />;
      case "doc":
      case "docx":
      case "docm":
      case "document":
        return <DocIcon width={30} height={30} />;
      case "xls":
      case "xlsx":
      case "sheet":
        return <ZipIcon width={30} height={30} />;
      case "ppt":
        return <PptIcon width={30} height={30} />;
      case "pptx":
        return <PptXIcon width={30} height={30} />;
      case "txt":
        return <TxtIcon width={30} height={30} />;
      case "mp3":
      case "wav":
      case "ogg":
        return <AudioIcon width={30} height={30} />;
      case "mp4":
      case "mov":
      case "avi":
        return <VideoIcon width={30} height={30} />;
      case "zip":
      case "rar":
      case "7z":
        return <ZipIcon width={30} height={30} />;
      case "exe":
        return <ExeIcon width={30} height={30} />;
      case "iso":
        return <IsoIcon width={30} height={30} />;
      case "apk":
        return <ApkIcon width={30} height={30} />;
      default:
        return <TxtIcon width={30} height={30} />;
    }
  };

  const renderPendingOverlay = () => (
    <View
      className={`absolute top-0 left-0 z-10 right-0 bottom-0 ${rounded} flex items-center justify-center bg-[#2d2d37b0]`}
    >
      <ActivityIndicator size="large" color="#dee4e6" />
    </View>
  );

  switch (message.type) {
    case "poll": {
      const options = Array.isArray(content?.options) ? content.options : [];
      const allowMultiple = Boolean(content?.allowMultiple);
      const totalVotes = options.reduce(
        (sum, option) =>
          sum + (Array.isArray(option?.voterIds) ? option.voterIds.length : 0),
        0
      );
      const myId = String(user?._id || "");
      return (
        <View className={`p-2 ${rounded} rounded-b-none ${bg} relative`}>
          {message.status === "pending" && renderPendingOverlay()}
          {options.map((option, idx) => {
            const sid = String(option?.id != null ? option.id : idx);
            const voters = Array.isArray(option?.voterIds) ? option.voterIds : [];
            const count = voters.length;
            const selected = voters.some((v) => String(v) === myId);
            const pct =
              totalVotes > 0 ? Math.max(4, Math.round((count / totalVotes) * 100)) : 0;
            return (
              <TouchableOpacity
                key={sid}
                className={`mb-2 rounded-xl border ${
                  selected
                    ? "border-sky-500 bg-sky-500/10"
                    : "border-slate-400/30 bg-slate-500/10"
                } px-2 py-2`}
                onPress={() => {
                  if (!onVotePoll || !message?._id) return;
                  onVotePoll({
                    message: message._id,
                    room: message.room,
                    optionId: sid,
                  });
                }}
                disabled={!onVotePoll || !message?._id}
              >
                <View className="flex-row items-center justify-between">
                  <Text
                    className={`text-sm font-medium ${
                      isDarkColorScheme || user?._id === message?.user
                        ? "text-slate-100"
                        : "text-slate-900"
                    }`}
                  >
                    {option?.text || `Option ${idx + 1}`}
                  </Text>
                  <Text className="text-xs text-slate-400">{count}</Text>
                </View>
                {totalVotes > 0 && (
                  <View className="mt-1 h-1.5 rounded-full bg-slate-700/25 overflow-hidden">
                    <View
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${pct}%` }}
                    />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
          <Text className="mt-1 text-[11px] text-slate-400">
            {totalVotes} vote{totalVotes === 1 ? "" : "s"}
            {allowMultiple ? " - multiple choice" : ""}
          </Text>
        </View>
      );
    }
    case "location":
      const { latitude, longitude } = content;
      const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=15&size=600x300&maptype=roadmap&markers=color:red%7Clabel:S%7C${latitude},${longitude}&key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}`;
      const openGoogleMaps = (latitude, longitude) => {
        const url = Platform.select({
          ios: `maps:0,0?q=${latitude},${longitude}`,
          android: `geo:0,0?q=${latitude},${longitude}`,
          default: `https://www.google.com/maps?q=${latitude},${longitude}`,
        });
        Linking.openURL(url);
      };
      return (
        <View
          className={`overflow-hidden ${rounded} relative ${bg} relative rounded-b-none`}
        >
          {message.status === "pending" && renderPendingOverlay()}
          <TouchableOpacity onPress={() => openGoogleMaps(latitude, longitude)}>
            <CachedImage
              source={{ uri: staticMapUrl }}
              style={{
                width: "100%",
                maxWidth: "100%",
                height: 192,
                maxHeight: 192,
              }}
              cacheKey={
                message?.uuId || message?._id || `${staticMapUrl}-${message?.createdAt}`
              } // مفتاح فريد للخريطة
            />
          </TouchableOpacity>
        </View>
      );
    case "image": {
      const cachedImageUri = resolveMediaUri(content.path); // URI الخاص بالصورة

      console.log("cachedImageUri", cachedImageUri);
      return (
        <>
          <TouchableOpacity
            className={`${rounded} ${bg} relative`}
            onPress={() => setShowImages(content.path)}
          >
            {message.status === "pending" && renderPendingOverlay()}
            {cachedImageUri.startsWith("http") ||
            cachedImageUri.startsWith("https") ? (
              <CachedImage
                source={{
                  uri: cachedImageUri, // استخدم الصورة المخزنة
                }}
                cacheKey={
                  message?.uuId ||
                  message?._id ||
                  `${cachedImageUri}-${message?.createdAt}`
                }
                className={`w-full h-48 ${rounded} rounded-b-none`}
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  height: 192,
                  maxHeight: 192,
                  resizeMode: "cover",
                  transform: [{ scaleX: content.type === "front" ? -1 : 1 }],
                }}
              />
            ) : (
              <Image
                source={{ uri: cachedImageUri }}
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  height: 192,
                  maxHeight: 192,
                  resizeMode: "cover",
                  transform: [{ scaleX: content.type === "front" ? -1 : 1 }],
                }}
              />
            )}

            <TouchableOpacity
              className={`absolute top-2 right-2 flex items-center justify-center`} // for download
              onPress={() => Linking.openURL(resolveMediaUri(content.path))}
            >
              <FeIcon
                name="download"
                size={25}
                color={
                  isDarkColorScheme || user?._id === message?.user
                    ? "#dee4e6"
                    : "#2D2D37"
                }
              />
            </TouchableOpacity>
          </TouchableOpacity>
        </>
      );
    }
    case "sticker": {
      const stickerUri = resolveMediaUri(content.path);
      if (!stickerUri) return null;
      return (
        <View className={`${rounded} ${bg} relative p-1`}>
          {message.status === "pending" && renderPendingOverlay()}
          <CachedImage
            source={{ uri: stickerUri }}
            cacheKey={
              message?.uuId || message?._id || `${stickerUri}-${message?.createdAt}`
            }
            className={`${rounded}`}
            style={{
              width: 140,
              height: 140,
              resizeMode: "contain",
            }}
          />
        </View>
      );
    }
    case "video": {
      return (
        <View
          className={`${rounded} rounded-b-none ${bg} relative overflow-hidden`}
        >
          {message.status === "pending" && renderPendingOverlay()}

          <VideoPlayer
            uri={resolveMediaUri(content.path)}
          />
        </View>
      );
    }
    case "audio": {
      return (
        <View
          className={`pt-1 ${rounded} rounded-b-none ${bg} h-16 relative px-2 py-1`}
          style={{
            width: "100%",
            maxWidth: "100%",
          }}
        >
          {content.path && (
            <AudioPlayer
              duration={content.duration}
              uri={resolveMediaUri(content.path)}
              small={small}
              isUser={user?._id === message?.user}
            />
          )}
        </View>
      );
    }
    case "file":
    case "document": {
      return (
        <View
          className={`pt-1 ${rounded} rounded-b-none ${bg} relative px-2 py-1`}
          style={{ height: 64, maxWidth: "100%" }}
        >
          {message.status === "pending" && renderPendingOverlay()}
          <TouchableOpacity
            className={`flex-row items-center justify-between w-full h-full`}
            onPress={() => Linking.openURL(resolveMediaUri(content.path))}
          >
            <View className="flex-row items-center flex-1 mr-2">
              {getFileIconSource(content.path)}
              <Text
                className={`ml-2 text-sm ${
                  isDarkColorScheme || user?._id === message?.user
                    ? "text-slate-100"
                    : "text-slate-900"
                } flex-shrink`}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {message.status === "pending"
                  ? "Uploading..."
                  : content?.originalname || "Unnamed file"}
              </Text>
            </View>
            <FeIcon
              name="download"
              size={25}
              color={
                isDarkColorScheme || user?._id === message?.user
                  ? "#dee4e6"
                  : "#2D2D37"
              }
            />
          </TouchableOpacity>
        </View>
      );
    }
    default:
      return null;
  }
};

const RenderContent = ({
  message,
  small,
  bg,
  rounded,
  setShowImages,
  onVotePoll,
  w = "w-60",
}) => {
  if (!message?.content) return null;

  return (
    <View className={`h-auto ${w}`}>
      <Render
        message={message}
        small={small}
        bg={bg}
        rounded={rounded}
        setShowImages={setShowImages}
        onVotePoll={onVotePoll}
      />
    </View>
  );
};

export default RenderContent;
