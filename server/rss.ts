import Parser from 'rss-parser';
import axios from 'axios';
import { load } from 'cheerio';

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
    ],
  },
});

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, text/html;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Referer': 'https://www.google.com/',
};

export const BREAKING_NEWS_IMAGE = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgns8GsVMfyX4OZ6ZzVmTpPvw86v4G5ZPNmZUoCvB8ZJjBg3GfrQCorH3YRTXXKABCUl5tgnPR90GjOt71EQEpUhwWhm8id7UBZwRPph9KZkgZV_MeKZPdnK6tUaJr857cHXZCQqn9TwXUBt740AzQD8TGfED2OjZ9Ai3qUP_hhBrDQKMpIdk9vbhIAPTI/s1254/Breaking%20Ic.png';

/**
 * STEP 2: Detect if the URL is a direct RSS/Atom feed
 */
async function isDirectFeed(url: string): Promise<boolean> {
  try {
    const response = await axios.get(url, { 
      timeout: 10000,
      headers: COMMON_HEADERS,
      validateStatus: () => true 
    });

    const contentType = (response.headers['content-type'] || '').toLowerCase();
    const body = (response.data || '').toString().toLowerCase();

    if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) {
      return true;
    }

    if (body.includes('<rss') || body.includes('<feed') || body.includes('<xml')) {
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * STEP 3 & 4: Discover RSS feeds from HTML and common paths
 */
async function discoverFeeds(baseUrl: string): Promise<string | null> {
  try {
    const response = await axios.get(baseUrl, { 
      timeout: 30000,
      headers: COMMON_HEADERS
    });
    const $ = load(response.data);
    
    // STEP 2: Extract from <link> tags
    const links = $('link[type="application/rss+xml"], link[type="application/atom+xml"], link[type="text/xml"]');
    
    if (links.length > 0) {
      let feedUrl = links.first().attr('href');
      if (feedUrl) {
        if (!feedUrl.startsWith('http')) {
          const urlObj = new URL(baseUrl);
          feedUrl = `${urlObj.protocol}//${urlObj.host}${feedUrl.startsWith('/') ? '' : '/'}${feedUrl}`;
        }
        return feedUrl;
      }
    }

    // STEP 3 & 4: Try common and advanced paths
    const commonPaths = [
      '/feed', '/rss', '/rss.xml', '/feed.xml', '/feeds', '/atom.xml', '/index.xml',
      '/blog/rss.xml', '/news/rss.xml',
      '/arc/outboundfeeds/rss/', '/category/news/rss.xml', '/category/sports/rss.xml'
    ];
    const urlObj = new URL(baseUrl);
    const origin = `${urlObj.protocol}//${urlObj.host}`;

    for (const p of commonPaths) {
      const testUrl = `${origin}${p}`;
      if (await isDirectFeed(testUrl)) {
        return testUrl;
      }
    }
  } catch (error) {
    console.warn(`Feed discovery failed for ${baseUrl}:`, (error as any).message);
  }

  return null;
}

/**
 * STEP 6: Create a fallback pseudo-feed by scraping the homepage
 */
async function generatePseudoFeed(baseUrl: string) {
  try {
    const response = await axios.get(baseUrl, { 
      timeout: 30000,
      headers: COMMON_HEADERS
    });
    const $ = load(response.data);
    const articles: any[] = [];
    const urlObj = new URL(baseUrl);
    const origin = `${urlObj.protocol}//${urlObj.host}`;

    // Try to find article-like structures
    $('a, h2 a, h3 a, .article-title a, .entry-title a').each((i, el) => {
      if (articles.length >= 20) return; // Increased to 20 articles

      const title = $(el).text().trim();
      let link = $(el).attr('href');
      
      // Basic heuristic: title should be long enough, link should be internal or full
      if (title.length > 10 && link) {
        if (!link.startsWith('http')) {
          link = `${origin}${link.startsWith('/') ? '' : '/'}${link}`;
        }
        
        // Filter out common non-article links
        const lowerLink = link.toLowerCase();
        if (lowerLink.includes('/category/') || lowerLink.includes('/tag/') || lowerLink.includes('/author/') || lowerLink.includes('/search/')) return;
        if (lowerLink.endsWith('.jpg') || lowerLink.endsWith('.png') || lowerLink.endsWith('.pdf')) return;

        // Avoid duplicates
        if (articles.find(a => a.link === link)) return;

        // Try to find an image nearby
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
          image: image || null,
          categories: []
        });
      }
    });

    return articles;
  } catch (error) {
    console.error(`Pseudo-feed generation failed for ${baseUrl}:`, error);
    return [];
  }
}

