import type { ComponentType } from 'react';
import type { ScreenType } from '@officeboard/shared';
import type { ScreenProps } from '../context';
import { CalendarScreen } from './CalendarScreen';
import { ClockScreen } from './ClockScreen';
import { ForecastScreen } from './ForecastScreen';
import { HomeScreen } from './HomeScreen';
import { PhotosScreen } from './PhotosScreen';
import { ProjectsScreen } from './ProjectsScreen';
import { SystemScreen } from './SystemScreen';

/**
 * Display side of the screen plugin model. Each screen type's metadata, config fields and data
 * sources live in @officeboard/shared (SCREEN_TYPE_INFO); this maps the type to its component.
 */
export const SCREEN_COMPONENTS: Record<ScreenType, ComponentType<ScreenProps>> = {
  home: HomeScreen,
  projects: ProjectsScreen,
  calendar: CalendarScreen,
  clock: ClockScreen,
  photos: PhotosScreen,
  system: SystemScreen,
  forecast: ForecastScreen,
};
