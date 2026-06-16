/** Keyboard action identifiers */
export type PlayerAction =
  | "playPause"
  | "seekForward"
  | "seekBackward"
  | "seekForwardFast"
  | "seekBackwardFast"
  | "fullscreen"
  | "speedUp"
  | "speedDown"
  | "speedReset"
  | "mute"
  | "volumeUp"
  | "volumeDown";

/** Key → action mappings.  Configurable per-view / per-locale. */
export interface KeyMapping {
  keys: string[]; // e.key values, e.g. [" ", "k"]
  action: PlayerAction;
  label: string; // shown in tooltip / overlay
}

export const DEFAULT_MAPPINGS: KeyMapping[] = [
  { keys: [" ", "Spacebar", "k"], action: "playPause", label: "播放 / 暂停" },
  { keys: ["ArrowRight"], action: "seekForward", label: "快进 5 秒" },
  { keys: ["ArrowLeft"], action: "seekBackward", label: "后退 5 秒" },
  { keys: ["f"], action: "fullscreen", label: "全屏" },
  { keys: [">", "."], action: "speedUp", label: "加速" },
  { keys: ["<", ","], action: "speedDown", label: "减速" },
  { keys: ["r"], action: "speedReset", label: "重置速度" },
  { keys: ["m"], action: "mute", label: "静音" },
  { keys: ["ArrowUp"], action: "volumeUp", label: "音量 +" },
  { keys: ["ArrowDown"], action: "volumeDown", label: "音量 −" },
];

export const PLAYER_KEYBOARD_LIMITS = {
  seekStep: 5,
  fastSeekStep: 15,
  longPressMs: 300,
  fastSeekIntervalMs: 150,
  speedStep: 0.25,
  minSpeed: 0.25,
  maxSpeed: 4,
  volumeStep: 0.05,
  minVolume: 0,
  maxVolume: 1,
} as const;

export const LONG_PRESS_ACTIONS: Partial<Record<PlayerAction, PlayerAction>> = {
  seekForward: "seekForwardFast",
  seekBackward: "seekBackwardFast",
};
