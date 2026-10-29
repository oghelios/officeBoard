import { useCallback } from 'react';
import type { Settings } from '@officeboard/shared';
import { api } from '../lib/api';
import { toastError, useApi } from './components/ui';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function useSettings() {
  const { data: settings, setData, error, reload } = useApi<Settings>('/api/settings');
  const save = useCallback(
    async (patch: DeepPartial<Settings>) => {
      try {
        setData(await api.patch<Settings>('/api/settings', patch));
        return true;
      } catch (err) {
        toastError(err);
        return false;
      }
    },
    [setData],
  );
  return { settings, save, error, reload };
}
