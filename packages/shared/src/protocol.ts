import { z } from 'zod';
import type { DataEnvelope, DataMap, DataSource, DataState } from './data.js';
import type { ScreenInstance } from './screens.js';
import type { DisplayFacingSettings } from './settings.js';

/** Commands that every input source (keyboard, IR, CEC, admin remote) maps onto. */
export const SIMPLE_COMMANDS = [
  'next',
  'prev',
  'home',
  'back',
  'select',
  'up',
  'down',
  'pause',
  'pin',
  'info',
] as const;
export type SimpleCommand = (typeof SIMPLE_COMMANDS)[number];

/** Commands the server forwards to the active screen instead of handling itself. */
export const SCREEN_LOCAL_COMMANDS: SimpleCommand[] = ['select', 'up', 'down'];

export type DisplayCommand =
  | { type: SimpleCommand }
  | { type: 'goto'; index?: number; screenId?: string };

export const displayCommandSchema = z.union([
  z.object({ type: z.enum(SIMPLE_COMMANDS) }),
  z.object({
    type: z.literal('goto'),
    index: z.number().int().min(1).optional(),
    screenId: z.string().optional(),
  }),
]);

export type CommandSource = 'display' | 'admin' | 'ir' | 'cec' | 'api';

export interface RotationState {
  currentScreenId: string | null;
  pinnedScreenId: string | null;
  paused: boolean;
  /** Id of the schedule rule currently controlling the display, if any. */
  scheduleId: string | null;
  /** Epoch ms when the current screen was shown. */
  startedAt: number;
  /** How long the current screen will stay before rotating; null when static. */
  durationMs: number | null;
  serverTime: number;
}

export interface DisplayConfig {
  screens: ScreenInstance[];
  settings: DisplayFacingSettings;
}

export type ServerMessage =
  | {
      type: 'hello';
      /** Changes whenever a new web build is deployed; displays reload when it does. */
      buildId: string;
      config: DisplayConfig;
      rotation: RotationState;
      data: DataState;
    }
  | { type: 'config'; config: DisplayConfig }
  | { type: 'rotation'; rotation: RotationState }
  | { type: 'data'; source: DataSource; envelope: DataEnvelope<DataMap[DataSource]> }
  | { type: 'screenCommand'; command: SimpleCommand; seq: number }
  | { type: 'osd'; text: string }
  | { type: 'reload' };

export type ClientMessage =
  | { type: 'command'; command: DisplayCommand }
  | { type: 'ping' };
