import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import type { Photo } from '@officeboard/shared';
import { api } from '../../lib/api';
import { CommitInput, PageHeader, confirmAction, toast, toastError, useApi } from '../components/ui';

type PhotoWithUrl = Photo & { url: string };

export function PhotosPage() {
  const { data: photos, reload, error } = useApi<PhotoWithUrl[]>('/api/photos');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      list.forEach((f) => form.append('files', f, f.name));
      const res = await api.upload<{ uploaded: Photo[]; failed: { name: string; error: string }[] }>('/api/photos', form);
      if (res.uploaded.length) toast(`Uploaded ${res.uploaded.length} photo${res.uploaded.length === 1 ? '' : 's'}`);
      res.failed.forEach((f) => toast(`${f.name}: ${f.error}`, 'error'));
      await reload();
    } catch (err) {
      toastError(err);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <>
      <PageHeader
        title="Photos"
        subtitle="Photos are resized to 1080p on upload. Enable the Photos screen on the Screens page to show them."
      />
      <div
        className={`card dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
      >
        <Upload size={28} />
        <p>{uploading ? 'Uploading...' : 'Drag photos here, or'}</p>
        <button className="btn primary" disabled={uploading} onClick={() => fileInput.current?.click()}>
          Choose files
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => e.target.files && void upload(e.target.files)}
        />
      </div>
      {error && <div className="alert error">{error}</div>}
      {photos && photos.length === 0 && <p className="muted">No photos yet.</p>}
      <div className="photo-grid">
        {photos?.map((p) => (
          <figure key={p.id} className="card photo-item">
            <img src={p.url} alt={p.caption || p.originalName} loading="lazy" />
            <figcaption>
              <CommitInput
                className="inline-input"
                placeholder="Add a caption"
                value={p.caption}
                onCommit={async (caption) => {
                  try {
                    await api.patch(`/api/photos/${p.id}`, { caption });
                    await reload();
                  } catch (err) {
                    toastError(err);
                  }
                }}
              />
              <button
                className="icon-btn danger"
                title="Delete photo"
                onClick={async () => {
                  if (!confirmAction('Delete this photo?')) return;
                  try {
                    await api.del(`/api/photos/${p.id}`);
                    await reload();
                  } catch (err) {
                    toastError(err);
                  }
                }}
              >
                <Trash2 size={15} />
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
