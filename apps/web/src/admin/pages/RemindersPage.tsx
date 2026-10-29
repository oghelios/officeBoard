import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Reminder } from '@officeboard/shared';
import { api } from '../../lib/api';
import { formatYmd } from '../../lib/format';
import { CommitInput, PageHeader, toastError, useApi } from '../components/ui';

function describeDue(r: Reminder): string {
  if (!r.dueAt) return 'No date';
  if (r.allDay) return formatYmd(r.dueAt.slice(0, 10), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return new Date(r.dueAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isOverdue(r: Reminder): boolean {
  if (!r.dueAt || r.done) return false;
  if (r.allDay) return r.dueAt.slice(0, 10) < new Date().toLocaleDateString('en-CA');
  return new Date(r.dueAt).getTime() < Date.now();
}

export function RemindersPage() {
  const { data: reminders, reload, error } = useApi<Reminder[]>('/api/reminders');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const allDay = Boolean(date) && !time;
    const dueAt = !date ? null : allDay ? date : new Date(`${date}T${time}`).toISOString();
    try {
      await api.post('/api/reminders', { title: title.trim(), notes, dueAt, allDay });
      setTitle('');
      setDate('');
      setTime('');
      setNotes('');
      await reload();
    } catch (err) {
      toastError(err);
    }
  }

  async function patch(id: number, body: Partial<Reminder>) {
    try {
      await api.patch(`/api/reminders/${id}`, body);
      await reload();
    } catch (err) {
      toastError(err);
    }
  }

  async function remove(id: number) {
    try {
      await api.del(`/api/reminders/${id}`);
      await reload();
    } catch (err) {
      toastError(err);
    }
  }

  const open = (reminders ?? []).filter((r) => !r.done);
  const done = (reminders ?? []).filter((r) => r.done);

  const renderRow = (r: Reminder) => (
    <li key={r.id} className={`reminder-row ${r.done ? 'done' : ''} ${isOverdue(r) ? 'overdue' : ''}`}>
      <input type="checkbox" checked={r.done} onChange={(e) => void patch(r.id, { done: e.target.checked })} />
      <div className="reminder-main">
        <CommitInput className="inline-input" value={r.title} onCommit={(v) => v.trim() && void patch(r.id, { title: v })} />
        {r.notes && <div className="muted small">{r.notes}</div>}
      </div>
      <span className="reminder-due">{describeDue(r)}</span>
      <button className="icon-btn danger" title="Delete" onClick={() => void remove(r.id)}>
        <Trash2 size={15} />
      </button>
    </li>
  );

  return (
    <>
      <PageHeader
        title="Reminders"
        subtitle="Open reminders are listed on the Home screen and shown on their date in the Calendar screen."
      />
      <form className="card reminder-form" onSubmit={create}>
        <input className="grow" placeholder="Reminder" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} title="Date (optional)" />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} title="Time (optional)" />
        <input className="grow" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="btn primary" disabled={!title.trim()}>
          <Plus size={16} /> Add
        </button>
      </form>
      {error && <div className="alert error">{error}</div>}

      <section className="card">
        <h2>Open ({open.length})</h2>
        {open.length === 0 ? <p className="muted">Nothing pending.</p> : <ul className="reminder-rows">{open.map(renderRow)}</ul>}
      </section>

      {done.length > 0 && (
        <section className="card">
          <div className="section-head">
            <h2>Done ({done.length})</h2>
            <button
              className="btn small ghost"
              onClick={async () => {
                try {
                  await api.post('/api/reminders/clear-done');
                  await reload();
                } catch (err) {
                  toastError(err);
                }
              }}
            >
              Clear all done
            </button>
          </div>
          <ul className="reminder-rows">{done.map(renderRow)}</ul>
        </section>
      )}
    </>
  );
}
