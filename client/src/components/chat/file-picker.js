import React, { useState, useEffect } from "react";
import { View, Text, Image, ActivityIndicator } from "react-native";

import FeIcon from "react-native-vector-icons/Feather";
import MDIcon from "react-native-vector-icons/MaterialIcons";
import { useVideoPlayer, VideoView } from "expo-video";
import IconButton from "../icon-button";
import { useSelector } from "react-redux";

const FilePicker = ({ uri, setUri }) => {
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const player = useVideoPlayer(uri.uri, (player) => {
    player.loop = false;
  });

  useEffect(() => {
    const subscription = player.addListener("playingChange", (isPlaying) => {
      setIsPlaying(isPlaying);
    });

    return () => {
      subscription.remove();
    };
  }, [player]);

  const renderContent = (isDarkColorScheme) => {
    if (loading) {
      return (
        <View className={`items-center justify-center w-full h-full`}>
          <ActivityIndicator
            size="large"
            color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
          />
        </View>
      );
    }

    if (uri.mimeType.includes("image")) {
      return <Image source={{ uri: uri.uri }} className={`w-full h-full`} />;
    }

    if (uri.mimeType.includes("video")) {
      return (
        <View className={`relative w-full h-full bg-black`}>
          <VideoView
            className={`w-full h-full bg-black`}
            player={player}
            allowsFullscreen
            allowsPictureInPicture
            nativeControls={false}
          />
          <View
            className={`absolute inset-0 items-center justify-center`}
            style={{ zIndex: 1 }}
          >
            <IconButton
              iconName={isPlaying ? "pause" : "play"}
              iconComponent={FeIcon}
              onPress={() => {
                if (isPlaying) {
                  player.pause();
                } else {
                  player.play();
                }
                setIsPlaying(!isPlaying);
              }}
              size={50}
              className={`w-20 h-20`}
            />
          </View>
        </View>
      );
    }

    if (uri.mimeType.includes("audio")) {
      return (
        <View className={`items-center justify-center w-full h-full`}>
          <FeIcon name="headphones" size={100} color="#dee4e6" />
          <Text className={`mt-4 text-xl text-papaya`}>{uri.name}</Text>
        </View>
      );
    }

    return (
      <View className={`items-center justify-center w-full h-full`}>
        <FeIcon name="file-text" size={100} color="#dee4e6" />
        <Text className={`mt-4 text-xl text-papaya`}>{uri.name}</Text>
      </View>
    );
  };
  const { isDarkColorScheme } = useColorScheme();

  return (
    <>
      <View
        className={`h-full w-full justify-center items-center absolute left-0 right-0 bottom-0 top-[-2px] bg-main`}
      >
        <View
          className={`absolute top-0 left-0 right-0 z-10 flex flex-row items-center justify-between w-full p-3`}
        >
          <IconButton
            onPress={() => {
              setUri(null);
            }}
            iconName="close"
            iconComponent={MDIcon}
          />
        </View>
        {renderContent(isDarkColorScheme)}
      </View>
    </>
  );
};

export default FilePicker;
