import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import NewsCard from '../components/NewsCard';

interface NewsItem {
  id: number;
  title: string;
  image: string | null;
  source: string;
  publish_date: string;
  article_url: string;
  category: string | null;
  submitted: number;
}

export default function NewsList() {
  const [news, setNews] = useState<NewsItem[]>(() => {
    const saved = sessionStorage.getItem("newsListItems");
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    const saved = sessionStorage.getItem("newsListPage");
    return saved ? parseInt(saved, 10) : 1;
  });
  const [hasMore, setHasMore] = useState(() => {
    const saved = sessionStorage.getItem("newsListHasMore");
    return saved === null ? true : saved === "true";
  });
  
  // Filter states
  const [selectedSource, setSelectedSource] = useState(() => localStorage.getItem("selectedSource") || "All");
  const [selectedCategory, setSelectedCategory] = useState(() => localStorage.getItem("selectedCategory") || "All");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const isRestoringScroll = useRef(true);
  
  const observer = useRef<IntersectionObserver | null>(null);

  // Auto-refresh logic
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      console.log('Auto-refreshing news...');
      handleRefresh();
    }, 60000); // Refresh every 60 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);
  
  const lastNewsElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  // Helper to normalize source names
  const normalizeSource = (source: string) => {
    return source.replace(/\s+News$/i, '').replace(/\s+Times$/i, '').trim();
  };

  const CANONICAL_CATEGORIES = [
    "All",
    "Politics",
    "World",
    "Crime",
    "U.S News",
    "Sports",
    "Health",
    "Entertainments",
    "Business",
    "Technology"
  ];

  // Extract dynamic filters from all loaded news
  const sources = ["All", ...Array.from(new Set(news.map(item => normalizeSource(item.source))))].sort();
  const dynamicCats = Array.from(new Set(news.map(item => item.category || "World")));
  const categories = Array.from(new Set([...CANONICAL_CATEGORIES, ...dynamicCats]));

  // Filtering logic
  const filteredNews = news.filter(item => {
    const sourceMatch = selectedSource === "All" || normalizeSource(item.source) === selectedSource;
    const itemCat = item.category || "World";
    const categoryMatch = selectedCategory === "All" || 
      itemCat.toLowerCase() === selectedCategory.toLowerCase() ||
      (selectedCategory === "U.S News" && (itemCat.toLowerCase() === "us news" || itemCat.toLowerCase() === "u.s. news")) ||
      (selectedCategory === "Entertainments" && itemCat.toLowerCase() === "entertainment");
    return sourceMatch && categoryMatch;
  });

  // Save filters to localStorage
  useEffect(() => {
    localStorage.setItem("selectedSource", selectedSource);
    if (!isInitialLoad) {
      window.scrollTo(0, 0);
      sessionStorage.setItem("newsListScrollPos", "0");
    }
  }, [selectedSource]);

  useEffect(() => {
    localStorage.setItem("selectedCategory", selectedCategory);
    if (!isInitialLoad) {
      window.scrollTo(0, 0);
      sessionStorage.setItem("newsListScrollPos", "0");
    }
  }, [selectedCategory]);

  // Save scroll position
  useEffect(() => {
    const handleScroll = () => {
      if (isRestoringScroll.current) return;
      sessionStorage.setItem("newsListScrollPos", window.scrollY.toString());
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Restore scroll position
  useEffect(() => {
    if (news.length > 0 && isInitialLoad) {
      const savedPos = sessionStorage.getItem("newsListScrollPos");
      if (savedPos) {
        const pos = parseInt(savedPos, 10);
        if (pos > 0) {
          // Use a small delay to ensure rendering is complete
          const timer = setTimeout(() => {
            window.scrollTo(0, pos);
            // Give it a bit more time before allowing scroll saves
            setTimeout(() => {
              isRestoringScroll.current = false;
              setIsInitialLoad(false);
            }, 100);
          }, 50);
          return () => clearTimeout(timer);
        }
      }
      isRestoringScroll.current = false;
      setIsInitialLoad(false);
    } else if (news.length === 0 && isInitialLoad) {
      // If no news, we're not restoring
      isRestoringScroll.current = false;
    }
  }, [news.length, isInitialLoad]);

  useEffect(() => {
    const fetchNews = async () => {
      // If we already have news and it's the initial load, we still fetch page 1 
      // to check for updates, but only if it's the first page.
      if (isInitialLoad && news.length > 0 && page !== 1) {
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(`/api/news/latest?page=${page}&limit=12`);
        if (!res.ok) throw new Error('Failed to fetch news');
        
        const data = await res.json();
        
        if (data.length === 0) {
          if (page === 1) {
            setNews([]);
            sessionStorage.removeItem("newsListItems");
          }
          setHasMore(false);
          sessionStorage.setItem("newsListHasMore", "false");
        } else {
          setNews(prevNews => {
            // Merge and remove duplicates
            const combined = page === 1 ? [...data, ...prevNews] : [...prevNews, ...data];
            const uniqueMap = new Map();
            combined.forEach(item => uniqueMap.set(item.id, item));
            const uniqueNews = Array.from(uniqueMap.values());
            
            // Sort by publish_date DESC to show newest first
            uniqueNews.sort((a, b) => {
              const dateA = new Date(a.publish_date).getTime();
              const dateB = new Date(b.publish_date).getTime();
              if (dateB !== dateA) return dateB - dateA;
              return b.id - a.id; // Fallback to id if dates are identical
            });
            
            sessionStorage.setItem("newsListItems", JSON.stringify(uniqueNews));
            return uniqueNews;
          });
          
          sessionStorage.setItem("newsListPage", page.toString());
          sessionStorage.setItem("newsListHasMore", "true");
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load news. Please try again later.');
      } finally {
        setLoading(false);
        if (isInitialLoad) setIsInitialLoad(false);
      }
    };

    fetchNews();
  }, [page, refreshKey]);

  const handleRefresh = () => {
    if (page === 1) {
      setRefreshKey(prev => prev + 1);
    } else {
      setPage(1);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Oops! Something went wrong</h2>
        <p className="text-gray-600">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 border-b border-gray-200 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Latest News</h1>
            <p className="text-gray-500 mt-1">Stay updated with top stories from around the world.</p>
          </div>
          <div className="flex items-center gap-3 self-start">
            <div className="flex items-center gap-2 mr-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  autoRefresh 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}></div>
                {autoRefresh ? 'LIVE UPDATES ON' : 'LIVE UPDATES OFF'}
              </button>
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-all shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-full text-sm font-semibold border border-indigo-100">
              Total News: {filteredNews.length}
            </div>
          </div>
        </div>

        {/* Source Filters */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Sources</label>
          <div className="flex flex-wrap gap-2">
            {sources.map(source => (
              <button
                key={source}
                onClick={() => setSelectedSource(source)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  selectedSource === source
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                {source}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filters */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Categories</label>
          <div className="flex flex-wrap gap-2">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  selectedCategory === category
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300 hover:text-emerald-600'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredNews.length === 0 && !loading ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-lg">No news articles found for the selected filters.</p>
          <p className="text-gray-400 text-sm mt-2">Try adjusting your filters or scrolling down for more content.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredNews.map((item, index) => {
            if (filteredNews.length === index + 1) {
              return (
                <div ref={lastNewsElementRef} key={item.id}>
                  <NewsCard {...item} />
                </div>
              );
            } else {
              return <NewsCard key={item.id} {...item} />;
            }
          })}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      )}
      
      {!hasMore && filteredNews.length > 0 && (
        <div className="text-center py-8 text-gray-500 font-medium">
          You've reached the end of the news feed.
        </div>
      )}
    </div>
  );
}
