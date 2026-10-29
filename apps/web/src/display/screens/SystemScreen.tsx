import { Activity, Clock, Cpu, Globe, HardDrive, MemoryStick, Monitor, Thermometer } from 'lucide-react';
import { formatBytes, formatDuration, timeAgo } from '../../lib/format';
import { SourceStatus } from '../components';
import { useDisplay, type ScreenProps } from '../context';

function Meter({ value, warn = 70, danger = 90 }: { value: number; warn?: number; danger?: number }) {
  const level = value >= danger ? 'danger' : value >= warn ? 'warn' : 'ok';
  return (
    <div className="meter">
      <div className={`meter-fill ${level}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function Tile({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="sys-tile">
      <div className="sys-label">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

export function SystemScreen(_props: ScreenProps) {
  const { data } = useDisplay();
  const sys = data.system.data;
  if (!sys) {
    return (
      <div className="screen center-message">
        <SourceStatus envelope={data.system} emptyText="" />
      </div>
    );
  }

  const memPct = (sys.memUsed / Math.max(1, sys.memTotal)) * 100;
  const diskPct = sys.disk ? (sys.disk.used / Math.max(1, sys.disk.size)) * 100 : 0;

  return (
    <div className="screen system">
      <header className="screen-header">
        <h1>System</h1>
        <div className="screen-header-meta dim">
          {sys.model ?? sys.hostname} · updated {timeAgo(data.system.updatedAt)}
        </div>
      </header>
      <div className="sys-grid">
        <Tile icon={<Cpu size="1em" />} label="CPU load">
          <div className="sys-value">{sys.cpuLoad}%</div>
          <Meter value={sys.cpuLoad} />
        </Tile>
        <Tile icon={<Thermometer size="1em" />} label="CPU temperature">
          <div className="sys-value">{sys.cpuTemp !== null ? `${sys.cpuTemp}°C` : 'n/a'}</div>
          {sys.cpuTemp !== null && <Meter value={(sys.cpuTemp / 85) * 100} warn={70} danger={88} />}
        </Tile>
        <Tile icon={<MemoryStick size="1em" />} label="Memory">
          <div className="sys-value">{Math.round(memPct)}%</div>
          <Meter value={memPct} />
          <div className="dim small">
            {formatBytes(sys.memUsed)} of {formatBytes(sys.memTotal)}
          </div>
        </Tile>
        <Tile icon={<HardDrive size="1em" />} label={`Disk ${sys.disk?.mount ?? ''}`}>
          <div className="sys-value">{sys.disk ? `${Math.round(diskPct)}%` : 'n/a'}</div>
          {sys.disk && (
            <>
              <Meter value={diskPct} warn={80} danger={92} />
              <div className="dim small">
                {formatBytes(sys.disk.used)} of {formatBytes(sys.disk.size)}
              </div>
            </>
          )}
        </Tile>
        <Tile icon={<Globe size="1em" />} label="Internet">
          <div className={`sys-value ${sys.internet.online ? 'good' : 'bad'}`}>
            {sys.internet.online ? 'Online' : 'Offline'}
          </div>
          <div className="dim small">
            {sys.internet.latencyMs !== null ? `${sys.internet.latencyMs} ms · ` : ''}checked{' '}
            {timeAgo(sys.internet.checkedAt)}
          </div>
        </Tile>
        <Tile icon={<Activity size="1em" />} label="Network">
          {sys.addresses.length === 0 ? (
            <div className="sys-value bad">No network</div>
          ) : (
            sys.addresses.slice(0, 3).map((a) => (
              <div key={`${a.iface}-${a.address}`} className="sys-addr">
                <span>{a.address}</span>
                <span className="dim small">{a.iface}</span>
              </div>
            ))
          )}
        </Tile>
        <Tile icon={<Clock size="1em" />} label="Uptime">
          <div className="sys-value">{formatDuration(sys.uptimeSec)}</div>
          <div className="dim small">Board server up {formatDuration(sys.serverUptimeSec)}</div>
        </Tile>
        <Tile icon={<Monitor size="1em" />} label="Host">
          <div className="sys-value small-value">{sys.hostname}</div>
          <div className="dim small">{sys.platform}</div>
          <div className="dim small">
            Node {sys.nodeVersion} · {sys.displayClients} display{sys.displayClients === 1 ? '' : 's'} connected
          </div>
        </Tile>
      </div>
    </div>
  );
}
