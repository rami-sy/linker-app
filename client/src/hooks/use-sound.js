import { useEffect } from "react";
import { useAudioPlayer } from "expo-audio";

const useSound = (src, volume = 1, playbackRate = 1, loop = false) => {
  const player = useAudioPlayer(src ? { source: { uri: src }, shouldPlay: false, isLooping: loop } : null);

  useEffect(() => {
    if (player) {
      player.volume = volume;
      player.rate = playbackRate;
    }
  }, [player, volume, playbackRate]);

  const playSound = async () => {
    if (player) {
      player.play();
    }
  };

  const pauseSound = async () => {
    if (player) {
      player.pause();
    }
  };

  const stopSound = async () => {
    if (player) {
      player.pause();
      player.currentTime = 0;
    }
  };

  const isPlaying = player?.isPlaying || false;

  return { playSound, pauseSound, stopSound, isPlaying };
};

export default useSound;
