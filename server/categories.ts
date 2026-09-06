import { fetch } from 'undici';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1NiSBohmp68qy5jtOx6yovbR1S2901nk6GMlqv3Vcmds/export?format=csv&gid=1811705002';

export const DEFAULT_CATEGORIES: string[] = [
  'Politics',
  'World',
  'Crime',
  'U.S News',
  'Sports',
  'Health',
  'Entertainments',
  'Business',
  'Technology'
];

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
        .map(line => line.replace(/^["']|["']$/g, '').trim())
        .filter(line => line.length > 0);
      
      if (newCategories.length > 0) {
        cachedCategories = newCategories;
        lastFetchTime = now;
        return cachedCategories;
      }
    }
  } catch (error) {
    console.error('Error fetching categories from Google Sheet:', error);
  }

  if (cachedCategories.length > 0) {
    return cachedCategories;
  }

  return DEFAULT_CATEGORIES;
}

export function normalizeCategory(category: any): string {
  if (!category) return '';
  let str = '';
  if (typeof category === 'string') {
    str = category;
  } else if (typeof category === 'object') {
    str = category._ || category.name || category.term || category.content || String(category);
  } else {
    str = String(category);
  }

  const clean = str.toLowerCase().trim().replace(/['"]/g, '');
  
  if (clean === 'politics' || clean.includes('politic')) return 'Politics';
  if (clean === 'world' || clean === 'world news' || clean === 'international' || clean === 'global') return 'World';
  if (clean === 'crime' || clean === 'crimes' || clean === 'law & crime' || clean === 'justice' || clean === 'law & order') return 'Crime';
  if (clean === 'u.s news' || clean === 'u.s. news' || clean === 'us news' || clean === 'us' || clean === 'u.s.' || clean === 'usa' || clean === 'america' || clean === 'national') return 'U.S News';
  if (clean === 'sports' || clean === 'sport') return 'Sports';
  if (clean === 'health' || clean === 'wellness' || clean === 'medical' || clean === 'healthcare') return 'Health';
  if (clean === 'entertainments' || clean === 'entertainment' || clean === 'showbiz' || clean === 'celebrity' || clean === 'movies' || clean === 'arts') return 'Entertainments';
  if (clean === 'business' || clean === 'finance' || clean === 'economy' || clean === 'money' || clean === 'markets') return 'Business';
  if (clean === 'technology' || clean === 'tech' || clean === 'science & tech' || clean === 'sci-tech') return 'Technology';

  return clean;
}

interface PatternRule {
  weight: number;
  regex: RegExp;
}

function compileRules(words: Array<string | [string, number]>): PatternRule[] {
  return words.map(item => {
    if (Array.isArray(item)) {
      const [phrase, weight] = item;
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return { weight, regex: new RegExp(`\\b${escaped}\\b`, 'i') };
    } else {
      const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return { weight: 2, regex: new RegExp(`\\b${escaped}\\b`, 'i') };
    }
  });
}

// 1. POLITICS ("Politics me all politics rakho all over world")
const POLITICS_RULES: PatternRule[] = compileRules([
  // Key phrases (weight 5)
  ['prime minister', 5], ['presidential election', 5], ['white house', 5], ['capitol hill', 5],
  ['downing street', 5], ['supreme court justice', 5], ['executive order', 5], ['foreign policy', 5],
  ['secretary of state', 5], ['vice president', 5], ['kamala harris', 5], ['donald trump', 5],
  ['joe biden', 5], ['keir starmer', 5], ['emmanuel macron', 5], ['vladimir putin', 5],
  ['volodymyr zelenskyy', 5], ['benjamin netanyahu', 5], ['narendra modi', 5], ['democratic party', 5],
  ['republican party', 5], ['labour party', 5], ['conservative party', 5], ['civil rights', 5],
  ['peace talks', 5], ['ceasefire deal', 5], ['ceasefire negotiations', 5], ['nato summit', 5],
  ['g7 summit', 5], ['un security council', 5], ['foreign minister', 5], ['house speaker', 5],
  ['mike johnson', 5], ['mitch mcconnell', 5], ['chuck schumer', 5], ['general election', 5],
  ['polling station', 5], ['exit poll', 5], ['impeachment trial', 5], ['confirmation hearing', 5],
  ['trump order', 5], ['biden order', 5], ['presidential order', 5],
  
  // Strong political terms (weight 3-4)
  ['president', 4], ['presidential', 4], ['election', 4], ['elections', 4], ['parliament', 4],
  ['parliamentary', 4], ['congress', 4], ['congressional', 4], ['senate', 4], ['senator', 4],
  ['senators', 4], ['lawmaker', 4], ['lawmakers', 4], ['legislature', 4], ['legislative', 4],
  ['legislator', 4], ['legislators', 4], ['legislation', 4], ['referendum', 4], ['gop', 4],
  ['democrat', 4], ['democrats', 4], ['republican', 4], ['republicans', 4], ['tory', 4],
  ['tories', 4], ['bipartisan', 4], ['filibuster', 4], ['geopolitics', 4], ['geopolitical', 4],
  ['diplomacy', 4], ['diplomatic', 4], ['diplomat', 4], ['diplomats', 4], ['ambassador', 4],
  ['embassy', 4], ['treaty', 4], ['treaties', 4], ['sanctions', 4], ['impeachment', 4],
  ['impeach', 4], ['impeached', 4], ['chancellor', 4], ['governor', 3], ['governorship', 3],
  ['mayoral', 3], ['cabinet', 3], ['ministry', 3], ['minister', 3], ['caucus', 3],
  ['ballot', 3], ['ballots', 3], ['voting', 3], ['voter', 3], ['voters', 3], ['vote', 2],
  ['campaign', 3], ['campaigns', 3], ['campaigning', 3], ['candidate', 3], ['candidates', 3],
  ['politics', 3], ['political', 3], ['politician', 3], ['politicians', 3], ['veto', 3],
  ['vetoes', 3], ['vetoed', 3], ['constitution', 3], ['constitutional', 3]
]);

// 2. CRIME (Law enforcement, murder, court trials, police, scams)
const CRIME_RULES: PatternRule[] = compileRules([
  // Key phrases (weight 5)
  ['fatally shot', 5], ['shot dead', 5], ['mass shooting', 5], ['armed robbery', 5],
  ['knife attack', 5], ['knife-wielding', 5], ['human trafficking', 5], ['drug trafficking', 5],
  ['drug cartel', 5], ['booked into jail', 5], ['search warrant', 5], ['pleaded guilty', 5],
  ['pleads guilty', 5], ['pleaded not guilty', 5], ['pleads not guilty', 5], ['guilty verdict', 5],
  ['prison sentence', 5], ['death penalty', 5], ['death row', 5], ['capital punishment', 5],
  ['murder case', 5], ['homicide detectives', 5], ['sexual assault', 5], ['sexually assaulted', 5],
  ['domestic violence', 5], ['police officer', 4], ['police officers', 4], ['police custody', 4],
  ['in custody', 4], ['fbi agent', 4], ['fbi warning', 4], ['grand jury', 4], ['organized crime', 4],
  ['money laundering', 5], ['ponzi scheme', 5], ['murder trial', 5], ['child neglect', 5],
  ['police say', 4], ['police said', 4], ['police report', 4],

  // Strong crime terms (weight 3-4)
  ['murder', 4], ['murders', 4], ['murdered', 4], ['murderer', 4], ['homicide', 4],
  ['homicides', 4], ['manslaughter', 4], ['gunman', 4], ['gunmen', 4], ['shooter', 4],
  ['shooters', 4], ['shooting', 3], ['shootings', 3], ['stabbing', 4], ['stabbings', 4],
  ['stabbed', 4], ['robbery', 4], ['robberies', 4], ['robber', 4], ['robbed', 3],
  ['burglary', 4], ['burglar', 4], ['burglars', 4], ['carjacking', 4], ['kidnapping', 4],
  ['kidnapped', 4], ['abduction', 4], ['abducted', 4], ['hostage', 4], ['hostages', 4],
  ['rapist', 5], ['raped', 5], ['rape', 4], ['cartel', 4], ['cartels', 4], ['fentanyl', 4],
  ['cocaine', 4], ['heroin', 4], ['narcotics', 4], ['arson', 4], ['arsonist', 4],
  ['arrest', 4], ['arrests', 4], ['arrested', 4], ['fugitive', 4], ['fugitives', 4],
  ['manhunt', 4], ['suspect', 3], ['suspects', 3], ['perpetrator', 4], ['handcuffed', 4],
  ['mugshot', 4], ['indictment', 4], ['indicted', 4], ['arraigned', 4], ['arraignment', 4],
  ['convict', 4], ['convicted', 4], ['conviction', 4], ['verdict', 4], ['sentenced', 4],
  ['sentencing', 4], ['mistrial', 4], ['jail', 3], ['prison', 3], ['inmate', 3],
  ['inmates', 3], ['penitentiary', 4], ['parole', 3], ['sheriff', 3], ['deputy', 2],
  ['detective', 3], ['detectives', 3], ['swat', 3], ['scam', 3], ['scammer', 3],
  ['defrauded', 4], ['embezzlement', 4], ['felony', 4], ['misdemeanor', 3], ['prosecutor', 3],
  ['prosecutors', 3], ['extortion', 4], ['blackmail', 4]
]);

// 3. SPORTS
const SPORTS_RULES: PatternRule[] = compileRules([
  // Key phrases (weight 5)
  ['super bowl', 5], ['world cup', 5], ['champions league', 5], ['premier league', 5],
  ['grand slam', 5], ['olympic games', 5], ['stanley cup', 5], ['world series', 5],
  ['formula 1', 5], ['formula one', 5], ['grand prix', 5], ['pga tour', 5],
  ['ryder cup', 5], ['march madness', 5], ['free agency', 4], ['trade deadline', 4],
  ['gold medal', 5], ['silver medal', 4], ['quarter-final', 4], ['semi-final', 4],
  ['real madrid', 5], ['barcelona fc', 5], ['el clasico', 5], ['manchester united', 5],
  ['manchester city', 5], ['liverpool fc', 5], ['bayern munich', 5],

  // Leagues & Sports (weight 4)
  ['nfl', 4], ['nba', 4], ['mlb', 4], ['nhl', 4], ['fifa', 4], ['uefa', 4], ['epl', 4],
  ['la liga', 4], ['serie a', 4], ['bundesliga', 4], ['mls', 4], ['ipl', 4], ['ufc', 4],
  ['mma', 4], ['wwe', 4], ['nascar', 4], ['wimbledon', 5],

  // Terms (weight 3-4)
  ['football', 3], ['soccer', 4], ['basketball', 4], ['baseball', 4], ['tennis', 4],
  ['cricket', 4], ['hockey', 4], ['rugby', 4], ['golf', 3], ['boxing', 4], ['boxer', 4],
  ['athlete', 4], ['athletes', 4], ['athletic', 3], ['championship', 4], ['championships', 4],
  ['tournament', 4], ['playoff', 4], ['playoffs', 4], ['touchdown', 5], ['touchdowns', 5],
  ['quarterback', 5], ['touchdowns', 5], ['home run', 5], ['homerun', 5], ['strikeout', 4],
  ['slam dunk', 5], ['wicket', 5], ['wickets', 5], ['batsman', 4], ['bowler', 4],
  ['stadium', 3], ['ballpark', 4], ['halftime', 4], ['overtime', 3], ['derby', 3],
  ['olympics', 4], ['olympic', 4], ['paralympics', 4], ['knockout', 4], ['heavyweight', 3]
]);

// 4. HEALTH
const HEALTH_RULES: PatternRule[] = compileRules([
  // Key phrases (weight 5)
  ['clinical trial', 5], ['clinical trials', 5], ['fda approves', 5], ['fda approved', 5],
  ['fda clearance', 5], ['clinical drug', 5], ['drug testing device', 5],
  ['mental health', 5], ['heart attack', 5], ['cardiac arrest', 5], ['blood pressure', 5],
  ['gene therapy', 5], ['public health', 4], ['world health organization', 5],
  ['emergency room', 4], ['intensive care', 4], ['organ transplant', 5],

  // Medical conditions & terms (weight 3-4)
  ['healthcare', 4], ['medical', 3], ['medicine', 3], ['medicines', 3], ['physician', 4],
  ['physicians', 4], ['doctor', 3], ['doctors', 3], ['surgeon', 4], ['surgeons', 4],
  ['surgery', 4], ['surgeries', 4], ['hospital', 3], ['hospitals', 3], ['clinic', 3],
  ['patient', 3], ['patients', 3], ['disease', 4], ['diseases', 4], ['illness', 3],
  ['illnesses', 3], ['infection', 4], ['infections', 4], ['infectious', 4], ['virus', 4],
  ['viruses', 4], ['viral', 3], ['bacterial', 4], ['bacteria', 4], ['outbreak', 4],
  ['epidemic', 4], ['pandemic', 4], ['covid', 4], ['covid-19', 4], ['coronavirus', 4],
  ['influenza', 4], ['bird flu', 5], ['mpox', 5], ['monkeypox', 5], ['measles', 4],
  ['vaccine', 4], ['vaccines', 4], ['vaccination', 4], ['vaccinated', 4], ['booster shot', 4],
  ['pharmaceutical', 4], ['cancer', 4], ['cancers', 4], ['tumor', 4], ['tumors', 4],
  ['chemotherapy', 5], ['oncology', 5], ['oncologist', 5], ['leukemia', 5], ['cardiology', 5],
  ['cardiologist', 5], ['stroke', 3], ['strokes', 3], ['diabetes', 4], ['diabetic', 4],
  ['insulin', 4], ['obesity', 4], ['overweight', 3], ['alzheimer', 5], ["alzheimer's", 5],
  ['dementia', 4], ["parkinson's", 5], ['depression', 3], ['depressive', 4], ['anxiety disorder', 4],
  ['psychiatrist', 4], ['psychiatric', 4], ['psychologist', 4], ['ozempic', 5], ['wegovy', 5],
  ['mounjaro', 5], ['weight loss drug', 5], ['pediatric', 4], ['nutrition', 3], ['dietary', 3]
]);

// 5. ENTERTAINMENTS
const ENTERTAINMENTS_RULES: PatternRule[] = compileRules([
  // Key phrases (weight 5)
  ['box office', 5], ['academy awards', 5], ['red carpet', 5], ['tv series', 5],
  ['tv show', 5], ['season finale', 5], ['series finale', 5], ['music video', 5],
  ['concert tour', 5], ['world tour', 4], ['billboard hot 100', 5], ['hot 100', 4],
  ['golden globes', 5], ['golden globe', 5], ['emmy awards', 5], ['grammy awards', 5],

  // Awards & Culture (weight 4-5)
  ['oscars', 5], ['oscar', 4], ['emmys', 5], ['emmy', 4], ['grammys', 5], ['grammy', 4],
  ['bafta', 5], ['cannes', 5], ['sundance', 5], ['hollywood', 4], ['bollywood', 4],

  // Terms (weight 3-4)
  ['celebrity', 4], ['celebrities', 4], ['celeb', 3], ['actor', 4], ['actors', 4],
  ['actress', 4], ['actresses', 4], ['filmmaker', 4], ['movie', 3], ['movies', 3],
  ['cinema', 3], ['cinemas', 3], ['cinematic', 3], ['blockbuster', 4], ['trailer', 3],
  ['premiere', 4], ['premieres', 4], ['soundtrack', 4], ['singer', 3], ['singers', 3],
  ['vocalist', 3], ['album', 3], ['albums', 3], ['concert', 4], ['concerts', 4],
  ['broadway', 4], ['comedian', 4], ['comedians', 4], ['comedy special', 4],
  ['sitcom', 4], ['streaming', 3], ['netflix', 4], ['disney+', 4], ['hbo', 4],
  ['coachella', 5], ['glastonbury', 5], ['lollapalooza', 5], ['paparazzi', 4],
  ['reality tv', 4], ['kardashian', 5], ['kardashians', 5], ['taylor swift', 5],
  ['beyonce', 5], ['drake', 4]
]);

// 6. BUSINESS
const BUSINESS_RULES: PatternRule[] = compileRules([
  // Key phrases (weight 5)
  ['wall street', 5], ['stock market', 5], ['dow jones', 5], ['s&p 500', 5],
  ['federal reserve', 5], ['the fed', 4], ['jerome powell', 5], ['central bank', 5],
  ['interest rate', 5], ['interest rates', 5], ['rate cut', 5], ['rate cuts', 5],
  ['rate hike', 5], ['rate hikes', 5], ['consumer price index', 5], ['gross domestic product', 5],
  ['quarterly earnings', 5], ['earnings report', 5], ['earnings call', 5], ['market cap', 5],
  ['initial public offering', 5], ['chapter 11', 5], ['housing market', 4], ['mortgage rate', 5],
  ['mortgage rates', 5], ['private equity', 5], ['venture capital', 5], ['hedge fund', 5],
  ['trade deficit', 4], ['trade war', 4],

  // Terms (weight 3-4)
  ['nasdaq', 4], ['stocks', 3], ['shareholder', 4], ['shareholders', 4], ['equities', 4],
  ['inflation', 4], ['deflation', 4], ['recession', 4], ['gdp', 4], ['cpi', 4],
  ['revenue', 4], ['revenues', 4], ['profit', 3], ['profits', 3], ['profitability', 4],
  ['net income', 4], ['valuation', 4], ['ipo', 4], ['merger', 4], ['mergers', 4],
  ['acquisition', 4], ['acquisitions', 4], ['buyout', 4], ['bankruptcy', 4], ['bankrupt', 4],
  ['layoff', 4], ['layoffs', 4], ['job cuts', 4], ['supply chain', 3], ['retailer', 3],
  ['retailers', 3], ['retail sales', 4], ['mortgage', 3], ['mortgages', 3], ['tariff', 4],
  ['tariffs', 4], ['banking', 3], ['crypto', 4], ['cryptocurrency', 4], ['bitcoin', 5],
  ['ethereum', 5], ['billionaire', 4], ['billionaires', 4], ['net worth', 4], ['ceo', 3],
  ['cfo', 3], ['treasury yield', 4]
]);

// 7. TECHNOLOGY
const TECHNOLOGY_RULES: PatternRule[] = compileRules([
  // Key phrases (weight 5)
  ['artificial intelligence', 5], ['generative ai', 5], ['large language model', 5],
  ['machine learning', 5], ['deep learning', 5], ['neural network', 5], ['sam altman', 5],
  ['cloud computing', 5], ['autonomous vehicle', 5], ['self-driving car', 5], ['self-driving', 4],
  ['driverless car', 5], ['operating system', 4], ['mobile app', 4], ['mobile apps', 4],
  ['app store', 4], ['google play', 4], ['data center', 4], ['data breach', 5],
  ['zero-day', 5], ['quantum computing', 5], ['quantum computer', 5], ['james webb', 5],
  ['virtual reality', 5], ['augmented reality', 5], ['meta quest', 5], ['apple vision pro', 5],
  ['ai chip', 5], ['ai model', 5], ['ai tool', 5], ['microprocessor', 5], ['smart home', 4],

  // Specific AI / Tech Entities (weight 4-5)
  ['chatgpt', 5], ['openai', 5], ['anthropic', 5], ['claude', 4], ['deepseek', 5],
  ['copilot', 4], ['midjourney', 5], ['nvidia', 5], ['tsmc', 5], ['semiconductor', 5],
  ['semiconductors', 5], ['microchip', 5], ['chipmaker', 5], ['chipmakers', 5],
  ['spacex', 4], ['starship', 4], ['starlink', 5],

  // Terms (weight 3-4) - CAUTION: words must be unambiguous!
  ['technology', 3], ['software', 4], ['robotics', 5], ['humanoid', 4],
  ['cybersecurity', 5], ['cyberattack', 5], ['cyberattacks', 5],
  ['hacker', 4], ['hackers', 4], ['ransomware', 5], ['malware', 5], ['spyware', 5],
  ['phishing', 4], ['smartphone', 4], ['smartphones', 4], ['iphone', 5], ['iphones', 5],
  ['smartwatch', 4], ['gadget', 4], ['gadgets', 4], ['supercomputer', 5],
  ['algorithm', 3], ['algorithms', 3], ['gpu', 4], ['gpus', 4],
  ['5g', 4], ['6g', 4], ['firmware', 4]
]);

// 8. U.S. NEWS (Strictly USA domestic affairs, states, cities)
const US_NEWS_RULES: PatternRule[] = compileRules([
  // Key US phrases
  ['united states', 4], ['across america', 4], ['nationwide', 3], ['across the country', 3],
  ['border patrol', 4], ['southern border', 4], ['us-mexico border', 4],
  ['american airlines', 4], ['delta airlines', 4], ['united airlines', 4], ['southwest airlines', 4],
  ['new york city', 4], ['san francisco', 4], ['los angeles', 4], ['san diego', 4],
  ['grand canyon', 4], ['yellowstone', 4], ['thanksgiving', 4], ['4th of july', 4],
  ['fourth of july', 4], ['memorial day', 3], ['labor day', 3],

  // US States
  ['california', 3], ['texas', 3], ['florida', 3], ['new york', 3], ['illinois', 3],
  ['pennsylvania', 3], ['ohio', 3], ['georgia', 3], ['north carolina', 3], ['michigan', 3],
  ['new jersey', 3], ['virginia', 3], ['washington state', 4], ['arizona', 3], ['massachusetts', 3],
  ['tennessee', 3], ['indiana', 3], ['missouri', 3], ['maryland', 3], ['wisconsin', 3],
  ['colorado', 3], ['minnesota', 3], ['south carolina', 3], ['alabama', 3], ['louisiana', 3],
  ['kentucky', 3], ['oregon', 3], ['oklahoma', 3], ['connecticut', 3], ['utah', 3],
  ['iowa', 3], ['nevada', 3], ['arkansas', 3], ['kansas', 3], ['mississippi', 3],
  ['new mexico', 3], ['nebraska', 3], ['idaho', 3], ['west virginia', 3], ['hawaii', 3],
  ['new hampshire', 3], ['maine', 3], ['montana', 3], ['rhode island', 3], ['delaware', 3],
  ['south dakota', 3], ['north dakota', 3], ['alaska', 3], ['vermont', 3], ['wyoming', 3],

  // Major US Cities & Regions
  ['nyc', 3], ['manhattan', 3], ['brooklyn', 3], ['queens', 3], ['chicago', 3],
  ['houston', 3], ['phoenix', 3], ['philadelphia', 3], ['san antonio', 3], ['dallas', 3],
  ['austin', 3], ['seattle', 3], ['denver', 3], ['boston', 3], ['las vegas', 3],
  ['detroit', 3], ['atlanta', 3], ['miami', 3], ['minneapolis', 3], ['new orleans', 3],
  ['tampa', 3], ['pittsburgh', 3], ['st. louis', 3], ['orlando', 3], ['midwest', 3],
  ['rust belt', 3], ['appalachia', 3], ['pacific northwest', 3], ['new england', 3],

  // US Federal & Domestic Bodies
  ['faa', 4], ['tsa', 4], ['fema', 4], ['usps', 4], ['amtrak', 4]
]);

// 9. WORLD NEWS (International countries, foreign events)
const WORLD_RULES: PatternRule[] = compileRules([
  // Key international phrases
  ['united nations', 4], ['un general assembly', 5], ['european union', 4],
  ['middle east', 4], ['latin america', 4], ['south america', 4], ['southeast asia', 4],

  // Countries & regions
  ['ukraine', 4], ['russia', 4], ['israel', 4], ['gaza', 4], ['palestine', 4],
  ['palestinian', 4], ['lebanon', 4], ['iran', 4], ['iraq', 4], ['syria', 4],
  ['yemen', 4], ['china', 4], ['taiwan', 4], ['japan', 4], ['india', 4],
  ['pakistan', 4], ['france', 4], ['germany', 4], ['britain', 4], ['uk', 3],
  ['italy', 4], ['spain', 4], ['canada', 4], ['australia', 4], ['mexico', 4],
  ['brazil', 4], ['north korea', 5], ['south korea', 4], ['turkey', 4], ['egypt', 4],
  ['saudi arabia', 4], ['sudan', 4], ['nigeria', 4], ['kenya', 4], ['south africa', 4],
  ['switzerland', 4], ['netherlands', 4], ['greece', 4], ['sweden', 4], ['norway', 4],
  ['poland', 4], ['argentina', 4], ['new zealand', 4], ['singapore', 4],

  // Foreign capitals & cities
  ['london', 3], ['paris', 3], ['berlin', 3], ['rome', 3], ['madrid', 3],
  ['kyiv', 4], ['moscow', 4], ['beijing', 4], ['tokyo', 3], ['delhi', 3],
  ['jerusalem', 4], ['tehran', 4], ['beirut', 4], ['cairo', 3], ['seoul', 3],
  ['pyongyang', 4], ['sydney', 3], ['ottawa', 3]
]);

function scoreRules(text: string, rules: PatternRule[]): number {
  let score = 0;
  for (const rule of rules) {
    if (rule.regex.test(text)) {
      score += rule.weight;
    }
  }
  return score;
}

/**
 * Flexible, smart category matching logic adhering to:
 * - "Politics me all politics rakho all over world"
 * - "Us News category me kewal USA country ka news rakho"
 * - "baki usi hisab se sabhi category ko smart tarike se filter karke news import kre"
 * - "jiska news category decide na ho use World Me dal do"
 */
export function matchCategory(
  item: { title?: string; description?: string; categories?: any[]; link?: string },
  allowedCategories?: string[]
): string {
  const allowed = allowedCategories && allowedCategories.length > 0 ? allowedCategories : DEFAULT_CATEGORIES;
  const normalizedAllowed = allowed.map(c => normalizeCategory(c));

  const title = (item.title || '').trim();
  const desc = (item.description || '').trim();
  const url = (item.link || '').toLowerCase();
  
  // Track scores for all 9 categories
  const scores: Record<string, number> = {
    'Politics': 0,
    'World': 0,
    'Crime': 0,
    'U.S News': 0,
    'Sports': 0,
    'Health': 0,
    'Entertainments': 0,
    'Business': 0,
    'Technology': 0
  };

  // 1. Check RSS <category> tags if available
  if (item.categories && item.categories.length > 0) {
    for (const rawCat of item.categories) {
      const norm = normalizeCategory(rawCat);
      if (scores[norm] !== undefined) {
        scores[norm] += 8; // High confidence from publisher tag
      }
    }
  }

  // 2. Check URL path keywords
  if (url.includes('/politics/')) scores['Politics'] += 6;
  if (url.includes('/crime/') || url.includes('/justice/')) scores['Crime'] += 6;
  if (url.includes('/sports/') || url.includes('/sport/')) scores['Sports'] += 6;
  if (url.includes('/health/')) scores['Health'] += 6;
  if (url.includes('/entertainment/') || url.includes('/showbiz/')) scores['Entertainments'] += 6;
  if (url.includes('/business/') || url.includes('/finance/')) scores['Business'] += 6;
  if (url.includes('/tech/') || url.includes('/technology/')) scores['Technology'] += 6;
  if (url.includes('/us-news/') || url.includes('/us/') || url.includes('/national/')) scores['U.S News'] += 5;
  if (url.includes('/world/') || url.includes('/international/')) scores['World'] += 6;

  // 3. Score Title (weight = 2.5x) and Description (weight = 1.0x)
  const titleScores = {
    'Politics': scoreRules(title, POLITICS_RULES) * 2.5,
    'Crime': scoreRules(title, CRIME_RULES) * 2.5,
    'Sports': scoreRules(title, SPORTS_RULES) * 2.5,
    'Health': scoreRules(title, HEALTH_RULES) * 2.5,
    'Entertainments': scoreRules(title, ENTERTAINMENTS_RULES) * 2.5,
    'Business': scoreRules(title, BUSINESS_RULES) * 2.5,
    'Technology': scoreRules(title, TECHNOLOGY_RULES) * 2.5,
    'U.S News': scoreRules(title, US_NEWS_RULES) * 2.5,
    'World': scoreRules(title, WORLD_RULES) * 2.5
  };

  const descScores = {
    'Politics': scoreRules(desc, POLITICS_RULES),
    'Crime': scoreRules(desc, CRIME_RULES),
    'Sports': scoreRules(desc, SPORTS_RULES),
    'Health': scoreRules(desc, HEALTH_RULES),
    'Entertainments': scoreRules(desc, ENTERTAINMENTS_RULES),
    'Business': scoreRules(desc, BUSINESS_RULES),
    'Technology': scoreRules(desc, TECHNOLOGY_RULES),
    'U.S News': scoreRules(desc, US_NEWS_RULES),
    'World': scoreRules(desc, WORLD_RULES)
  };

  for (const cat of Object.keys(scores)) {
    scores[cat] += (titleScores[cat as keyof typeof titleScores] || 0) + (descScores[cat as keyof typeof descScores] || 0);
  }

  // --- CORE CONSTRAINTS MANDATED BY USER ---

  // Mandate 1: "Politics me all politics rakho all over world"
  // If an article has strong political signals, it should NEVER be degraded to generic World or US News
  if (scores['Politics'] >= 5) {
    if (scores['Politics'] >= scores['World']) {
      scores['World'] = Math.min(scores['World'], scores['Politics'] - 1);
    }
    if (scores['Politics'] >= scores['U.S News']) {
      scores['U.S News'] = Math.min(scores['U.S News'], scores['Politics'] - 1);
    }
  }

  // Mandate 2: "Us News category me kewal USA country ka news rakho"
  // If an article has NO US signals, it can NEVER be U.S News
  if (scores['U.S News'] < 2.5) {
    scores['U.S News'] = 0;
  }
  // And if it has strong foreign signals (UK, France, Russia, Israel, etc.) and no US signals, zero out U.S News
  if (scores['World'] >= 4 && scores['U.S News'] < scores['World']) {
    scores['U.S News'] = 0;
  }

  // Mandate 3: Specific domains take precedence over generic U.S News & World
  // If Crime, Sports, Health, Entertainments, Business, or Technology has solid score,
  // it should win over a general mention of a city or country!
  const verticalCats = ['Crime', 'Sports', 'Health', 'Entertainments', 'Business', 'Technology', 'Politics'];
  for (const vCat of verticalCats) {
    if (scores[vCat] >= 5) {
      if (scores['U.S News'] > 0 && scores[vCat] >= scores['U.S News']) {
        scores['U.S News'] = Math.min(scores['U.S News'], scores[vCat] - 2);
      }
      if (scores['World'] > 0 && scores[vCat] >= scores['World']) {
        scores['World'] = Math.min(scores['World'], scores[vCat] - 2);
      }
    }
  }

  // Find the category with maximum score
  let maxCategory = '';
  let maxScore = 0;

  for (const [cat, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxCategory = cat;
    }
  }

  // Mandate 4: "jiska news category decide na ho use World Me dal do"
  // If maxScore is too low or 0 (undecided), fallback to 'World'
  if (maxScore < 2.5 || !maxCategory) {
    maxCategory = 'World';
  }

  // Return the matching category in allowedCategories format
  const allowedIndex = normalizedAllowed.indexOf(normalizeCategory(maxCategory));
  if (allowedIndex !== -1) {
    return allowed[allowedIndex];
  }

  // Fallback to 'World' in allowedCategories
  const worldIndex = normalizedAllowed.indexOf('world');
  if (worldIndex !== -1) {
    return allowed[worldIndex];
  }

  return allowed[0] || 'World';
}
