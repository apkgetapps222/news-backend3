import Parser from 'rss-parser';
import axios from 'axios';
import { load } from 'cheerio';

export interface FeedArticle {
  title: string;
  link: string;
  date: string;
  description: string;
  image: string | null;
  categories: string[];
}

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['media:group', 'mediaGroup'],
      ['itunes:image', 'itunesImage'],
      ['image', 'image'],
      ['content:encoded', 'contentEncoded'],
      ['description', 'description'],
      ['enclosure', 'enclosure'],
      ['updated', 'updated'],
      ['pubDate', 'pubDate'],
      ['dc:date', 'dcDate'],
      ['category', 'category'],
    ],
  },
});

export const BREAKING_NEWS_IMAGE = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgns8GsVMfyX4OZ6ZzVmTpPvw86v4G5ZPNmZUoCvB8ZJjBg3GfrQCorH3YRTXXKABCUl5tgnPR90GjOt71EQEpUhwWhm8id7UBZwRPph9KZkgZV_MeKZPdnK6tUaJr857cHXZCQqn9TwXUBt740AzQD8TGfED2OjZ9Ai3qUP_hhBrDQKMpIdk9vbhIAPTI/s1254/Breaking%20Ic.png';

export const USER_AGENTS = [
  'Feedfetcher-Google; (+http://www.google.com/feedfetcher.html)',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
  'curl/8.4.0',
];

/**
 * Robust fetch that rotates User-Agents and handles WAF / anti-bot challenges.
 */
export async function robustFetch(url: string, timeout = 10000): Promise<{ data: any; str: string; status: number } | null> {
  for (const ua of USER_AGENTS) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.9, */*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://www.google.com/',
        },
        timeout,
        maxRedirects: 5,
        responseType: 'text',
        validateStatus: (status) => status < 500, // Handle 403 / 404 cleanly
      });

      if (response.status >= 400) {
        continue;
      }

      const str = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

      // Check for bot challenges (Cloudflare, PerimeterX, HUMAN, DataDome)
      if (
        str.includes('Verifying Device') ||
        str.includes('Just a moment...') ||
        str.includes('Attention Required! | Cloudflare') ||
        str.includes('Checking your browser before accessing')
      ) {
        continue;
      }

      return { data: response.data, str, status: response.status };
    } catch {
      // Try next user agent
    }
  }

  return null;
}

/**
 * Clean and sanitize XML string to fix common RSS/Atom formatting errors.
 */
export function cleanXmlString(xmlStr: string): string {
  if (!xmlStr) return '';
  let cleaned = xmlStr.trim();

  // Strip Byte Order Mark (BOM)
  if (cleaned.charCodeAt(0) === 0xFEFF) {
    cleaned = cleaned.substring(1);
  }

  // Strip leading non-XML characters before <?xml or <rss or <feed or <rdf:RDF
  const xmlStartIdx = cleaned.search(/<(\?xml|rss|feed|rdf:RDF)/i);
  if (xmlStartIdx > 0) {
    cleaned = cleaned.substring(xmlStartIdx);
  }

  // Remove illegal XML control characters (\x00-\x08, \x0B, \x0C, \x0E-\x1F)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  return cleaned;
}

/**
 * Clean and normalize image URLs (handles encoded slashes %2F, query params, etc.)
 */
export function cleanImageUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();

  // Decode URI component if slashes or colons are encoded
  if (url.includes('%2F') || url.includes('%2f') || url.includes('%3A') || url.includes('%3a')) {
    try {
      url = decodeURIComponent(url);
    } catch {
      // Keep original if decoding fails
    }
  }

  return url;
}

/**
 * Checks whether an extracted image URL is a real news image (not a blank/tracker/pixel placeholder)
 */
export function isValidRealImageUrl(url: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  const lower = url.toLowerCase();
  if (
    lower.includes('blank.jpg') ||
    lower.includes('blank.png') ||
    lower.includes('pixel') ||
    lower.includes('1x1') ||
    lower.includes('spacer') ||
    lower.includes('feedburner') ||
    lower.includes('feedsportal') ||
    lower.includes('doubleclick') ||
    lower.endsWith('.gif')
  ) {
    return false;
  }
  return true;
}

/**
 * Checks if a URL or body is a direct RSS/Atom/JSON feed.
 */
