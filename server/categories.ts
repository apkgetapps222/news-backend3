const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1NiSBohmp68qy5jtOx6yovbR1S2901nk6GMlqv3Vcmds/export?format=csv&gid=1811705002';

let cachedCategories: string[] = [];
let lastFetchTime = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export async function getCategories(): Promise<string[]> {
  const now = Date.now();
  if (cachedCategories.length > 0 && now - lastFetchTime < CACHE_DURATION_MS) {
    return cachedCategories;
  }

  try {
    const response = await fetch(SHEET_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch categories: ${response.statusText}`);
    }
    const csvText = await response.text();
    
    // Parse CSV: split by newline, skip header (first row), trim, filter empty
    const lines = csvText.split(/\r?\n/);
    if (lines.length > 1) {
      const newCategories = lines
        .slice(1) // skip header
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      if (newCategories.length > 0) {
        cachedCategories = newCategories;
        lastFetchTime = now;
      }
    }
  } catch (error) {
    console.error('Error fetching categories from Google Sheet:', error);
    // If fetch fails, keep using the old cache if available
  }

  return cachedCategories;
}

const KEYWORD_MAP: Record<string, string[]> = {
  'Politics': ['election', 'government', 'minister', 'parliament', 'senate', 'congress', 'policy', 'vote', 'political'],
  'Sports': ['match', 'player', 'tournament', 'score', 'team', 'league', 'championship', 'olympics', 'stadium', 'athlete'],
  'Business': ['market', 'stock', 'company', 'economy', 'finance', 'startup', 'investment', 'trade', 'corporate', 'industry'],
  'Technology': ['ai', 'software', 'app', 'tech', 'gadget', 'innovation', 'digital', 'cyber', 'robot', 'computing']
};

export function normalizeCategory(category: any): string {
  if (!category) return '';
  if (typeof category === 'string') return category.toLowerCase().trim();
  if (typeof category === 'object') {
    if (category._) return String(category._).toLowerCase().trim();
    if (category.name) return String(category.name).toLowerCase().trim();
    if (category.term) return String(category.term).toLowerCase().trim();
    if (category.content) return String(category.content).toLowerCase().trim();
  }
  return String(category).toLowerCase().trim();
}

/**
 * Flexible category matching logic.
 * Tries to match using RSS categories, title, or description.
 */
export function matchCategory(
  item: { title?: string; description?: string; categories?: any[] },
  allowedCategories: string[]
): string {
  const normalizedAllowed = allowedCategories.map(c => normalizeCategory(c));
  
  // 1. Try to match using RSS categories (if any)
  if (item.categories && item.categories.length > 0) {
    for (const rssCat of item.categories) {
      const normalizedRss = normalizeCategory(rssCat);
      
      // Exact or partial match
      for (let i = 0; i < allowedCategories.length; i++) {
        const allowed = allowedCategories[i];
        const normAllowed = normalizedAllowed[i];
        
        if (normalizedRss === normAllowed || normalizedRss.includes(normAllowed) || normAllowed.includes(normalizedRss)) {
          return allowed;
        }
      }
    }
  }

  // 2. Try keyword matching in title and description
  const fullText = `${item.title || ''} ${item.description || ''}`.toLowerCase();
  
  // Check against allowed categories directly first
  for (let i = 0; i < allowedCategories.length; i++) {
    const allowed = allowedCategories[i];
    const normAllowed = normalizedAllowed[i];
    if (fullText.includes(normAllowed)) {
      return allowed;
    }
  }

  // Check against keyword map
  for (const [category, keywords] of Object.entries(KEYWORD_MAP)) {
    // Only use if the category is in the allowed list
    const allowedIndex = normalizedAllowed.indexOf(category.toLowerCase());
    if (allowedIndex !== -1) {
      if (keywords.some(kw => fullText.includes(kw.toLowerCase()))) {
        return allowedCategories[allowedIndex];
      }
    }
  }

  // 3. Fallback to "General" or the first allowed category if "General" isn't available
  const generalIndex = normalizedAllowed.indexOf('general');
  if (generalIndex !== -1) {
    return allowedCategories[generalIndex];
  }
  
  return allowedCategories[0] || 'General';
}
