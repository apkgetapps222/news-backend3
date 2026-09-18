import Database from 'better-sqlite3';
import path from 'path';
import { matchCategory } from './categories.js';

export function setupDatabase() {
  const dbPath = path.join(process.cwd(), 'database.sqlite');
  const db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Create Websites Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS websites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      rss_url TEXT,
      category TEXT,
      country TEXT,
      status TEXT DEFAULT 'Active',
      last_sync DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create News Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      image TEXT,
      source_id INTEGER,
      category TEXT,
      article_url TEXT UNIQUE NOT NULL,
      publish_date DATETIME,
      submitted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES websites(id)
    )
  `);

  // Create Settings Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Initialize autoSubmit setting if not exists (User requested 'autoSubmit' key)
  const autoSubmitNew = db.prepare('SELECT value FROM settings WHERE key = ?').get('autoSubmit') as { value: string } | undefined;
  const autoSubmitOld = db.prepare('SELECT value FROM settings WHERE key = ?').get('auto_submit') as { value: string } | undefined;
  
  if (!autoSubmitNew) {
    const initialValue = autoSubmitOld?.value || 'ON';
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('autoSubmit', initialValue);
  } else if (autoSubmitNew.value === 'OFF') {
    // Force ON if it was OFF to address user request
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('ON', 'autoSubmit');
  }

  // Initialize max_description_words setting to 100 words default
  const maxWords = db.prepare('SELECT value FROM settings WHERE key = ?').get('max_description_words');
  if (!maxWords) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('max_description_words', '100');
  }

  // Initialize news_webhook_url setting if not exists
  const newsWebhook = db.prepare('SELECT value FROM settings WHERE key = ?').get('news_webhook_url');
  if (!newsWebhook) {
    const defaultUrl = "https://script.google.com/macros/s/AKfycbz4rb-pSfIGM0F6805VgUW80pfVdNwqxkNlX4q4j71dfF7ahz3d8u4YRZSPaEgYTzBo/exec";
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('news_webhook_url', defaultUrl);
  }

  // Initialize last_cron_run setting if not exists
  const lastCronRun = db.prepare('SELECT value FROM settings WHERE key = ?').get('last_cron_run');
  if (!lastCronRun) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('last_cron_run', 'Never');
  }

  // Migration: Add last_sync column if it doesn't exist
  try {
    db.exec('ALTER TABLE websites ADD COLUMN last_sync DATETIME');
  } catch (e) {
    // Column already exists
  }

  // Migration: Add submitted column if it doesn't exist
  try {
    db.exec('ALTER TABLE news ADD COLUMN submitted INTEGER DEFAULT 0');
  } catch (e) {
    // Column already exists
  }

  // Cleanup: Remove duplicate news items by title (keep the latest one)
  try {
    console.log('Cleaning up duplicate news items...');
    db.exec(`
      DELETE FROM news 
      WHERE id NOT IN (
        SELECT MAX(id) 
        FROM news 
        GROUP BY LOWER(TRIM(title))
      )
    `);
  } catch (e) {
    console.error('Error during duplicate cleanup:', e);
  }

  // Smart Category Migration: Re-classify existing news items with new smart filters
  try {
    const isUpgraded = db.prepare('SELECT value FROM settings WHERE key = ?').get('smart_category_v2');
    if (!isUpgraded) {
      console.log('Running smart category re-classification for existing news...');
      const articles = db.prepare('SELECT id, title, description, article_url FROM news').all() as Array<{
        id: number;
        title: string;
        description: string;
        article_url: string;
      }>;
      const updateStmt = db.prepare('UPDATE news SET category = ? WHERE id = ?');
      const updateAll = db.transaction((items) => {
        for (const item of items) {
          const newCat = matchCategory({
            title: item.title,
            description: item.description,
            link: item.article_url
          });
          updateStmt.run(newCat, item.id);
        }
      });
      updateAll(articles);
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('smart_category_v2', 'true');
      console.log(`Smart category re-classification complete! Processed ${articles.length} articles.`);
    }
  } catch (e) {
    console.error('Error during smart category re-classification:', e);
  }

  // Breaking News Image Migration: Replace old unsplash fallback images
  try {
    const BREAKING_NEWS_FALLBACK = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgns8GsVMfyX4OZ6ZzVmTpPvw86v4G5ZPNmZUoCvB8ZJjBg3GfrQCorH3YRTXXKABCUl5tgnPR90GjOt71EQEpUhwWhm8id7UBZwRPph9KZkgZV_MeKZPdnK6tUaJr857cHXZCQqn9TwXUBt740AzQD8TGfED2OjZ9Ai3qUP_hhBrDQKMpIdk9vbhIAPTI/s1254/Breaking%20Ic.png';
    const result = db.prepare(`
      UPDATE news 
      SET image = ? 
      WHERE image LIKE '%unsplash.com/photo-1504711434969-e33886168f5c%'
         OR image LIKE '%images.unsplash.com%'
    `).run(BREAKING_NEWS_FALLBACK);
    if (result.changes > 0) {
      console.log(`Migrated ${result.changes} news articles to new Breaking News image.`);
    }
  } catch (e) {
    console.error('Error during image migration:', e);
  }

  return db;
}
