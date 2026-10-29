import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type {
  DataState,
  DisplayFacingSettings,
  ScreenInstance,
  SimpleCommand,
} from '@officeboard/shared';

export type CommandListener = (command: SimpleCommand) => void;

export interface DisplayContextValue {
  settings: DisplayFacingSettings;
  data: DataState;
  subscribe: (listener: CommandListener) => () => void;
}

export const DisplayContext = createContext<DisplayContextValue | null>(null);

export function useDisplay(): DisplayContextValue {
  const ctx = useContext(DisplayContext);
  if (!ctx) throw new Error('useDisplay must be used inside the display');
  return ctx;
}

export interface ScreenProps {
  screen: ScreenInstance;
  /** False while the screen is fading out; inactive screens ignore remote commands. */
  active: boolean;
}

/** Subscribes the active screen to screen-local remote commands (select, up, down). */
export function useScreenCommand(active: boolean, handler: CommandListener): void {
  const { subscribe } = useDisplay();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    return subscribe((cmd) => ref.current(cmd));
  }, [active, subscribe]);
}

/** Re-renders every `intervalMs`, aligned to the interval boundary so clocks tick on the second. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, intervalMs - (Date.now() % intervalMs) + 5);
    };
    timer = window.setTimeout(tick, intervalMs - (Date.now() % intervalMs) + 5);
    return () => window.clearTimeout(timer);
  }, [intervalMs]);
  return now;
}

/** Advances an index every `seconds` while active; also exposes manual stepping. */
export function useCycler(count: number, seconds: number, active: boolean) {
  const [index, setIndex] = useState(0);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);
  useEffect(() => {
    if (!active || count <= 1) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % count), seconds * 1000);
    return () => window.clearInterval(t);
  }, [active, count, seconds, epoch]);
  const step = (delta: number) => {
    if (count <= 0) return;
    setIndex((i) => (i + delta + count) % count);
    setEpoch((e) => e + 1);
  };
  return { index: count > 0 ? Math.min(index, count - 1) : 0, step };
}
