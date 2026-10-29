import type { ReactNode } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { describeWeather, type DataEnvelope } from '@officeboard/shared';

const ICONS: Record<string, [day: LucideIcon, night: LucideIcon]> = {
  clear: [Sun, Moon],
  partly: [CloudSun, CloudMoon],
  cloudy: [Cloud, Cloud],
  fog: [CloudFog, CloudFog],
  drizzle: [CloudDrizzle, CloudDrizzle],
  rain: [CloudRain, CloudRain],
  snow: [CloudSnow, CloudSnow],
  thunder: [CloudLightning, CloudLightning],
};

export function WeatherIcon({
  code,
  isDay = true,
  size = '1em',
  className,
}: {
  code: number;
  isDay?: boolean;
  size?: string | number;
  className?: string;
}) {
  const { icon } = describeWeather(code);
  const [day, night] = ICONS[icon] ?? ICONS.cloudy;
  const Icon = isDay ? day : night;
  return <Icon size={size} className={`wx-icon wx-${icon} ${className ?? ''}`} strokeWidth={1.6} />;
}

export function Panel({
  title,
  icon,
  children,
  className,
  aside,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <section className={`panel ${className ?? ''}`}>
      {title && (
        <header className="panel-title">
          {icon}
          <span>{title}</span>
          {aside && <span className="panel-aside">{aside}</span>}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

/** Standard rendering for a data source that hasn't loaded or failed. */
export function SourceStatus({
  envelope,
  emptyText,
}: {
  envelope: DataEnvelope<unknown>;
  emptyText: string;
}) {
  if (envelope.error && !envelope.data) return <p className="dim">Unavailable: {envelope.error}</p>;
  if (!envelope.data) return <p className="dim">Loading...</p>;
  return <p className="dim">{emptyText}</p>;
}
