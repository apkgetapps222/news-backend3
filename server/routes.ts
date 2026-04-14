import { Express } from 'express';
import { Database } from 'better-sqlite3';
import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { findRssFeed, fetchFeedArticles } from './rss.js';
import { importNewsForWebsite } from './cron.js';
import { getCategories } from './categories.js';
import { submitNewsToSheet } from './sheet.js';

const DEFAULT_SYNC_URL = "https://docs.google.com/spreadsheets/d/1NiSBohmp68qy5jtOx6yovbR1S2901nk6GMlqv3Vcmds/edit?gid=623240700#gid=623240700";
const DEFAULT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyW0j1PbKzITg1QNLbWnQ18NYzNXAAgn76fgPMVJy_rY287ESYAMEhcS8scTnCMVN2R/exec";
const NEWS_SUBMIT_WEBHOOK_URL = DEFAULT_WEBHOOK_URL;

const SYNC_URL = process.env.GOOGLE_SHEET_SYNC_URL || DEFAULT_SYNC_URL;
const WEBHOOK_URL = process.env.GOOGLE_SHEET_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
const NEWS_WEBHOOK_URL = process.env.NEWS_SUBMIT_WEBHOOK_URL || NEWS_SUBMIT_WEBHOOK_URL;

console.log('Using Google Sheet Sync URL:', SYNC_URL);
console.log('Using Google Sheet Webhook URL (Websites):', WEBHOOK_URL);
console.log('Using News Submit Webhook URL:', NEWS_WEBHOOK_URL);

