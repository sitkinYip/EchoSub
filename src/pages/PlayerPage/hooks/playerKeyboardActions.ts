import type Plyr from "plyr";
import { PLAYER_KEYBOARD_LIMITS, type PlayerAction } from "./keyboardConfig";

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function seekBy(player: Plyr, seconds: number) {
  const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : Number.POSITIVE_INFINITY;
  const current = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  player.currentTime = clamp(current + seconds, 0, duration);
}

function setSpeed(player: Plyr, speed: number) {
  player.speed = clamp(speed, PLAYER_KEYBOARD_LIMITS.minSpeed, PLAYER_KEYBOARD_LIMITS.maxSpeed);
}

function setVolume(player: Plyr, volume: number) {
  player.volume = clamp(volume, PLAYER_KEYBOARD_LIMITS.minVolume, PLAYER_KEYBOARD_LIMITS.maxVolume);
}

export function executePlayerAction(player: Plyr, action: PlayerAction) {
  switch (action) {
    case "playPause":
      player.togglePlay();
      break;
    case "seekForward":
      seekBy(player, PLAYER_KEYBOARD_LIMITS.seekStep);
      break;
    case "seekBackward":
      seekBy(player, -PLAYER_KEYBOARD_LIMITS.seekStep);
      break;
    case "seekForwardFast":
      seekBy(player, PLAYER_KEYBOARD_LIMITS.fastSeekStep);
      break;
    case "seekBackwardFast":
      seekBy(player, -PLAYER_KEYBOARD_LIMITS.fastSeekStep);
      break;
    case "fullscreen":
      player.fullscreen.toggle();
      break;
    case "speedUp":
      setSpeed(player, player.speed + PLAYER_KEYBOARD_LIMITS.speedStep);
      break;
    case "speedDown":
      setSpeed(player, player.speed - PLAYER_KEYBOARD_LIMITS.speedStep);
      break;
    case "speedReset":
      player.speed = 1;
      break;
    case "mute":
      player.muted = !player.muted;
      break;
    case "volumeUp":
      setVolume(player, player.volume + PLAYER_KEYBOARD_LIMITS.volumeStep);
      break;
    case "volumeDown":
      setVolume(player, player.volume - PLAYER_KEYBOARD_LIMITS.volumeStep);
      break;
  }
}
