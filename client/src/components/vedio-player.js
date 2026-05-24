import React, { useEffect, useState } from "react";
import { View, TouchableOpacity, ActivityIndicator } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import FeIcon from "@expo/vector-icons/Feather";
import IconButton from "./icon-button";
import Slider from "@react-native-community/slider";
import { useColorScheme } from "~/lib/useColorScheme";

const VideoPlayer = ({ uri, shouldPlay = false }) => {
  const [isPlaying, setIsPlaying] = useState(shouldPlay);
  const [showControls, setShowControls] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const player = useVideoPlayer(uri, (player) => {
    player.loop = false;
  });

  useEffect(() => {
    const playingSubscription = player.addListener(
      "playingChange",
      (isPlaying) => {
        setIsPlaying(isPlaying);
        if (isPlaying) {
          setShowControls(true);
          hideControlsAfterDelay();
        }
      }
    );

    const progressSubscription = player.addListener("timeUpdate", (time) => {
      setProgress(time);
    });

    const bufferingSubscription = player.addListener(
      "bufferingChange",
      (isBuffering) => {
        setBuffering(isBuffering);
      }
    );

    const durationSubscription = player.addListener("load", ({ duration }) => {
      setDuration(duration);
    });

    return () => {
      playingSubscription.remove();
      progressSubscription.remove();
      bufferingSubscription.remove();
      durationSubscription.remove();
    };
  }, [player]);

  const hideControlsAfterDelay = () => {
    setTimeout(() => {
      setShowControls(false);
    }, 3000); // Hide controls after 3 seconds
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    setIsPlaying(!isPlaying);
    setShowControls(true);
    hideControlsAfterDelay();
  };

  const handleSliderChange = (value) => {
    player.seekTo(value);
  };

  const { isDarkColorScheme } = useColorScheme();
  return (
    <TouchableOpacity
      activeOpacity={1}
      className={`relative w-full bg-black`}
      onPress={() => setShowControls(!showControls)}
    >
      <VideoView
        className={`h-48 rounded-2xl`}
        style={{
          width: "100%",
          maxWidth: "100%",
          height: 192,
          maxHeight: 192,
          backgroundColor: "#000",
        }}
        player={player}
        allowsFullscreen
        allowsPictureInPicture
        // nativeControls={false}
      />

      {/* Buffering Indicator */}
      {/* {buffering && (
        <View className={`absolute inset-0 items-center justify-center`}>
          <ActivityIndicator size="large" color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
        </View>
      )} */}

      {/* Playback Controls */}
      {/* <View
        className={
          `absolute inset-0 items-center justify-center`
         
        }
          style={ { zIndex: showControls ? 1 : -1, opacity: showControls ? 1 : 0 } }
      >
        <IconButton
          iconName={isPlaying ? "pause" : "play"}
          iconComponent={FeIcon}
          onPress={handlePlayPause}
          size={50}
          className={`w-20 h-20`}
        />
      </View> */}

      {/* Progress Bar */}
      {/* {showControls && (
        <View className={`absolute bottom-0 left-0 right-0 p-2`}>
          <Slider
            className={`w-full`}
            value={progress}
            minimumValue={0}
            maximumValue={duration}
            onValueChange={handleSliderChange}
            minimumTrackTintColor="#dee4e6"
            maximumTrackTintColor="#000000"
          />
        </View>
      )} */}
    </TouchableOpacity>
  );
};

export default VideoPlayer;