function getGoogleSheetCsvUrl(url: string): string | null {
  // Check if it's a direct Google Sheet URL
  if (url.includes('docs.google.com/spreadsheets/d/')) {
    const match = url.match(/\/d\/([^/]+)/);
    if (match) {
      const sheetId = match[1];
      // Extract gid if present
      const gidMatch = url.match(/[?&]gid=([^#&]+)/);
      const gid = gidMatch ? gidMatch[1] : '0';
      return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    }
  }
  return null;
}

async function syncWebsitesFromSheet(db: Database) {
  const url = SYNC_URL;
  if (!url) {
    console.error('SYNC_URL is not defined');
    return;
  }

  try {
    console.log('--- Google Sheet Sync Attempt ---');
    console.log('Original URL:', url);
    const csvUrl = getGoogleSheetCsvUrl(url);
    
    let websites: any[] = [];

    if (csvUrl) {
      console.log('Detected direct Google Sheet URL. Fetching as CSV:', csvUrl);
      const response = await axios.get(csvUrl, { responseType: 'text' });
      console.log('CSV Data received (first 100 chars):', response.data.substring(0, 100));
      
      // Parse CSV, skip the first row (headers) and map columns
      websites = parse(response.data, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
      console.log(`Parsed ${websites.length} rows from CSV.`);
    } else {
      console.log('Syncing websites from Google Sheet Webhook:', url);
      const response = await axios.get(url, {
        params: { sheetName: 'RssFeed' },
        maxRedirects: 5
      });
      
      websites = response.data;
      console.log('Raw data received from webhook:', JSON.stringify(websites).substring(0, 200));
      
      // Handle cases where data might be wrapped in an object
      if (websites && !Array.isArray(websites) && typeof websites === 'object') {
        const dataObj = websites as any;
        if (Array.isArray(dataObj.data)) {
          websites = dataObj.data;
        } else if (Array.isArray(dataObj.websites)) {
          websites = dataObj.websites;
        } else if (Array.isArray(dataObj.rows)) {
          websites = dataObj.rows;
        }
      }
    }

    if (!Array.isArray(websites)) {
      console.error('Invalid data format from Google Sheet (expected array, got:', typeof websites, ')');
      return;
    }

    console.log(`Processing ${websites.length} rows from sheet...`);

    for (const site of websites) {
      console.log('Processing row:', JSON.stringify(site));
      // Flexible header matching (case-insensitive and handles common variations)
      const name = site.name || site.Name || site.title || site.Title || site['Website Name'] || site['name'] || site['News Date'];
      const url = site.url || site.Url || site.URL || site.link || site.Link || site['Website URL'] || site['url'] || site['News Image'];
      let rss_url = site.rss_url || site.RssUrl || site.RSS || site.rss || site['RSS URL'] || site['rss_url'];
      const category = site.category || site.Category || site['News Headlines'] || 'General';
      const country = site.country || site.Country || site['News Summury'] || 'Global';
      const status = site.status || site.Status || site['Read More Source Link'] || 'Active';

      console.log(`Mapped values: name=${name}, url=${url}, rss_url=${rss_url}`);

      if (!name || !url || typeof name !== 'string' || typeof url !== 'string') {
        console.warn('Skipping row due to missing or invalid name/url:', site);
        continue;
      }

      // Check if already exists
      const exists = db.prepare('SELECT id, rss_url FROM websites WHERE url = ?').get(url) as { id: number, rss_url: string | null } | undefined;
      if (!exists) {
        // Try to find RSS if missing
        if (!rss_url) {
          console.log(`Searching for RSS feed for: ${url}`);
          rss_url = await findRssFeed(url);
        }

        const result = db.prepare(`
          INSERT INTO websites (name, url, rss_url, category, country, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(name, url, rss_url || null, category, country, status);
        
        const websiteId = result.lastInsertRowid;
        console.log(`Synced website from sheet: ${name} (ID: ${websiteId}, RSS: ${rss_url || 'Not found'})`);

        // Import news immediately if RSS is found
        if (rss_url) {
          const newWebsite = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
          getCategories().then(allowedCategories => {
            importNewsForWebsite(db, newWebsite, allowedCategories).catch(err => console.error('Error importing news on sync:', err));
          });
        }
      } else if (!exists.rss_url) {
        // Website exists but has no RSS URL, try to find it
        console.log(`Website exists but has no RSS, searching for: ${url}`);
        const foundRss = await findRssFeed(url);
        if (foundRss) {
          db.prepare('UPDATE websites SET rss_url = ? WHERE id = ?').run(foundRss, exists.id);
          console.log(`Updated existing website ${name} with found RSS: ${foundRss}`);
          
          // Import news immediately
          const updatedWebsite = db.prepare('SELECT * FROM websites WHERE id = ?').get(exists.id);
          getCategories().then(allowedCategories => {
            importNewsForWebsite(db, updatedWebsite, allowedCategories).catch(err => console.error('Error importing news on update sync:', err));
          });
        }
      } else {
        console.log(`Website already exists with RSS: ${url}`);
      }
    }
    console.log('--- End Google Sheet Sync ---');
  } catch (error: any) {
    console.error('Error syncing from Google Sheet:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
    }
  }
}

async function sendWebsiteToSheet(website: any) {
  const url = WEBHOOK_URL;
  if (!url) {
    console.error('Error: Google Sheet Webhook URL is not defined.');
    return;
  }

  try {
    console.log('--- Google Sheet Add Website Attempt ---');
    console.log('URL:', url);
    
    const payload = {
      action: 'addWebsite',
      sheetName: 'RssFeed',
      name: website.name,
      url: website.url,
      rss_url: website.rss_url,
      category: website.category,
      country: website.country,
      status: website.status
    };

    console.log('Payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(url, payload, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      maxRedirects: 5
    });
    
    console.log('Response Status:', response.status);
    console.log('Response Data:', response.data);

    if (response.status === 200 || response.status === 302) {
      console.log('Successfully sent data to Google Sheet');
    } else {
      console.error('Failed to add website to Google Sheet. Status:', response.status);
    }
    console.log('--- End Google Sheet Attempt ---');
  } catch (error: any) {
    console.error('Error sending website to Google Sheet:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

async function syncSubmittedNewsFromSheet(db: Database) {
  const url = NEWS_WEBHOOK_URL;
  if (!url) {
    console.error('NEWS_WEBHOOK_URL is not defined');
    return;
  }

  try {
    console.log('--- Syncing Submitted News from Sheet ---');
    // Using POST for all actions as it's more reliable with GAS
    const response = await axios.post(url, { action: 'getSubmittedNews' }, {
      headers: { 'Content-Type': 'application/json' },
      maxRedirects: 5
    });

    const submittedItems = response.data;
    if (!Array.isArray(submittedItems)) {
      console.warn('Invalid data format for submitted news (expected array)');
      return;
    }

    console.log(`Found ${submittedItems.length} submitted items in sheet.`);

    for (const item of submittedItems) {
      let title = item.title || item.Title;
      let link = item.link || item.Link || item.url || item.Url;

      if (!title && !link) continue;

      // Update local DB
      if (link && typeof link === 'string') {
        db.prepare('UPDATE news SET submitted = 1 WHERE article_url = ?').run(link);
      }
      
      if (title && typeof title === 'string') {
        const normalizedTitle = title.toLowerCase().trim();
        db.prepare('UPDATE news SET submitted = 1 WHERE LOWER(TRIM(title)) = ?').run(normalizedTitle);
      }
    }
    console.log('--- End Syncing Submitted News ---');
  } catch (error: any) {
    console.error('Error syncing submitted news:', error.message);
  }
}

export function setupRoutes(app: Express, db: Database) {
  // Initial sync
  syncWebsitesFromSheet(db);
  syncSubmittedNewsFromSheet(db);

  // API: Run News Import (Manual Trigger)
  app.get('/run-news', async (req, res) => {
    console.log("Cron triggered");
    try {
      const { runManualImport } = await import('./cron.js');
      const result = await runManualImport(db);
      console.log("News import done");
      res.send("News import done");
    } catch (error) {
      console.error('Manual trigger failed:', error);
      res.status(500).send("News import failed");
    }
  });

  // Admin API: Get Settings
  app.get('/api/admin/settings', (req, res) => {
    try {
      const settings = db.prepare('SELECT * FROM settings').all();
      const settingsMap = settings.reduce((acc: any, curr: any) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
      res.json(settingsMap);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  // Admin API: Update Setting
  app.post('/api/admin/settings', (req, res) => {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }
    try {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update setting' });
    }
  });

  // Admin API: Submit all pending news
  app.post('/api/admin/submit-pending', async (req, res) => {
    try {
      const pendingNews = db.prepare('SELECT * FROM news WHERE submitted = 0 ORDER BY publish_date DESC LIMIT 50').all();
      
      if (pendingNews.length === 0) {
        return res.json({ message: 'No pending news to submit.' });
      }

      // We don't await all, just start the process in the background via the queue
      // but we'll return the count
      for (const newsItem of pendingNews) {
        submitNewsToSheet(db, newsItem).catch(err => console.error('Background submission failed:', err));
      }
      
      res.json({ success: true, count: pendingNews.length });
    } catch (error) {
      res.status(500).json({ error: 'Failed to submit pending news' });
    }
  });

  // Admin API: Reset all submitted status
  app.post('/api/admin/reset-submitted', (req, res) => {
    try {
      db.prepare('UPDATE news SET submitted = 0').run();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reset submitted status' });
    }
  });

  // Admin API: Sync all news manually
  app.post('/api/admin/sync-news', async (req, res) => {
    try {
      const allowedCategories = await getCategories();
      const websites = db.prepare('SELECT * FROM websites WHERE status = ? AND rss_url IS NOT NULL').all('Active') as any[];
      
      let totalImported = 0;
      for (const website of websites) {
        totalImported += await importNewsForWebsite(db, website, allowedCategories);
      }
      res.json({ success: true, imported: totalImported });
    } catch (error) {
      console.error('Manual news sync failed:', error);
      res.status(500).json({ error: 'Failed to sync news' });
    }
  });

  // Admin API: Sync from Google Sheet manually
  app.post('/api/admin/sync-sheet', async (req, res) => {
    try {
      await syncWebsitesFromSheet(db);
      await syncSubmittedNewsFromSheet(db);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to sync from Google Sheet' });
    }
  });

  // API: Get Categories
  app.get('/api/categories', async (req, res) => {
    try {
      const categories = await getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  // Debug API: Get Raw Websites
  app.get('/api/admin/debug/websites', (req, res) => {
    try {
      const websites = db.prepare('SELECT * FROM websites').all();
      res.json(websites);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch websites' });
    }
  });

  // Admin API: Get Webhook URL (for debugging)
  app.get('/api/admin/debug/webhook-url', (req, res) => {
    res.json({ url: NEWS_WEBHOOK_URL });
  });

  // Admin API: Get Debug Stats
  app.get('/api/admin/debug/stats', (req, res) => {
    try {
      const totalNews = db.prepare('SELECT COUNT(*) as count FROM news').get() as { count: number };
      const submittedNews = db.prepare('SELECT COUNT(*) as count FROM news WHERE submitted = 1').get() as { count: number };
      const pendingNews = db.prepare('SELECT COUNT(*) as count FROM news WHERE submitted = 0').get() as { count: number };
      const totalWebsites = db.prepare('SELECT COUNT(*) as count FROM websites').get() as { count: number };
      const activeWebsites = db.prepare('SELECT COUNT(*) as count FROM websites WHERE status = "Active"').get() as { count: number };
      
      const lastNews = db.prepare('SELECT title, publish_date, submitted FROM news ORDER BY id DESC LIMIT 5').all();
      const websitesStatus = db.prepare('SELECT name, rss_url, status FROM websites').all();

      res.json({
        totalNews: totalNews.count,
        submittedNews: submittedNews.count,
        pendingNews: pendingNews.count,
        totalWebsites: totalWebsites.count,
        activeWebsites: activeWebsites.count,
        lastNews,
        websitesStatus
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch debug stats' });
    }
  });

  // Admin API: Get Dashboard Stats
  app.get('/api/admin/stats', (req, res) => {
    try {
      const totalWebsites = db.prepare('SELECT COUNT(*) as count FROM websites').get() as { count: number };
      const activeSources = db.prepare('SELECT COUNT(*) as count FROM websites WHERE status = ?').get('Active') as { count: number };
      const totalNews = db.prepare('SELECT COUNT(*) as count FROM news').get() as { count: number };
      const todayNews = db.prepare("SELECT COUNT(*) as count FROM news WHERE DATE(created_at) = DATE('now')").get() as { count: number };
      const latestNews = db.prepare("SELECT id, title, created_at, publish_date FROM news ORDER BY id DESC LIMIT 5").all();
      const lastCronRun = db.prepare('SELECT value FROM settings WHERE key = ?').get('last_cron_run') as { value: string } | undefined;

      res.json({
        totalWebsites: totalWebsites.count,
        activeSources: activeSources.count,
        totalNews: totalNews.count,
        todayNews: todayNews.count,
        latestNews: latestNews,
        lastCronRun: lastCronRun?.value || 'Never'
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // Admin API: Add Website
  app.post('/api/admin/websites', async (req, res) => {
    const { name, url, category, country, status } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    try {
      const rssUrl = await findRssFeed(url);
      let articles: any[] = [];
      if (rssUrl) {
        articles = await fetchFeedArticles(rssUrl);
      } else {
        // If no RSS found, try pseudo-feed from the provided URL
        articles = await fetchFeedArticles(url);
      }
      
      const websiteData = {
        name,
        url,
        rss_url: rssUrl || url, // Store the original URL as rss_url if no RSS found (it will use pseudo-feed)
        category: category || 'General',
        country: country || 'Global',
        status: status || 'Active'
      };

      const result = db.prepare(`
        INSERT INTO websites (name, url, rss_url, category, country, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        websiteData.name, 
        websiteData.url, 
        websiteData.rss_url, 
        websiteData.category, 
        websiteData.country, 
        websiteData.status
      );

      const websiteId = result.lastInsertRowid;

      // Send to Google Sheet
      sendWebsiteToSheet(websiteData);

      // Import news immediately in the background
      const newWebsite = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
      getCategories().then(allowedCategories => {
        importNewsForWebsite(db, newWebsite, allowedCategories).catch(err => console.error('Error importing news on add:', err));
      });

      res.json({ id: websiteId, rssUrl: websiteData.rss_url, articles });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to add website' });
    }
  });

  // API: Submit News to Sheet
  app.post('/api/news/submit-to-sheet', async (req, res) => {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'News ID is required' });
    }

    try {
      const newsItem = db.prepare(`
        SELECT n.*, w.name as source
        FROM news n
        JOIN websites w ON n.source_id = w.id
        WHERE n.id = ?
      `).get(id) as any;

      if (!newsItem) {
        return res.status(404).json({ error: 'News not found' });
      }

      if (newsItem.submitted) {
        return res.status(400).json({ error: 'This news is already posted', alreadySubmitted: true });
      }

      await submitNewsToSheet(db, newsItem);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error submitting news to Google Sheet:', error.message);
      res.status(500).json({ error: 'Failed to submit to sheet', details: error.message });
    }
  });

  // Admin API: Sync Website manually
  app.post('/api/admin/websites/:id/sync', async (req, res) => {
    const { id } = req.params;
    try {
      const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(id) as any;
      if (!website || !website.rss_url) {
        return res.status(400).json({ error: 'Website or RSS URL not found' });
      }
      
      const allowedCategories = await getCategories();
      const count = await importNewsForWebsite(db, website, allowedCategories);
      res.json({ success: true, imported: count });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to sync website' });
    }
  });

  // Admin API: Get Websites
  app.get('/api/admin/websites', (req, res) => {
    const websites = db.prepare(`
      SELECT w.*, COUNT(n.id) as total_news
      FROM websites w
      LEFT JOIN news n ON w.id = n.source_id
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `).all();
    res.json(websites);
  });

  // Admin API: Update Website
  app.put('/api/admin/websites/:id', (req, res) => {
    const { id } = req.params;
    const { name, url, rss_url, category, country, status } = req.body;
    
    try {
      db.prepare(`
        UPDATE websites
        SET name = ?, url = ?, rss_url = ?, category = ?, country = ?, status = ?
        WHERE id = ?
      `).run(name, url, rss_url || null, category, country, status, id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update website' });
    }
  });

  // Admin API: Delete Website
  app.delete('/api/admin/websites/:id', (req, res) => {
    const { id } = req.params;
    try {
      // Delete associated news first
      db.prepare('DELETE FROM news WHERE source_id = ?').run(id);
      db.prepare('DELETE FROM websites WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete website' });
    }
  });

  // Mobile API: Get Latest News
  app.get('/api/news/latest', (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const keyword = req.query.keyword as string;

    let query = `
      SELECT n.id, n.title, n.image, w.name as source, n.publish_date, n.article_url, n.category, n.submitted
      FROM news n
      JOIN websites w ON n.source_id = w.id
    `;
    
    const params: any[] = [];
    if (keyword) {
      query += ` WHERE n.title LIKE ? OR n.description LIKE ?`;
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    query += ` ORDER BY n.publish_date DESC, n.id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const news = db.prepare(query).all(...params);
    res.json(news);
  });

  // Mobile API: Get News by Category
  app.get('/api/news/category/:category', async (req, res) => {
    const { category } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    let news;
    if (category === 'All') {
      // Fetch news from all available categories
      try {
        const allowedCategories = await getCategories();
        // Filter out 'All' if it's in the list
        const validCategories = allowedCategories.filter(c => c !== 'All');
        
        if (validCategories.length > 0) {
          const placeholders = validCategories.map(() => '?').join(',');
          news = db.prepare(`
            SELECT n.id, n.title, n.image, w.name as source, n.publish_date, n.article_url, n.category, n.submitted
            FROM news n
            JOIN websites w ON n.source_id = w.id
            WHERE n.category IN (${placeholders})
            ORDER BY n.publish_date DESC
            LIMIT ? OFFSET ?
          `).all(...validCategories, limit, offset);
        } else {
          // Fallback if no categories are found
          news = db.prepare(`
            SELECT n.id, n.title, n.image, w.name as source, n.publish_date, n.article_url, n.category, n.submitted
            FROM news n
            JOIN websites w ON n.source_id = w.id
            ORDER BY n.publish_date DESC
            LIMIT ? OFFSET ?
          `).all(limit, offset);
        }
      } catch (error) {
        // Fallback on error
        news = db.prepare(`
          SELECT n.id, n.title, n.image, w.name as source, n.publish_date, n.article_url, n.category, n.submitted
          FROM news n
          JOIN websites w ON n.source_id = w.id
          ORDER BY n.publish_date DESC
          LIMIT ? OFFSET ?
        `).all(limit, offset);
      }
    } else {
      news = db.prepare(`
        SELECT n.id, n.title, n.image, w.name as source, n.publish_date, n.article_url, n.category, n.submitted
        FROM news n
        JOIN websites w ON n.source_id = w.id
        WHERE n.category = ?
        ORDER BY n.publish_date DESC
        LIMIT ? OFFSET ?
      `).all(category, limit, offset);
    }

    res.json(news);
  });

  // Mobile API: Get News by Source
  app.get('/api/news/source/:source', (req, res) => {
    const { source } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const news = db.prepare(`
      SELECT n.id, n.title, n.image, w.name as source, n.publish_date, n.article_url, n.category, n.submitted
      FROM news n
      JOIN websites w ON n.source_id = w.id
      WHERE w.name = ?
      ORDER BY n.publish_date DESC
      LIMIT ? OFFSET ?
    `).all(source, limit, offset);

    res.json(news);
  });

  // Mobile API: Get News Details
  app.get('/api/news/:id', (req, res) => {
    const { id } = req.params;
    const news = db.prepare(`
      SELECT n.*, w.name as source
      FROM news n
      JOIN websites w ON n.source_id = w.id
      WHERE n.id = ?
    `).get(id);

    if (!news) {
      return res.status(404).json({ error: 'News not found' });
    }

    res.json(news);
  });
}
