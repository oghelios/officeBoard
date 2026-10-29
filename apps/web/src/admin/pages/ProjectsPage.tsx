import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  PROJECT_COLORS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
  type ProjectWithTodos,
  type Todo,
} from '@officeboard/shared';
import { api } from '../../lib/api';
import { CommitInput, PageHeader, confirmAction, toastError, useApi } from '../components/ui';

function move<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function TodoRow({
  todo,
  index,
  count,
  onChange,
  onMove,
}: {
  todo: Todo;
  index: number;
  count: number;
  onChange: () => void;
  onMove: (delta: number) => void;
}) {
  async function patch(body: Partial<Todo>) {
    try {
      await api.patch(`/api/todos/${todo.id}`, body);
      onChange();
    } catch (err) {
      toastError(err);
    }
  }
  return (
    <li className={`todo-row ${todo.done ? 'done' : ''}`}>
      <input type="checkbox" checked={todo.done} onChange={(e) => void patch({ done: e.target.checked })} />
      <CommitInput className="inline-input" value={todo.text} onCommit={(text) => text.trim() && void patch({ text })} />
      <div className="row-actions">
        <button className="icon-btn" title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp size={14} />
        </button>
        <button className="icon-btn" title="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
          <ArrowDown size={14} />
        </button>
        <button
          className="icon-btn danger"
          title="Delete to-do"
          onClick={async () => {
            try {
              await api.del(`/api/todos/${todo.id}`);
              onChange();
            } catch (err) {
              toastError(err);
            }
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}

function ProjectEditor({
  project,
  index,
  count,
  onChange,
  onMove,
}: {
  project: ProjectWithTodos;
  index: number;
  count: number;
  onChange: () => void;
  onMove: (delta: number) => void;
}) {
  const [newTodo, setNewTodo] = useState('');
  const done = project.todos.filter((t) => t.done).length;

  async function patch(body: Record<string, unknown>) {
    try {
      await api.patch(`/api/projects/${project.id}`, body);
      onChange();
    } catch (err) {
      toastError(err);
    }
  }

  async function addTodo(e: FormEvent) {
    e.preventDefault();
    const text = newTodo.trim();
    if (!text) return;
    try {
      await api.post(`/api/projects/${project.id}/todos`, { text });
      setNewTodo('');
      onChange();
    } catch (err) {
      toastError(err);
    }
  }

  async function moveTodo(i: number, delta: number) {
    const ids = move(project.todos, i, delta).map((t) => t.id);
    try {
      await api.put(`/api/projects/${project.id}/todos/order`, { ids });
      onChange();
    } catch (err) {
      toastError(err);
    }
  }

  async function clearDone() {
    try {
      await Promise.all(project.todos.filter((t) => t.done).map((t) => api.del(`/api/todos/${t.id}`)));
      onChange();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <article className="card project-editor" style={{ borderTopColor: project.color }}>
      <div className="project-editor-head">
        <CommitInput
          className="inline-input title-input"
          value={project.name}
          onCommit={(name) => name.trim() && void patch({ name })}
        />
        <div className="row-actions">
          <button className="icon-btn" title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp size={16} />
          </button>
          <button className="icon-btn" title="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown size={16} />
          </button>
          <button
            className="icon-btn danger"
            title="Delete project"
            onClick={async () => {
              if (!confirmAction(`Delete "${project.name}" and its ${project.todos.length} to-dos?`)) return;
              try {
                await api.del(`/api/projects/${project.id}`);
                onChange();
              } catch (err) {
                toastError(err);
              }
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <CommitInput
        className="inline-input muted"
        placeholder="Short description (optional)"
        value={project.description}
        onCommit={(description) => void patch({ description })}
      />

      <div className="project-props">
        <label>
          <span>Status</span>
          <select value={project.status} onChange={(e) => void patch({ status: e.target.value as ProjectStatus })}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Due</span>
          <input
            type="date"
            value={project.dueDate ?? ''}
            onChange={(e) => void patch({ dueDate: e.target.value || null })}
          />
        </label>
        <div className="color-picker">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${c === project.color ? 'on' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => void patch({ color: c })}
            />
          ))}
        </div>
      </div>

      <div className="todo-head">
        <span className="muted small">
          To-dos {project.todos.length > 0 && `(${done}/${project.todos.length} done)`}
        </span>
        {done > 0 && (
          <button className="link-btn small" onClick={() => void clearDone()}>
            Clear finished
          </button>
        )}
      </div>
      <ul className="todo-rows">
        {project.todos.map((t, i) => (
          <TodoRow key={t.id} todo={t} index={i} count={project.todos.length} onChange={onChange} onMove={(d) => void moveTodo(i, d)} />
        ))}
      </ul>
      <form className="add-row" onSubmit={addTodo}>
        <input placeholder="Add a to-do and press Enter" value={newTodo} onChange={(e) => setNewTodo(e.target.value)} />
        <button className="btn small" disabled={!newTodo.trim()}>
          <Plus size={14} /> Add
        </button>
      </form>
    </article>
  );
}

export function ProjectsPage() {
  const { data: projects, reload, error } = useApi<ProjectWithTodos[]>('/api/projects');
  const [name, setName] = useState('');
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const color = PROJECT_COLORS[(projects?.length ?? 0) % PROJECT_COLORS.length];
      await api.post('/api/projects', { name: name.trim(), color });
      setName('');
      await reload();
    } catch (err) {
      toastError(err);
    }
  }

  async function moveProject(id: number, delta: number) {
    if (!projects) return;
    const index = projects.findIndex((p) => p.id === id);
    const ids = move(projects, index, delta).map((p) => p.id);
    try {
      await api.put('/api/projects/order', { ids });
      await reload();
    } catch (err) {
      toastError(err);
    }
  }

  const visible = (projects ?? []).filter(
    (p) => filter === 'all' || p.status === 'active' || p.status === 'on_hold',
  );

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Projects and their to-do lists appear on the Projects screen. Changes show on the TV immediately."
        actions={
          <div className="segmented">
            <button className={filter === 'open' ? 'on' : ''} onClick={() => setFilter('open')}>
              Open
            </button>
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              All
            </button>
          </div>
        }
      />
      <form className="card add-project" onSubmit={create}>
        <input placeholder="New project name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={!name.trim()}>
          <Plus size={16} /> Add project
        </button>
      </form>
      {error && <div className="alert error">{error}</div>}
      {projects && visible.length === 0 && (
        <p className="muted">{projects.length === 0 ? 'No projects yet.' : 'No open projects. Switch to "All" to see completed and archived ones.'}</p>
      )}
      <div className="project-editors">
        {visible.map((p) => (
          <ProjectEditor
            key={p.id}
            project={p}
            index={projects!.indexOf(p)}
            count={projects!.length}
            onChange={() => void reload()}
            onMove={(d) => void moveProject(p.id, d)}
          />
        ))}
      </div>
    </>
  );
}
