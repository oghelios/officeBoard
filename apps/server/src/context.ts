import type { Db } from './db/index.js';
import type { InputManager } from './input/manager.js';
import type { GoogleCalendarService } from './providers/google-calendar.js';
import type { SystemMonitor } from './providers/system.js';
import type { AuthService } from './services/auth.js';
import type { DataHub } from './services/data-hub.js';
import type { DisplayHub } from './services/display-hub.js';
import type { PhotosService } from './services/photos.js';
import type { ProjectsService } from './services/projects.js';
import type { RemindersService } from './services/reminders.js';
import type { RotationEngine } from './services/rotation.js';
import type { ScreensService } from './services/screens.js';
import type { SettingsService } from './services/settings.js';

export interface AppContext {
  db: Db;
  settings: SettingsService;
  auth: AuthService;
  screens: ScreensService;
  projects: ProjectsService;
  reminders: RemindersService;
  photos: PhotosService;
  data: DataHub;
  rotation: RotationEngine;
  hub: DisplayHub;
  google: GoogleCalendarService;
  system: SystemMonitor;
  input: InputManager;
}
