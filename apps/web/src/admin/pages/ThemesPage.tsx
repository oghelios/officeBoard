import { useEffect, useState } from 'react';
import { Check, Copy, Pencil, Trash2 } from 'lucide-react';
import {
  THEME_COLOR_INFO,
  THEME_PRESETS,
  type CustomTheme,
  type ThemeColorGroup,
  type ThemeColorKey,
  type ThemeColors,
} from '@officeboard/shared';
import { PageHeader, Section, confirmAction, toast } from '../components/ui';
import { ThemePreview } from '../components/ThemePreview';
import { useSettings } from '../useSettings';

const GROUPS: ThemeColorGroup[] = ['Surfaces', 'Text and accent', 'Status', 'Weather icons'];
const HEX = /^#[0-9a-fA-F]{6}$/;

function newThemeId(): string {
  return `custom-${Math.random().toString(36).slice(2, 10)}`;
}

function ColorField({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <div className="color-field-text">
        <span>{label}</span>
        <span className="muted small">{help}</span>
      </div>
      <input
        className="hex-input"
        value={text}
        maxLength={7}
        onChange={(e) => {
          const v = e.target.value.trim();
          setText(v);
          const normalized = v.startsWith('#') ? v : `#${v}`;
          if (HEX.test(normalized)) onChange(normalized.toLowerCase());
        }}
        onBlur={() => setText(value)}
      />
    </div>
  );
}

function ThemeEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
  isNew,
}: {
  draft: CustomTheme;
  setDraft: (t: CustomTheme) => void;
  onSave: (useOnTv: boolean) => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  const setColor = (key: ThemeColorKey, hex: string) =>
    setDraft({ ...draft, colors: { ...draft.colors, [key]: hex } as ThemeColors });

  return (
    <Section
      title={isNew ? 'New theme' : `Edit "${draft.name}"`}
      description="Pick a color for each part of the board. The preview updates as you go; nothing changes on the TV until you save."
    >
      <div className="theme-editor">
        <div className="theme-editor-fields">
          <label className="field">
            <span>Theme name</span>
            <input value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          {GROUPS.map((group) => (
            <div key={group} className="color-group">
              <h3>{group}</h3>
              {THEME_COLOR_INFO.filter((c) => c.group === group).map((c) => (
                <ColorField
                  key={c.key}
                  label={c.label}
                  help={c.help}
                  value={draft.colors[c.key]}
                  onChange={(hex) => setColor(c.key, hex)}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="theme-editor-preview">
          <ThemePreview colors={draft.colors} />
          <div className="button-row">
            <button className="btn primary" disabled={!draft.name.trim()} onClick={() => onSave(true)}>
              Save and show on TV
            </button>
            <button className="btn" disabled={!draft.name.trim()} onClick={() => onSave(false)}>
              Save
            </button>
            <button className="btn ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function ThemesPage() {
  const { settings, save, error } = useSettings();
  const [draft, setDraft] = useState<CustomTheme | null>(null);
  const [isNew, setIsNew] = useState(false);

  if (error) return <div className="alert error">{error}</div>;
  if (!settings) return null;

  const custom = settings.customThemes;
  const knownIds = new Set([...THEME_PRESETS.map((t) => t.id), ...custom.map((t) => t.id)]);
  const activeId = knownIds.has(settings.display.theme) ? settings.display.theme : 'dark';

  const startFrom = (name: string, colors: ThemeColors) => {
    setDraft({ id: newThemeId(), name: `${name} copy`.slice(0, 40), colors: { ...colors } });
    setIsNew(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const use = async (id: string, name: string) => {
    if (await save({ display: { theme: id } })) toast(`Now showing "${name}" on the TV`);
  };

  const saveDraft = async (useOnTv: boolean) => {
    if (!draft) return;
    const theme = { ...draft, name: draft.name.trim() };
    const list = isNew ? [...custom, theme] : custom.map((t) => (t.id === theme.id ? theme : t));
    const ok = await save({ customThemes: list, ...(useOnTv && { display: { theme: theme.id } }) });
    if (ok) {
      toast(useOnTv ? `Saved and showing "${theme.name}"` : `Saved "${theme.name}"`);
      setDraft(null);
    }
  };

  const remove = async (theme: CustomTheme) => {
    if (!confirmAction(`Delete the "${theme.name}" theme?`)) return;
    const wasActive = activeId === theme.id;
    if (await save({ customThemes: custom.filter((t) => t.id !== theme.id), ...(wasActive && { display: { theme: 'dark' } }) })) {
      toast(wasActive ? `Deleted "${theme.name}"; the TV switched back to Dark` : `Deleted "${theme.name}"`);
    }
  };

  const card = (t: { id: string; name: string; colors: ThemeColors }, editable: boolean) => (
    <div key={t.id} className={`card theme-card ${t.id === activeId ? 'active' : ''}`}>
      <ThemePreview colors={t.colors} compact />
      <div className="theme-card-foot">
        <div className="theme-card-name">
          <strong>{t.name}</strong>
          {t.id === activeId ? <span className="badge ok">On TV</span> : !editable && <span className="badge">Built-in</span>}
        </div>
        <div className="row-actions">
          {t.id !== activeId && (
            <button className="icon-btn" title="Show on TV" onClick={() => void use(t.id, t.name)}>
              <Check size={16} />
            </button>
          )}
          <button className="icon-btn" title="Duplicate and edit" onClick={() => startFrom(t.name, t.colors)}>
            <Copy size={16} />
          </button>
          {editable && (
            <>
              <button
                className="icon-btn"
                title="Edit"
                onClick={() => {
                  setDraft({ ...(t as CustomTheme), colors: { ...t.colors } });
                  setIsNew(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <Pencil size={16} />
              </button>
              <button className="icon-btn danger" title="Delete" onClick={() => void remove(t as CustomTheme)}>
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Themes"
        subtitle="Choose the board's color theme, or duplicate one to make your own: every background, text, status and weather icon color can be changed."
      />
      {draft && (
        <ThemeEditor draft={draft} setDraft={setDraft} isNew={isNew} onSave={(u) => void saveDraft(u)} onCancel={() => setDraft(null)} />
      )}
      <h2 className="theme-heading">Built-in</h2>
      <div className="theme-grid">{THEME_PRESETS.map((t) => card(t, false))}</div>
      <h2 className="theme-heading">Your themes</h2>
      {custom.length === 0 ? (
        <p className="muted">
          None yet. Use the duplicate button on any theme above to start one, for example Graphite for a set of greys.
        </p>
      ) : (
        <div className="theme-grid">{custom.map((t) => card(t, true))}</div>
      )}
    </>
  );
}
