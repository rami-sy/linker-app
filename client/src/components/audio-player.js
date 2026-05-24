import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useAudioPlayer } from "expo-audio";
import logger from "../utils/logger";
import Icon from "@expo/vector-icons/Ionicons";
import FeIcon from "@expo/vector-icons/Feather";
import Slider from "@react-native-community/slider";
import { useColorScheme } from "~/lib/useColorScheme";

const AudioPlayer = ({ uri, duration, small, isUser }) => {
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [position, setPosition] = useState(0);
  const { isDarkColorScheme } = useColorScheme();
  
  const player = useAudioPlayer(uri ? { source: { uri } } : null);

  useEffect(() => {
    if (!player || !uri) return;

    // Update source when URI changes
    player.replace({ source: { uri } });
  }, [uri, player]);

  useEffect(() => {
    if (!player) return;

    // Update playback rate
    player.rate = playbackRate;
  }, [playbackRate, player]);

  useEffect(() => {
    if (!player) return;

    // Listen to player status updates
    const interval = setInterval(() => {
      if (player.currentTime !== undefined) {
        setPosition(player.currentTime * 1000); // Convert to milliseconds
      }
    }, 100); // Update every 100ms

    return () => clearInterval(interval);
  }, [player]);

  const playPauseSound = () => {
    if (!player) return;
    
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const onSliderValueChange = (value) => {
    if (player) {
      player.seekTo(value / 1000); // Convert to seconds
      setPosition(value);
    }
  };

  const changePlaybackRate = () => {
    let newRate = playbackRate === 1.0 ? 1.5 : playbackRate === 1.5 ? 2.0 : 1.0;
    setPlaybackRate(newRate);
  };

  const isPlaying = player?.playing || false;

  const formatMillis = (millis) => {
    const minutes = Math.floor(millis / 60000);
    const seconds = ((millis % 60000) / 1000).toFixed(0);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  return (
    <View className={`flex-row items-center justify-start w-full h-12 gap-x-2`}>
      {/* {!small && ( */}
      <TouchableOpacity
        className={`flex-col items-center justify-center`}
        onPress={changePlaybackRate}
      >
        <FeIcon
          name={"mic"}
          size={25}
          color={(isDarkColorScheme || isUser) && !small ? "#dee4e6" : "#2D2D37"}
        />
        <Text
          className={`${
            (isDarkColorScheme || isUser) && !small
              ? "text-papaya"
              : "text-placeholder"
          } text-xs absolute bottom-[-20px]`}
        >
          {playbackRate}x
        </Text>
      </TouchableOpacity>
      {/* )} */}
      <TouchableOpacity onPress={playPauseSound} disabled={!player}>
        <Icon
          name={isPlaying ? "pause" : "play"}
          size={25}
          color={(isDarkColorScheme || isUser) && !small ? "#dee4e6" : "#2D2D37"}
          className={`mr-2`}
        />
      </TouchableOpacity>
      <Slider
        style={{ display: "flex", flex: 1 }}
        value={position}
        minimumValue={0}
        maximumValue={typeof duration === "number" ? duration : 1}
        onValueChange={onSliderValueChange}
        disabled={!player}
        thumbTintColor={
          (isDarkColorScheme || isUser) && !small ? "#dee4e6" : "#2D2D37"
        }
        minimumTrackTintColor="#ddd"
        maximumTrackTintColor={
          (isDarkColorScheme || isUser) && !small ? "#EDF6F9" : "#023047"
        }
      />
      <Text
        className={`
          ${
            (isDarkColorScheme || isUser) && !small
              ? "text-papaya"
              : "text-placeholder"
          }
          text-xs ml-2
          absolute right-0 bottom-[0]
        `}
      >
        {formatMillis(position || 0)} / {formatMillis(duration || 0)}
      </Text>
    </View>
  );
};

export default AudioPlayer;
