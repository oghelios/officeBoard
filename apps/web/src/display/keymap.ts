import type { DisplayCommand } from '@officeboard/shared';

/**
 * Keyboard-style remotes (2.4 GHz RF dongles, Bluetooth "air mice", IR receivers exposed as
 * keyboards) all arrive as key events in Chromium. `KeyboardEvent.key` values are mapped here.
 */
const KEYS: Record<string, DisplayCommand> = {
  ArrowRight: { type: 'next' },
  PageDown: { type: 'next' },
  MediaTrackNext: { type: 'next' },
  MediaFastForward: { type: 'next' },
  ArrowLeft: { type: 'prev' },
  PageUp: { type: 'prev' },
  MediaTrackPrevious: { type: 'prev' },
  MediaRewind: { type: 'prev' },
  ArrowUp: { type: 'up' },
  ArrowDown: { type: 'down' },
  Enter: { type: 'select' },
  Select: { type: 'select' },
  Escape: { type: 'back' },
  Backspace: { type: 'back' },
  BrowserBack: { type: 'back' },
  GoBack: { type: 'back' },
  Home: { type: 'home' },
  BrowserHome: { type: 'home' },
  ' ': { type: 'pause' },
  MediaPlayPause: { type: 'pause' },
  MediaPlay: { type: 'pause' },
  MediaPause: { type: 'pause' },
  Pause: { type: 'pause' },
  k: { type: 'pause' },
  p: { type: 'pin' },
  MediaStop: { type: 'pin' },
  ColorF0Red: { type: 'pin' },
  i: { type: 'info' },
  ContextMenu: { type: 'info' },
  Info: { type: 'info' },
  F1: { type: 'info' },
};

export function commandForKey(e: KeyboardEvent): DisplayCommand | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (/^[1-9]$/.test(e.key)) return { type: 'goto', index: Number(e.key) };
  return KEYS[e.key] ?? KEYS[e.key.toLowerCase()] ?? null;
}
