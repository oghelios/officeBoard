import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { asc, eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Photo } from '@officeboard/shared';
import { config } from '../config.js';
import type { Db } from '../db/index.js';
import { schema } from '../db/index.js';
import { randomToken } from '../lib/crypto.js';

/** The display renders at 1080p; storing larger images only costs the Pi memory and decode time. */
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

export const PHOTO_URL_PREFIX = '/media/photos/';

export class PhotosService extends EventEmitter<{ change: [] }> {
  constructor(private db: Db) {
    super();
  }

  list(): Photo[] {
    return this.db.select().from(schema.photos).orderBy(asc(schema.photos.id)).all();
  }

  listWithUrls(): (Photo & { url: string })[] {
    return this.list().map((p) => ({ ...p, url: PHOTO_URL_PREFIX + p.filename }));
  }

  async add(buffer: Buffer, originalName: string): Promise<Photo> {
    const filename = `${Date.now()}-${randomToken(6).replace(/[^a-zA-Z0-9]/g, '')}.jpg`;
    const out = path.join(config.photosDir, filename);
    const info = await sharp(buffer, { failOn: 'error' })
      .rotate()
      .resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(out);
    const row = this.db
      .insert(schema.photos)
      .values({
        filename,
        originalName: originalName.slice(0, 200),
        caption: '',
        width: info.width,
        height: info.height,
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();
    this.emit('change');
    return row;
  }

  updateCaption(id: number, caption: string): Photo | null {
    const row = this.db
      .update(schema.photos)
      .set({ caption: caption.slice(0, 300) })
      .where(eq(schema.photos.id, id))
      .returning()
      .get();
    if (row) this.emit('change');
    return row ?? null;
  }

  async remove(id: number): Promise<boolean> {
    const row = this.db.select().from(schema.photos).where(eq(schema.photos.id, id)).get();
    if (!row) return false;
    this.db.delete(schema.photos).where(eq(schema.photos.id, id)).run();
    await fs.rm(path.join(config.photosDir, row.filename), { force: true });
    this.emit('change');
    return true;
  }
}
