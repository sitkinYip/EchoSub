import { useEffect, useRef, useCallback } from "react";
import type { RefObject } from "react";
import type Plyr from "plyr";
import {
  DEFAULT_MAPPINGS,
  LONG_PRESS_ACTIONS,
  PLAYER_KEYBOARD_LIMITS,
  type PlayerAction,
  type KeyMapping,
} from "./keyboardConfig";
import { executePlayerAction } from "./playerKeyboardActions";

interface UseKeyboardControlsOptions {
  playerRef: RefObject<Plyr | null>;
  disabled?: boolean;
  mappings?: KeyMapping[];
  onAction?: (action: PlayerAction) => void;
}

export function useKeyboardControls({
  playerRef,
  disabled = false,
  mappings = DEFAULT_MAPPINGS,
  onAction,
}: UseKeyboardControlsOptions) {
  const longPressTimers = useRef(
    new Map<
      string,
      { delay: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }
    >(),
  );
  const keyToAction = useRef(new Map<string, PlayerAction>());

  const normalizeKey = useCallback((key: string) => {
    return key.length === 1 ? key.toLowerCase() : key;
  }, []);

  const isTypingTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }, []);

  useEffect(() => {
    const map = new Map<string, PlayerAction>();
    for (const m of mappings) {
      for (const k of m.keys) map.set(normalizeKey(k), m.action);
    }
    keyToAction.current = map;
  }, [mappings, normalizeKey]);

  const execute = useCallback(
    (action: PlayerAction) => {
      if (!playerRef.current || disabled) return;
      executePlayerAction(playerRef.current, action);
      onAction?.(action);
    },
    [playerRef, disabled, onAction],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const action = keyToAction.current.get(normalizeKey(e.key));
      if (!action) return;

      const fastVariant = LONG_PRESS_ACTIONS[action];

      if (fastVariant && !e.repeat && !longPressTimers.current.has(e.key)) {
        const delay = setTimeout(() => {
          execute(fastVariant);
          const repeat = setInterval(
            () => execute(fastVariant),
            PLAYER_KEYBOARD_LIMITS.fastSeekIntervalMs,
          );
          const current = longPressTimers.current.get(e.key);
          if (current) longPressTimers.current.set(e.key, { ...current, repeat });
        }, PLAYER_KEYBOARD_LIMITS.longPressMs);
        longPressTimers.current.set(e.key, { delay });
      }

      e.preventDefault();
      if (!e.repeat) execute(action);
    };

    const keyupHandler = (e: KeyboardEvent) => {
      const timer = longPressTimers.current.get(e.key);
      if (timer) {
        clearTimeout(timer.delay);
        if (timer.repeat) clearInterval(timer.repeat);
        longPressTimers.current.delete(e.key);
      }
    };

    document.addEventListener("keydown", handler);
    document.addEventListener("keyup", keyupHandler);

    return () => {
      document.removeEventListener("keydown", handler);
      document.removeEventListener("keyup", keyupHandler);
      for (const t of longPressTimers.current.values()) {
        clearTimeout(t.delay);
        if (t.repeat) clearInterval(t.repeat);
      }
      longPressTimers.current.clear();
    };
  }, [execute, isTypingTarget, normalizeKey]);
}