export async function findRssFeed(url: string): Promise<string | null> {
  // STEP 1: Check if direct feed
  if (await isDirectFeed(url)) {
    return url;
  }

  // STEP 2-4: Discover
  const discoveredUrl = await discoverFeeds(url);
  if (discoveredUrl) {
    return discoveredUrl;
  }

  return null;
}

/**
 * Extract image from RSS item in priority order.
 * Returns the image URL if found, or null if not found.
 */
export function extractImage(item: any): string | null {
  // 1. media:content
  if (item.mediaContent?.$?.url) return item.mediaContent.$.url;
  if (item.mediaContent?.url) return item.mediaContent.url;
  if (typeof item.mediaContent === 'string' && item.mediaContent.startsWith('http')) return item.mediaContent;

  // 2. media:thumbnail
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  if (item.mediaThumbnail?.url) return item.mediaThumbnail.url;
  if (typeof item.mediaThumbnail === 'string' && item.mediaThumbnail.startsWith('http')) return item.mediaThumbnail;

  // 3. enclosure
  if (item.enclosure?.url) {
    const url = item.enclosure.url;
    const type = (item.enclosure.type || '').toLowerCase();
    if (!type.includes('audio') && !type.includes('video') && !url.endsWith('.mp3')) {
      return url;
    }
  }

  // 4. media:group
  if (item.mediaGroup) {
    const mgContent = item.mediaGroup['media:content'] || item.mediaGroup.mediaContent;
    if (Array.isArray(mgContent) && mgContent[0]?.$?.url) return mgContent[0].$.url;
    if (mgContent?.$?.url) return mgContent.$.url;

    const mgThumb = item.mediaGroup['media:thumbnail'] || item.mediaGroup.mediaThumbnail;
    if (Array.isArray(mgThumb) && mgThumb[0]?.$?.url) return mgThumb[0].$.url;
    if (mgThumb?.$?.url) return mgThumb.$.url;
  }

  // 5. itunesImage
  if (item.itunesImage?.$?.href) return item.itunesImage.$.href;
  if (typeof item.itunesImage === 'string' && item.itunesImage.startsWith('http')) return item.itunesImage;

  // 6. item.image
  if (item.image?.url) return item.image.url;
  if (typeof item.image === 'string' && item.image.startsWith('http')) return item.image;

  // 7. <img src=""> inside contentEncoded or description or content
  const content = [
    item.contentEncoded,
    item.content,
    item.description,
    item.summary
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
      return src;
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
    const response = await axios.get(articleUrl, {
      headers: COMMON_HEADERS,
      timeout: 3000,
      validateStatus: (status) => status < 400,
      maxContentLength: 150000, // Read only the first 150KB for speed
      responseType: 'text'
    });

    const html = typeof response.data === 'string' ? response.data : '';
    if (!html) return null;

    // Search for og:image
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch && ogMatch[1] && ogMatch[1].startsWith('http')) {
      return ogMatch[1];
    }

    // Search for twitter:image
    const twMatch = html.match(/<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i);
    if (twMatch && twMatch[1] && twMatch[1].startsWith('http')) {
      return twMatch[1];
    }

    // Search for link rel="image_src"
    const linkMatch = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
    if (linkMatch && linkMatch[1] && linkMatch[1].startsWith('http')) {
      return linkMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * STEP 3 & 8: Parse and Validate
 */
export async function fetchFeedArticles(url: string) {
  console.log(`Fetching articles from: ${url}`);
  // Try parsing as RSS first
  try {
    const response = await axios.get(url, { 
      headers: COMMON_HEADERS,
      timeout: 10000 
    });
    
    const body = response.data.toString();
    console.log(`Response received from ${url}, length: ${body.length}`);
    
    if (body.includes('<rss') || body.includes('<feed') || body.includes('<xml')) {
      const feed = await parser.parseString(body);
      console.log(`Successfully parsed RSS for ${url}, found ${feed.items.length} items`);
      
      // STEP 7: Validation - Ensure title + link exists
      const validItems = feed.items.filter(item => item.title && (item.link || item.guid));
      console.log(`Found ${validItems.length} valid items for ${url}`);

      return validItems.map(item => ({
        title: item.title,
        link: item.link || item.guid,
        date: item.pubDate || item.updated || item.isoDate || new Date().toISOString(),
        description: item.contentSnippet || item.description || '',
        image: extractImage(item),
        categories: item.categories || []
      }));
    } else {
      console.log(`Body for ${url} does not look like RSS/XML, falling back to pseudo-feed`);
    }
  } catch (error: any) {
    console.warn(`Feed parsing failed for ${url}: ${error.message}, trying pseudo-feed...`);
  }

  // STEP 6: Fallback to pseudo-feed if parsing failed or not a direct feed
  const pseudoArticles = await generatePseudoFeed(url);
  console.log(`Pseudo-feed for ${url} found ${pseudoArticles.length} articles`);
  return pseudoArticles;
}
