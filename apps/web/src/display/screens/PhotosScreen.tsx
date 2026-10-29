import { useMemo } from 'react';
import { SourceStatus } from '../components';
import { useCycler, useDisplay, useScreenCommand, type ScreenProps } from '../context';

/** Deterministic shuffle so the order doesn't jump around when unrelated data updates. */
function shuffled<T extends { id: number }>(items: T[]): T[] {
  const out = [...items];
  let seed = items.reduce((s, i) => (s * 31 + i.id) >>> 0, 7);
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function PhotosScreen({ screen, active }: ScreenProps) {
  const { data } = useDisplay();
  const cfg = screen.config as { intervalSeconds: number; shuffle: boolean; fit: 'cover' | 'contain'; showCaption: boolean };
  const photos = useMemo(() => {
    const list = data.photos.data?.photos ?? [];
    return cfg.shuffle ? shuffled(list) : list;
  }, [data.photos.data, cfg.shuffle]);

  const { index, step } = useCycler(photos.length, cfg.intervalSeconds, active);
  useScreenCommand(active, (cmd) => {
    if (cmd === 'select' || cmd === 'down') step(1);
    if (cmd === 'up') step(-1);
  });

  if (photos.length === 0) {
    return (
      <div className="screen center-message">
        <SourceStatus envelope={data.photos} emptyText="No photos yet. Upload some in the admin panel." />
      </div>
    );
  }

  const photo = photos[index];
  const next = photos[(index + 1) % photos.length];

  return (
    <div className="screen photos">
      <div key={photo.id} className="photo-frame fade-in">
        {cfg.fit === 'contain' && <img className="photo-backdrop" src={photo.url} alt="" />}
        <img className={`photo fit-${cfg.fit}`} src={photo.url} alt={photo.caption} />
        {cfg.showCaption && photo.caption && <div className="photo-caption">{photo.caption}</div>}
      </div>
      {/* Preload the next image so the swap doesn't flash. */}
      {next && next.id !== photo.id && <link rel="preload" as="image" href={next.url} />}
    </div>
  );
}
