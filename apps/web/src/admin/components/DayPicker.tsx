import { WEEKDAY_SHORT } from '@officeboard/shared';

export function DayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="day-picker">
      {WEEKDAY_SHORT.map((d, i) => (
        <button
          key={d}
          type="button"
          className={days.includes(i) ? 'on' : ''}
          onClick={() => onChange(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())}
        >
          {d}
        </button>
      ))}
    </div>
  );
}
