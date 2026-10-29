import Parser from 'rss-parser';
import type { NewsData, NewsItem, Settings } from '@officeboard/shared';
import { sha256 } from '../lib/crypto.js';
import { errorMessage } from '../lib/http.js';

const parser = new Parser({
  timeout: 12_000,
  headers: { 'user-agent': 'OfficeBoard/0.1', accept: 'application/rss+xml, application/xml, text/xml, */*' },
});

const PER_FEED = 15;
const MAX_ITEMS = 60;

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

export async function fetchNews(settings: Settings): Promise<NewsData> {
  const feeds = settings.newsFeeds.filter((f) => f.enabled);
  const errors: NewsData['errors'] = [];
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        return parsed.items.slice(0, PER_FEED).flatMap<NewsItem>((item) => {
          if (!item.title) return [];
          const date = item.isoDate ?? item.pubDate;
          const ts = date ? new Date(date) : null;
          return [
            {
              id: sha256(`${feed.url}|${item.link ?? item.guid ?? item.title}`).slice(0, 16),
              title: cleanTitle(item.title),
              source: feed.name,
              link: item.link ?? null,
              publishedAt: ts && !Number.isNaN(ts.getTime()) ? ts.toISOString() : null,
            },
          ];
        });
      } catch (err) {
        errors.push({ feed: feed.name, message: errorMessage(err) });
        return [];
      }
    }),
  );

  if (feeds.length > 0 && errors.length === feeds.length) {
    throw new Error(`All news feeds failed (${errors.map((e) => e.feed).join(', ')})`);
  }

  // Interleave by recency; undated items fall to the end.
  const items = results
    .flat()
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, MAX_ITEMS);
  return { items, errors };
}
