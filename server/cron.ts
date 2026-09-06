import cron from 'node-cron';
import { Database } from 'better-sqlite3';
import { fetchFeedArticles, fetchOgImage, BREAKING_NEWS_IMAGE } from './rss.js';
import { getCategories, matchCategory, normalizeCategory } from './categories.js';
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
    let noImageStreak = 0;
    
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

      // Step 1: Image discovery
      let realImage = item.image;

      // If no image found in RSS, try fetching og:image from the article URL
      if (!realImage || realImage.includes('unsplash.com') || realImage === BREAKING_NEWS_IMAGE) {
        const ogImage = await fetchOgImage(articleUrl);
        if (ogImage) {
          realImage = ogImage;
        }
      }

      const hasRealImage = !!(
        realImage &&
        typeof realImage === 'string' &&
        realImage.startsWith('http') &&
        !realImage.includes('unsplash.com') &&
        realImage !== BREAKING_NEWS_IMAGE
      );

      let finalImage: string;

      if (hasRealImage) {
        // Reset streak when an article has a real image
        noImageStreak = 0;
        finalImage = realImage;
      } else {
        noImageStreak++;
        // User rule:
        // "agar nhi milta to us news ko skip karo
        // agar lagatar yani adhik mile to news url nahi mle to https://blogger...Breaking%20Ic.png ye url use kar lena... iske jagah
        // agr bar bar aaye to agar 4 lagatar aaye to 2 skip 2 me use kar lena"
        // Pattern: Streak 1 (isolated) -> skip
        //          Streak 2 -> use Breaking News image
        //          Streak 3 -> skip
        //          Streak 4 -> use Breaking News image (out of 4 consecutive: 2 skipped, 2 used with fallback!)
        if (noImageStreak % 2 === 1) {
          console.log(`[Fetch] Skipping article without image (streak #${noImageStreak}): "${title}"`);
          seenUrls.add(articleUrl);
          seenTitles.add(title.toLowerCase().trim());
          continue;
        } else {
          console.log(`[Fetch] Using Breaking News fallback image for article (streak #${noImageStreak}): "${title}"`);
          finalImage = BREAKING_NEWS_IMAGE;
        }
      }

      // Smart Category Matching
      let finalCategory = matchCategory(item, allowedCategories);
      if (finalCategory === 'World' && website.category && website.category !== 'All' && website.category !== 'General') {
        finalCategory = normalizeCategory(website.category);
      }

      const description = item.description || '';
      let publishDate: string;
      try {
        const d = new Date(item.date);
        publishDate = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      } catch {
        publishDate = new Date().toISOString();
      }

      try {
        db.prepare(`
          INSERT INTO news (title, description, image, source_id, category, article_url, publish_date, submitted)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `).run(title, description, finalImage, website.id, finalCategory, articleUrl, publishDate);
        
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
export async function runNewsFetch(db: Database) {
  if (isImporting) {
    console.log('[Fetch] Import job already in progress.');
    return { success: false, message: 'Import already running', imported: 0 };
  }

  console.log('[Fetch] Starting news import...');
  let totalImported = 0;

  try {
    isImporting = true;
    const allowedCategories = await getCategories();
    const websites = db.prepare('SELECT * FROM websites WHERE status = ? AND rss_url IS NOT NULL').all('Active') as any[];
    
    const concurrencyLimit = 8;
    for (let i = 0; i < websites.length; i += concurrencyLimit) {
      const chunk = websites.slice(i, i + concurrencyLimit);
      const results = await Promise.all(chunk.map(website => importNewsForWebsite(db, website, allowedCategories)));
      totalImported += results.reduce((a, b) => a + b, 0);
    }
    
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(new Date().toISOString(), 'last_cron_run');
    console.log(`[Fetch] News import completed. Added ${totalImported} new articles.`);
    return { success: true, imported: totalImported };
  } catch (error) {
    console.error('[Fetch] Error during news fetch:', error);
    return { success: false, error, imported: 0 };
  } finally {
    isImporting = false;
  }
}

export async function runNewsSubmit(db: Database) {
  if (isSubmitting) {
    console.log('[Submit] Submission job already running.');
    return { success: false, message: 'Submission already running', submitted: 0 };
  }

  const autoSubmit = db.prepare('SELECT value FROM settings WHERE key = ?').get('autoSubmit') as { value: string } | undefined;
  if (autoSubmit?.value !== 'ON') {
    console.log('[Submit] Auto-submit is OFF. Skipping submission.');
    return { success: true, message: 'Auto-submit is OFF', submitted: 0 };
  }

  try {
    isSubmitting = true;
    const pendingNews = db.prepare(`
      SELECT n.*, w.name as source 
      FROM news n 
      JOIN websites w ON n.source_id = w.id 
      WHERE n.submitted = 0 
      ORDER BY n.publish_date DESC 
      LIMIT 20
    `).all() as any[];

    if (pendingNews.length === 0) {
      console.log('[Submit] No pending news to submit.');
      return { success: true, submitted: 0 };
    }

    console.log(`[Submit] Submitting ${pendingNews.length} pending articles to Google Sheets...`);
    let submittedCount = 0;
    for (const newsItem of pendingNews) {
      try {
        await submitNewsToSheet(db, newsItem);
        db.prepare('UPDATE news SET submitted = 1 WHERE id = ?').run(newsItem.id);
        submittedCount++;
      } catch (err) {
        console.error(`[Submit] Failed to submit "${newsItem.title}":`, err);
        // Ensure flag is set to 1 to prevent infinite resubmission loops
        db.prepare('UPDATE news SET submitted = 1 WHERE id = ?').run(newsItem.id);
      }
    }
    console.log(`[Submit] Completed. Submitted ${submittedCount} articles.`);
    return { success: true, submitted: submittedCount };
  } catch (error) {
    console.error('[Submit] Error during submission:', error);
    return { success: false, error, submitted: 0 };
  } finally {
    isSubmitting = false;
  }
}

export async function runManualImport(db: Database) {
  console.log('[Cron] Manual trigger initiated.');
  // 1. Fetch News
  const fetchResult = await runNewsFetch(db);

  // 2. Submit News (non-blocking in background if autoSubmit is ON)
  const autoSubmit = db.prepare('SELECT value FROM settings WHERE key = ?').get('autoSubmit') as { value: string } | undefined;
  if (autoSubmit?.value === 'ON') {
    // Run submit asynchronously in the background so HTTP response is returned immediately to Render/cron-job.org
    runNewsSubmit(db).catch(err => {
      console.error('[Submit Background] Error:', err);
    });
  }

  return { success: true, imported: fetchResult.imported };
}

export function startCronJobs(db: Database) {
  // Automatic cron jobs removed as per user request.
  // The system now relies on /run-news API trigger.
  console.log('Automatic cron jobs are disabled. Use /run-news to trigger import.');
}
