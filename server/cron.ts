import cron from 'node-cron';
import { Database } from 'better-sqlite3';
import { fetchFeedArticles } from './rss.js';
import { getCategories, matchCategory } from './categories.js';
import { submitNewsToSheet } from './sheet.js';

const seenUrls = new Set<string>();
const seenTitles = new Set<string>();

/**
 * Fetches news from a website and saves to database if not already present.
 * Does NOT submit to Google Sheets.
 */
export async function importNewsForWebsite(db: Database, website: any, allowedCategories: string[]) {
  console.log(`[Fetch] Processing ${website.name} (${website.rss_url})`);
  try {
    const articles = await fetchFeedArticles(website.rss_url);
    let count = 0;
    
    for (const item of articles) {
      const articleUrl = item.link;
      const title = item.title;
      if (!articleUrl || !title) continue;

      // Duplicate prevention: Check in-memory Set first
      if (seenUrls.has(articleUrl) || seenTitles.has(title.toLowerCase().trim())) {
        continue;
      }

      // Duplicate prevention: Check if URL already exists in DB
      const existing = db.prepare('SELECT id FROM news WHERE article_url = ?').get(articleUrl);
      if (existing) {
        seenUrls.add(articleUrl);
        seenTitles.add(title.toLowerCase().trim());
        continue;
      }

      // Category matching
      let finalCategory: string;
      if (website.category && website.category !== 'All') {
        const matched = matchCategory(item, [website.category]);
        finalCategory = matched === website.category ? website.category : matchCategory(item, allowedCategories);
      } else {
        finalCategory = matchCategory(item, allowedCategories);
      }

      const description = item.description;
      const image = item.image;
      const publishDate = new Date(item.date).toISOString();

      try {
        db.prepare(`
          INSERT INTO news (title, description, image, source_id, category, article_url, publish_date, submitted)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `).run(title, description, image, website.id, finalCategory, articleUrl, publishDate);
        
        // Add to in-memory Set after successful insertion
        seenUrls.add(articleUrl);
        seenTitles.add(title.toLowerCase().trim());
        count++;
      } catch (err) {
        console.error(`[Fetch] Error inserting article "${title}":`, err);
      }
    }

    // Update last_sync time
    db.prepare('UPDATE websites SET last_sync = CURRENT_TIMESTAMP WHERE id = ?').run(website.id);
    console.log(`[Fetch] Completed ${website.name}: ${count} new articles saved.`);
    return count;
  } catch (error) {
    console.error(`[Fetch] Failed to process ${website.name}:`, error);
    return 0;
  }
}

let isImporting = false;
let isSubmitting = false;

/**
 * Manual trigger for news import and submission.
 * This replaces the automatic cron jobs.
 */
export async function runManualImport(db: Database) {
  if (isImporting || isSubmitting) {
    console.log('[Manual] Import or Submit job already running.');
    return { success: false, message: 'Job already running' };
  }

  console.log('[Manual] Starting manual news import and submission...');
  let totalImported = 0;

  try {
    // 1. Fetch News
    isImporting = true;
    const allowedCategories = await getCategories();
    const websites = db.prepare('SELECT * FROM websites WHERE status = ? AND rss_url IS NOT NULL').all('Active') as any[];
    
    const concurrencyLimit = 3;
    for (let i = 0; i < websites.length; i += concurrencyLimit) {
      const chunk = websites.slice(i, i + concurrencyLimit);
      const results = await Promise.all(chunk.map(website => importNewsForWebsite(db, website, allowedCategories)));
      totalImported += results.reduce((a, b) => a + b, 0);
    }
    
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(new Date().toISOString(), 'last_cron_run');
    isImporting = false;

    // 2. Submit News (if autoSubmit is ON)
    const autoSubmit = db.prepare('SELECT value FROM settings WHERE key = ?').get('autoSubmit') as { value: string } | undefined;
    if (autoSubmit?.value === 'ON') {
      isSubmitting = true;
      const pendingNews = db.prepare(`
        SELECT n.*, w.name as source 
        FROM news n 
        JOIN websites w ON n.source_id = w.id 
        WHERE n.submitted = 0 
        ORDER BY n.publish_date DESC 
        LIMIT 50
      `).all() as any[];

      if (pendingNews.length > 0) {
        console.log(`[Manual] Submitting ${pendingNews.length} pending articles...`);
        for (const newsItem of pendingNews) {
          try {
            await submitNewsToSheet(db, newsItem);
            db.prepare('UPDATE news SET submitted = 1 WHERE id = ?').run(newsItem.id);
          } catch (err) {
            console.error(`[Manual] Failed to submit "${newsItem.title}":`, err);
            db.prepare('UPDATE news SET submitted = 1 WHERE id = ?').run(newsItem.id);
          }
        }
      }
      isSubmitting = false;
    }

    console.log(`[Manual] Completed. Total imported: ${totalImported}`);
    return { success: true, imported: totalImported };
  } catch (error) {
    console.error('[Manual] Error during manual run:', error);
    isImporting = false;
    isSubmitting = false;
    return { success: false, error };
  }
}

export function startCronJobs(db: Database) {
  // Automatic cron jobs removed as per user request.
  // The system now relies on /run-news API trigger.
  console.log('Automatic cron jobs are disabled. Use /run-news to trigger import.');
}
