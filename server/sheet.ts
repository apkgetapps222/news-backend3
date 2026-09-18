import axios from 'axios';
import { Database } from 'better-sqlite3';
import { isValidNewsArticle, BANNED_LINK_DOMAINS } from './rss.js';

const NEWS_SUBMIT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbz4rb-pSfIGM0F6805VgUW80pfVdNwqxkNlX4q4j71dfF7ahz3d8u4YRZSPaEgYTzBo/exec";
const NEWS_WEBHOOK_URL = process.env.NEWS_SUBMIT_WEBHOOK_URL || process.env.GOOGLE_SHEET_WEBHOOK_URL || NEWS_SUBMIT_WEBHOOK_URL;

function processDescription(description: string, headline: string, maxWords: number): string {
  // If description is empty, use headline
  let processed = (description || '').trim();
  if (!processed) {
    processed = headline;
  }

  // Clean HTML tags and decode common entities for clean Google Sheets display
  processed = processed
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();

  // Split into words and trim if exceeds maxWords
  const words = processed.split(/\s+/).filter(w => w.length > 0);
  if (words.length > maxWords) {
    return words.slice(0, maxWords).join(' ');
  }

  return processed;
}

// Global queue to ensure sequential submission and avoid concurrency issues with Google Apps Script
let isSubmitting = false;
const submissionQueue: { newsItem: any; resolve: (val: any) => void; reject: (err: any) => void }[] = [];

async function processQueue(db: Database) {
  if (isSubmitting || submissionQueue.length === 0) return;
  
  isSubmitting = true;
  const { newsItem, resolve, reject } = submissionQueue.shift()!;
  
  try {
    const result = await performSubmission(db, newsItem);
    resolve(result);
  } catch (error) {
    reject(error);
  } finally {
    isSubmitting = false;
    // Process next item in queue with a small delay to allow GAS to settle
    setTimeout(() => processQueue(db), 500);
  }
}

export async function submitNewsToSheet(db: Database, newsItem: any) {
  return new Promise((resolve, reject) => {
    submissionQueue.push({ newsItem, resolve, reject });
    processQueue(db);
  });
}

async function performSubmission(db: Database, newsItem: any) {
  // Get webhook URL from settings
  const webhookSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('news_webhook_url') as { value: string } | undefined;
  const url = webhookSetting?.value || NEWS_WEBHOOK_URL;
  
  if (!url) {
    console.error('Error: News Webhook URL is not defined.');
    return;
  }

  try {
    // Check if already submitted to avoid duplicates
    const currentStatus = db.prepare('SELECT submitted FROM news WHERE id = ?').get(newsItem.id) as { submitted: number } | undefined;
    if (currentStatus?.submitted) {
      console.log(`News already submitted, skipping: ${newsItem.title}`);
      return true;
    }

    // Quality Gatekeeper: Strictly block twitter widgets, pic.twitter.com, standalone dates, and boilerplate
    if (!isValidNewsArticle(newsItem.title, newsItem.article_url)) {
      console.warn(`[Sheet Guard] Blocked junk/social item from Google Sheet: "${newsItem.title}" (${newsItem.article_url})`);
      db.prepare('UPDATE news SET submitted = -1 WHERE id = ?').run(newsItem.id);
      return true;
    }

    // Get max description words from settings (default 100 words)
    const maxWordsSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('max_description_words') as { value: string } | undefined;
    const maxWords = parseInt(maxWordsSetting?.value || '100');

    // Get source name if not provided
    let sourceName = newsItem.source;
    if (!sourceName && newsItem.source_id) {
      const source = db.prepare('SELECT name FROM websites WHERE id = ?').get(newsItem.source_id) as { name: string } | undefined;
      sourceName = source?.name || 'Unknown';
    }

    let sourceDomain = 'Unknown';
    try {
      if (newsItem.article_url) {
        sourceDomain = new URL(newsItem.article_url).hostname.replace(/^www\./, '');
      }
    } catch (e) {
      console.warn('Failed to parse domain from URL:', newsItem.article_url);
    }

    // Domain Gatekeeper: Never allow t.co, twitter.com, x.com etc. as a news source domain
    if (BANNED_LINK_DOMAINS.some(d => sourceDomain === d || sourceDomain.endsWith(`.${d}`))) {
      console.warn(`[Sheet Guard] Blocked article with banned domain "${sourceDomain}": "${newsItem.title}"`);
      db.prepare('UPDATE news SET submitted = -1 WHERE id = ?').run(newsItem.id);
      return true;
    }

    const processedDescription = processDescription(newsItem.description, newsItem.title, maxWords);

    const payload = {
      action: 'submitNews',
      category: newsItem.category || 'General',
      timestamp: Date.now(),
      image: newsItem.image || '',
      headline: newsItem.title || 'No Title',
      summary: processedDescription,
      article_link: newsItem.article_url || '',
      image_credit: sourceName,
      source_domain: sourceDomain,
      source_name: sourceDomain,
      read_more_label: `Read more on ${sourceDomain}`
    };

    // Implement retry logic for slow Google Apps Script responses
    let attempts = 0;
    const maxAttempts = 3;
    let success = false;

    while (attempts < maxAttempts && !success) {
      try {
        attempts++;
        // Add action to URL as well, some GAS scripts prefer it there
        const submissionUrl = `${url}${url.includes('?') ? '&' : '?'}action=${payload.action}`;
        
        console.log(`Submitting news to Google Sheet: "${newsItem.title}" using URL: ${submissionUrl}`);
        
        const response = await axios.post(submissionUrl, payload, {
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 60000, // Increased to 60 seconds for slow GAS executions
          maxRedirects: 5
        });

        console.log(`Google Sheet response for "${newsItem.title}": Status ${response.status}`);

        if (response.status === 200 || response.status === 201 || response.status === 302) {
          // Immediately update database to prevent duplicates
          db.prepare('UPDATE news SET submitted = 1 WHERE id = ?').run(newsItem.id);
          console.log(`Successfully submitted news and updated DB: ${newsItem.title}`);
          success = true;
          return true;
        } else {
          console.warn(`Unexpected status code from Google Sheet: ${response.status}. Response: ${JSON.stringify(response.data)}`);
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.error || error.message;
        const statusCode = error.response?.status;
        const responseData = error.response?.data;
        
        console.warn(`Attempt ${attempts} failed for "${newsItem.title}": ${errorMsg} ${statusCode ? `(Status: ${statusCode})` : ''}`);
        if (responseData) {
          console.warn('Error response data:', JSON.stringify(responseData));
        }
        
        if (attempts === maxAttempts) {
          throw error;
        }
        
        // Exponential backoff: 5s, 10s
        const delay = attempts * 5000;
        console.warn(`Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (error: any) {
    console.error('Error submitting news to Google Sheet:', error.message);
    throw error;
  }
}