export async function isDirectFeed(url: string): Promise<boolean> {
  try {
    const res = await robustFetch(url, 4500);
    if (!res || !res.str) return false;

    const lower = res.str.toLowerCase();

    // Check RSS / Atom / RDF XML markers
    if (
      lower.includes('<rss') ||
      lower.includes('<feed') ||
      lower.includes('<rdf:rdf') ||
      lower.includes('xmlns="http://www.w3.org/2005/atom"') ||
      lower.includes('xmlns="http://purl.org/rss/1.0/"') ||
      (lower.includes('<?xml') && (lower.includes('<item') || lower.includes('<entry') || lower.includes('<channel')))
    ) {
      return true;
    }

    // Check JSON Feed specification
    if (
      lower.includes('"version": "https://jsonfeed.org') ||
      (lower.startsWith('{') && lower.includes('"items"') && (lower.includes('"feed_url"') || lower.includes('"home_page_url"')))
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Discover RSS feeds from HTML and common paths.
 */
async function discoverFeeds(baseUrl: string): Promise<string | null> {
  try {
    const res = await robustFetch(baseUrl, 6000);
    if (!res || !res.str) return null;

    const $ = load(res.str);
    const urlObj = new URL(baseUrl);
    const origin = `${urlObj.protocol}//${urlObj.host}`;

    // STEP 1: Extract from <link rel="alternate"> tags
    const linkTags = $('link[type*="rss"], link[type*="atom"], link[type*="xml"], link[type*="json"]');
    for (let i = 0; i < linkTags.length; i++) {
      let feedUrl = $(linkTags[i]).attr('href');
      if (feedUrl) {
        if (!feedUrl.startsWith('http')) {
          feedUrl = `${origin}${feedUrl.startsWith('/') ? '' : '/'}${feedUrl}`;
        }
        if (await isDirectFeed(feedUrl)) {
          return feedUrl;
        }
      }
    }

    // STEP 2: Extract from <a> tags pointing to feeds
    const aTags = $('a[href*="/feed"], a[href*="/rss"], a[href$=".xml"], a[href*="atom.xml"], a[href*="feed.xml"]');
    for (let i = 0; i < Math.min(aTags.length, 6); i++) {
      let href = $(aTags[i]).attr('href');
      if (href) {
        if (!href.startsWith('http')) {
          href = `${origin}${href.startsWith('/') ? '' : '/'}${href}`;
        }
        if (await isDirectFeed(href)) {
          return href;
        }
      }
    }

    // STEP 3: Probe common feed paths concurrently in batches
    const commonPaths = [
      '/feed/', '/feed',
      '/rss/', '/rss',
      '/rss.xml', '/feed.xml',
      '/atom.xml', '/index.xml',
      '/news/feed/', '/news/rss/',
      '/feeds/posts/default?alt=rss',
      '/?feed=rss2',
      '/feed/rss2/',
      '/arc/outboundfeeds/rss/',
    ];

    // Check first 4 paths in parallel
    const batchResults = await Promise.allSettled(
      commonPaths.map(async (p) => {
        const testUrl = `${origin}${p}`;
        const isFeed = await isDirectFeed(testUrl);
        if (isFeed) return testUrl;
        throw new Error('Not feed');
      })
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value) {
        return r.value;
      }
    }
  } catch (error: any) {
    console.warn(`Feed discovery failed for ${baseUrl}:`, error.message);
  }

  return null;
}

/**
 * Finds the working RSS/Atom feed URL for any website or direct link.
 */
export async function findRssFeed(inputUrl: string): Promise<string | null> {
  if (!inputUrl) return null;
  let url = inputUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  // STEP 1: Check if input URL itself is a direct feed
  if (await isDirectFeed(url)) {
    return url;
  }

  // Also check if adding/removing trailing slash makes it a direct feed
  const altUrl = url.endsWith('/') ? url.slice(0, -1) : `${url}/`;
  if (await isDirectFeed(altUrl)) {
    return altUrl;
  }

  // STEP 2: Discover feed from HTML links and common paths
  const discoveredUrl = await discoverFeeds(url);
  if (discoveredUrl) {
    return discoveredUrl;
  }

  return null;
}

/**
 * Extract image from RSS item in priority order.
 * Returns the cleaned image URL if found, or null if not found.
 */
export function extractImage(item: any): string | null {
  // 1. media:content
  if (item.mediaContent?.$?.url) return cleanImageUrl(item.mediaContent.$.url);
  if (item.mediaContent?.url) return cleanImageUrl(item.mediaContent.url);
  if (Array.isArray(item.mediaContent) && item.mediaContent[0]?.$?.url) return cleanImageUrl(item.mediaContent[0].$.url);
  if (typeof item.mediaContent === 'string' && item.mediaContent.startsWith('http')) return cleanImageUrl(item.mediaContent);

  // 2. media:thumbnail
  if (item.mediaThumbnail?.$?.url) return cleanImageUrl(item.mediaThumbnail.$.url);
  if (item.mediaThumbnail?.url) return cleanImageUrl(item.mediaThumbnail.url);
  if (Array.isArray(item.mediaThumbnail) && item.mediaThumbnail[0]?.$?.url) return cleanImageUrl(item.mediaThumbnail[0].$.url);
  if (typeof item.mediaThumbnail === 'string' && item.mediaThumbnail.startsWith('http')) return cleanImageUrl(item.mediaThumbnail);

  // 3. enclosure
  if (item.enclosure?.url) {
    const url = item.enclosure.url;
    const type = (item.enclosure.type || '').toLowerCase();
    if (!type.includes('audio') && !type.includes('video') && !url.endsWith('.mp3')) {
      return cleanImageUrl(url);
    }
  }

  // 4. media:group
  if (item.mediaGroup) {
    const mgContent = item.mediaGroup['media:content'] || item.mediaGroup.mediaContent;
    if (Array.isArray(mgContent) && mgContent[0]?.$?.url) return cleanImageUrl(mgContent[0].$.url);
    if (mgContent?.$?.url) return cleanImageUrl(mgContent.$.url);

    const mgThumb = item.mediaGroup['media:thumbnail'] || item.mediaGroup.mediaThumbnail;
    if (Array.isArray(mgThumb) && mgThumb[0]?.$?.url) return cleanImageUrl(mgThumb[0].$.url);
    if (mgThumb?.$?.url) return cleanImageUrl(mgThumb.$.url);
  }

  // 5. itunesImage
  if (item.itunesImage?.$?.href) return cleanImageUrl(item.itunesImage.$.href);
  if (typeof item.itunesImage === 'string' && item.itunesImage.startsWith('http')) return cleanImageUrl(item.itunesImage);

  // 6. item.image
  if (item.image?.url) return cleanImageUrl(item.image.url);
  if (typeof item.image === 'string' && item.image.startsWith('http')) return cleanImageUrl(item.image);

  // 7. <img src=""> inside contentEncoded or description or content
  const content = [
    item.contentEncoded,
    item.content,
    item.description,
    item.summary,
  ].filter(Boolean).join(' ');

  const imgRegex = /<img[^>]+(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["']/gi;
  let match;
  while ((match = imgRegex.exec(content)) !== null) {
    const src = match[1];
    if (
      src &&
      (src.startsWith('http://') || src.startsWith('https://')) &&
      !src.includes('1x1') &&
      !src.includes('feedburner.com') &&
      !src.includes('feedsportal.com') &&
      !src.includes('doubleclick.net') &&
      !src.includes('pixel') &&
      !src.endsWith('.gif')
    ) {
      return cleanImageUrl(src);
    }
  }

  return null;
}

/**
 * Fetches the article webpage to extract og:image or twitter:image.
 * Used as fallback when RSS item lacks an image.
 */
export async function fetchOgImage(articleUrl: string): Promise<string | null> {
  if (!articleUrl || !articleUrl.startsWith('http')) return null;
  try {
    const res = await robustFetch(articleUrl, 4000);
    if (!res || !res.str) return null;

    const html = res.str;

    // Search for og:image
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch && ogMatch[1] && isValidRealImageUrl(ogMatch[1])) {
      return cleanImageUrl(ogMatch[1]);
    }

    // Search for twitter:image
    const twMatch = html.match(/<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i);
    if (twMatch && twMatch[1] && isValidRealImageUrl(twMatch[1])) {
      return cleanImageUrl(twMatch[1]);
    }

    // Search for link rel="image_src"
    const linkMatch = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
    if (linkMatch && linkMatch[1] && isValidRealImageUrl(linkMatch[1])) {
      return cleanImageUrl(linkMatch[1]);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Ultra-lenient parser using Cheerio for any malformed or atypical RSS/Atom XML.
 */
export function parseXmlWithCheerio(xmlStr: string, feedUrl: string): FeedArticle[] {
  try {
    const $ = load(xmlStr, { xmlMode: true });
    const articles: FeedArticle[] = [];
    const urlObj = new URL(feedUrl);
    const origin = `${urlObj.protocol}//${urlObj.host}`;

    const items = $('item, entry');
    items.each((_, el) => {
      const $el = $(el);
      const title = $el.children('title').text().trim();

      let link = $el.children('link').attr('href') ||
                 $el.children('link').text().trim() ||
                 $el.children('guid').text().trim() ||
                 $el.children('id').text().trim();

      if (!title || !link) return;

      if (!link.startsWith('http')) {
        link = `${origin}${link.startsWith('/') ? '' : '/'}${link}`;
      }

      const date = $el.children('pubDate, published, updated, dc\\:date').first().text().trim() || new Date().toISOString();
      const description = $el.children('description, summary, content\\:encoded, content').first().text().trim() || '';

      // Image extraction
      let image: string | null = null;
      const mediaContent = $el.find('media\\:content, content[url]').first().attr('url');
      const mediaThumb = $el.find('media\\:thumbnail, thumbnail[url]').first().attr('url');
      const enclosure = $el.find('enclosure').first().attr('url');
      const itunesImg = $el.find('itunes\\:image').first().attr('href');
      const imgTag = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src');

      image = mediaContent || mediaThumb || enclosure || itunesImg || imgTag || null;
      if (!image) {
        const descMatch = /<img[^>]+(?:src|data-src)=["']([^"']+)["']/i.exec(description);
        if (descMatch && descMatch[1] && descMatch[1].startsWith('http')) {
          image = descMatch[1];
        }
      }

      const categories: string[] = [];
      $el.find('category').each((_, cat) => {
        const text = $(cat).text().trim();
        if (text) categories.push(text);
      });

      articles.push({
        title,
        link,
        date,
        description,
        image: image ? cleanImageUrl(image) : null,
        categories,
      });
    });

    return articles;
  } catch (err: any) {
    console.warn(`Cheerio XML parsing failed for ${feedUrl}:`, err.message);
    return [];
  }
}

/**
 * Parser for JSON Feed (v1 and v1.1 format).
 */
export function parseJsonFeed(data: any): FeedArticle[] {
  if (!data || !Array.isArray(data.items)) return [];
  return data.items.map((item: any) => ({
    title: item.title || item.summary || 'Untitled',
    link: item.url || item.id || '',
    date: item.date_published || item.date_modified || new Date().toISOString(),
    description: item.content_text || item.summary || item.content_html || '',
    image: item.image || item.banner_image || null,
    categories: Array.isArray(item.tags) ? item.tags : [],
  })).filter((item: any) => item.title && item.link);
}

/**
 * List of banned domains for news article links.
 * These are social networks, link shorteners, and widget providers.
 */
export const BANNED_LINK_DOMAINS = [
  't.co', 'twitter.com', 'x.com',
  'facebook.com', 'fb.com', 'fb.me',
  'instagram.com', 'threads.net',
  'youtube.com', 'youtu.be',
  'tiktok.com', 'linkedin.com',
  'pinterest.com', 'reddit.com',
  'wa.me', 'whatsapp.com',
  't.me', 'telegram.me', 'telegram.org',
  'bit.ly', 'tinyurl.com', 'buff.ly', 'ow.ly', 'goo.gl',
  'google.com/url',
];

/**
 * Patterns that represent non-headline content like raw URLs, pure dates, or navigation boilerplate.
 */
export const JUNK_TITLE_PATTERNS = [
  // Raw URLs or URL fragments
  /^https?:\/\//i,
  /^www\./i,
  /^pic\.twitter\.com/i,
  /^t\.co\//i,
  /\.(?:com|org|net|co|tv|io|xyz|gov|edu)\//i,

  // Pure dates or timestamps
  /^\s*(?:\d{1,4}[-/\.]\d{1,2}[-/\.]\d{1,4}|\d{1,2}[-/\.]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}(?:,? \d{2,4})?|\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?: \d{2,4})?)\s*$/i,
  /^\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\s*$/i,
  /^\s*\d+\s+(?:minutes?|hours?|days?|weeks?|months?|years?)\s+ago\s*$/i,

  // Site boilerplate & navigation
  /^(?:terms of service|privacy policy|terms & conditions|cookie policy|cookie settings|cookie preferences|about us|contact us|subscribe|sign in|log in|read more|view more|view all|click here|learn more|all rights reserved)$/i,
  /^(?:share on facebook|share on twitter|share on linkedin|follow us|share this article|download app|bbc news app|news app|get the app)$/i,
];

/**
 * Validates that an article is a genuine news story, and NOT a social media widget link,
 * tweet media URL (pic.twitter.com), standalone date, or site navigation link.
 */
export function isValidNewsArticle(title: string | null | undefined, link: string | null | undefined): boolean {
  if (!title || typeof title !== 'string') return false;
  if (!link || typeof link !== 'string') return false;

  const t = title.trim();
  const l = link.trim().toLowerCase();

  // 1. Length & word count check: Real news headlines require substance
  if (t.length < 20) return false;
  const words = t.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 3) return false;

  // 2. Reject titles matching junk patterns (dates, URLs, boilerplate)
  for (const pattern of JUNK_TITLE_PATTERNS) {
    if (pattern.test(t)) return false;
  }

  // 3. Reject title if it contains twitter media or link shorteners
  const lowerTitle = t.toLowerCase();
  if (lowerTitle.includes('pic.twitter.com') || lowerTitle.startsWith('t.co/')) {
    return false;
  }

  // 4. Reject links with banned domains (social networks, shorteners)
  try {
    const urlObj = new URL(l.startsWith('http') ? l : `https://${l}`);
    const host = urlObj.hostname.toLowerCase().replace(/^www\./, '');
    if (BANNED_LINK_DOMAINS.some(d => host === d || host.endsWith(`.${d}`))) {
      return false;
    }
  } catch {
    return false;
  }

  // 5. Reject file downloads / media files / RSS feeds
  const cleanPath = l.split('?')[0];
  if (/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|mp3|mp4|xml|rss)$/i.test(cleanPath)) {
    return false;
  }

  return true;
}

/**
 * Create a fallback pseudo-feed by scraping the homepage.
 * Strictly excludes social embeds, headers, navigation, and foreign domains.
 */
async function generatePseudoFeed(baseUrl: string): Promise<FeedArticle[]> {
  try {
    const res = await robustFetch(baseUrl, 15000);
    if (!res || !res.str) return [];

    const $ = load(res.str);
    const articles: FeedArticle[] = [];
    const urlObj = new URL(baseUrl);
    const origin = `${urlObj.protocol}//${urlObj.host}`;
    const baseHost = urlObj.hostname.toLowerCase().replace(/^www\./, '');

    // Remove noise containers before scraping links
    $('nav, header, footer, aside, .social, .share, .twitter-tweet, blockquote, .menu, .sidebar, .widget, .ad, .footer, .header, script, style').remove();

    $('article a, main a, [role="main"] a, .post a, .entry a, .story a, .card a, h2 a, h3 a').each((_, el) => {
      if (articles.length >= 20) return;

      const title = $(el).text().trim().replace(/\s+/g, ' ');
      let link = $(el).attr('href');

      if (title && link) {
        if (!link.startsWith('http')) {
          link = `${origin}${link.startsWith('/') ? '' : '/'}${link}`;
        }

        try {
          const linkObj = new URL(link);
          const linkHost = linkObj.hostname.toLowerCase().replace(/^www\./, '');
          // Strictly require link to belong to the website's own root domain
          if (linkHost !== baseHost && !linkHost.endsWith(`.${baseHost}`) && !baseHost.endsWith(`.${linkHost}`)) {
            return;
          }
        } catch {
          return;
        }

        // Quality check: Reject junk, social links, dates, navigation
        if (!isValidNewsArticle(title, link)) {
          return;
        }

        const lowerLink = link.toLowerCase();
        if (
          lowerLink.includes('/category/') ||
          lowerLink.includes('/tag/') ||
          lowerLink.includes('/author/') ||
          lowerLink.includes('/search/') ||
          lowerLink.includes('/login') ||
          lowerLink.includes('/signup') ||
          lowerLink.includes('/contact') ||
          lowerLink.includes('/terms') ||
          lowerLink.includes('/privacy')
        ) {
          return;
        }

        if (articles.find((a) => a.link === link)) return;

        let image = $(el).find('img').attr('src') ||
                    $(el).closest('article, div, section, li').find('img').attr('src');

        if (image && !image.startsWith('http')) {
          image = `${origin}${image.startsWith('/') ? '' : '/'}${image}`;
        }

        articles.push({
          title,
          link,
          date: new Date().toISOString(),
          description: '',
          image: image ? cleanImageUrl(image) : null,
          categories: [],
        });
      }
    });

    return articles;
  } catch (error: any) {
    console.error(`Pseudo-feed generation failed for ${baseUrl}:`, error.message);
    return [];
  }
}

/**
 * Universal Feed Fetcher & Parser:
 * Fetches and parses ANY type of RSS 2.0, RSS 1.0/RDF, Atom, JSON Feed,
 * and handles dirty XML, WAF protected feeds, and pseudo-feed fallbacks.
 */
export async function fetchFeedArticles(rawUrl: string): Promise<FeedArticle[]> {
  if (!rawUrl) return [];
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  console.log(`[FeedFetcher] Fetching articles from: ${url}`);

  const res = await robustFetch(url, 12000);
  if (!res || !res.str) {
    console.warn(`[FeedFetcher] Failed to fetch content from ${url}, attempting pseudo-feed...`);
    const pseudo = await generatePseudoFeed(url);
    return pseudo.filter(item => isValidNewsArticle(item.title, item.link));
  }

  const body = res.str;

  // 1. Try parsing as JSON Feed
  if (body.trim().startsWith('{')) {
    try {
      const jsonData = JSON.parse(body);
      const jsonArticles = parseJsonFeed(jsonData);
      if (jsonArticles.length > 0) {
        console.log(`[FeedFetcher] Successfully parsed JSON Feed for ${url}: ${jsonArticles.length} items`);
        return jsonArticles.filter(item => isValidNewsArticle(item.title, item.link));
      }
    } catch {
      // Not JSON, continue to XML
    }
  }

  // 2. Clean XML and try rss-parser
  const cleanedXml = cleanXmlString(body);

  if (
    cleanedXml.includes('<rss') ||
    cleanedXml.includes('<feed') ||
    cleanedXml.includes('<rdf:RDF') ||
    cleanedXml.includes('<?xml') ||
    cleanedXml.includes('<channel')
  ) {
    try {
      const feed = await parser.parseString(cleanedXml);
      const validItems = feed.items.filter((item) => item.title && (item.link || item.guid));

      if (validItems.length > 0) {
        console.log(`[FeedFetcher] Successfully parsed XML feed for ${url}: ${validItems.length} items`);
        const mapped = validItems.map((item) => ({
          title: item.title || 'Untitled',
          link: item.link || item.guid || '',
          date: item.pubDate || item.updated || (item as any).dcDate || (item as any).isoDate || new Date().toISOString(),
          description: item.contentSnippet || item.description || '',
          image: extractImage(item),
          categories: Array.isArray(item.categories) ? item.categories : (item.categories ? [item.categories] : []),
        }));
        return mapped.filter(item => isValidNewsArticle(item.title, item.link));
      }
    } catch (parserErr: any) {
      console.warn(`[FeedFetcher] rss-parser failed for ${url} (${parserErr.message}), falling back to Cheerio XML parser...`);
    }

    // 3. Fallback: Cheerio XML parser for malformed/unstandardized XML
    const cheerioArticles = parseXmlWithCheerio(cleanedXml, url);
    if (cheerioArticles.length > 0) {
      console.log(`[FeedFetcher] Cheerio XML parser recovered ${cheerioArticles.length} items for ${url}`);
      return cheerioArticles.filter(item => isValidNewsArticle(item.title, item.link));
    }
  }

  // 4. Fallback to scraping webpage pseudo-feed
  console.log(`[FeedFetcher] Content for ${url} was not direct XML/JSON feed, generating pseudo-feed from HTML...`);
  const pseudoArticles = await generatePseudoFeed(url);
  console.log(`[FeedFetcher] Pseudo-feed for ${url} found ${pseudoArticles.length} articles`);
  return pseudoArticles.filter(item => isValidNewsArticle(item.title, item.link));
}
