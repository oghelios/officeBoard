import { useMemo } from 'react';
import { CalendarDays, Check, Circle } from 'lucide-react';
import { PROJECT_STATUS_LABELS, type ProjectWithTodos } from '@officeboard/shared';
import { formatYmd, todayYmd } from '../../lib/format';
import { SourceStatus } from '../components';
import { useCycler, useDisplay, useScreenCommand, type ScreenProps } from '../context';

interface Config {
  showCompletedProjects: boolean;
  showOnHold: boolean;
  showDoneTodos: boolean;
  maxTodosPerProject: number;
  projectsPerPage: number;
  pageSeconds: number;
}

function ProjectCard({ project, cfg, today }: { project: ProjectWithTodos; cfg: Config; today: string }) {
  const total = project.todos.length;
  const done = project.todos.filter((t) => t.done).length;
  const open = project.todos.filter((t) => !t.done);
  const finished = cfg.showDoneTodos ? project.todos.filter((t) => t.done) : [];
  const shown = [...open, ...finished].slice(0, cfg.maxTodosPerProject);
  const hidden = open.length + finished.length - shown.length;
  const overdue = project.dueDate !== null && project.dueDate < today && project.status !== 'completed';

  return (
    <article className="project-card" style={{ '--project-color': project.color } as React.CSSProperties}>
      <header>
        <h3>{project.name}</h3>
        <span className={`status-pill status-${project.status}`}>{PROJECT_STATUS_LABELS[project.status]}</span>
      </header>
      {project.description && <p className="project-desc dim">{project.description}</p>}
      <div className="project-meta">
        {total > 0 && (
          <span>
            {done}/{total} done
          </span>
        )}
        {project.dueDate && (
          <span className={overdue ? 'overdue' : ''}>
            <CalendarDays size="0.9em" /> Due {formatYmd(project.dueDate, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      {total > 0 && (
        <div className="progress-track">
          <div className="progress-value" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}
      <ul className="todo-list">
        {shown.map((t) => (
          <li key={t.id} className={t.done ? 'done' : ''}>
            {t.done ? <Check size="1em" className="todo-check" /> : <Circle size="0.8em" className="todo-open" />}
            <span>{t.text}</span>
          </li>
        ))}
        {total === 0 && <li className="dim">No to-dos yet</li>}
        {hidden > 0 && <li className="dim more">+{hidden} more</li>}
      </ul>
    </article>
  );
}

export function ProjectsScreen({ screen, active }: ScreenProps) {
  const { data, settings } = useDisplay();
  const cfg = screen.config as unknown as Config;
  const today = todayYmd(settings.location.timezone);

  const projects = useMemo(
    () =>
      (data.projects.data?.projects ?? []).filter(
        (p) =>
          p.status === 'active' ||
          (p.status === 'on_hold' && cfg.showOnHold) ||
          (p.status === 'completed' && cfg.showCompletedProjects),
      ),
    [data.projects.data, cfg.showOnHold, cfg.showCompletedProjects],
  );

  const perPage = cfg.projectsPerPage;
  const pageCount = Math.max(1, Math.ceil(projects.length / perPage));
  const { index: page, step } = useCycler(pageCount, cfg.pageSeconds, active);
  useScreenCommand(active, (cmd) => {
    if (cmd === 'down' || cmd === 'select') step(1);
    if (cmd === 'up') step(-1);
  });

  const pageItems = projects.slice(page * perPage, (page + 1) * perPage);
  const columns = pageItems.length <= 2 ? pageItems.length || 1 : pageItems.length <= 4 ? 2 : 3;
  const openTodos = projects.reduce((n, p) => n + p.todos.filter((t) => !t.done).length, 0);

  return (
    <div className="screen projects">
      <header className="screen-header">
        <h1>Projects</h1>
        <div className="screen-header-meta dim">
          {projects.length} open · {openTodos} to-dos
          {pageCount > 1 && (
            <span className="pager">
              {Array.from({ length: pageCount }, (_, i) => (
                <span key={i} className={i === page ? 'on' : ''} />
              ))}
            </span>
          )}
        </div>
      </header>
      {projects.length === 0 ? (
        <div className="center-message grow">
          <SourceStatus envelope={data.projects} emptyText="No open projects. Add some in the admin panel." />
        </div>
      ) : (
        <div
          key={page}
          className="project-grid fade-in"
          style={{
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gridTemplateRows: `repeat(${Math.ceil(pageItems.length / columns)}, 1fr)`,
          }}
        >
          {pageItems.map((p) => (
            <ProjectCard key={p.id} project={p} cfg={cfg} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}
