import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, AlertTriangle, XCircle, ArrowRight, ExternalLink } from 'lucide-react';

interface ExistingWebsiteInfo {
  id?: number;
  name: string;
  url: string;
  rss_url?: string;
  category?: string;
  country?: string;
  status?: string;
  matchedField?: string;
  matchedUrl?: string;
}

export default function AddWebsite() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string;
    existingWebsite: ExistingWebsiteInfo;
  } | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    category: '',
    country: '',
    status: 'Active',
  });

  useEffect(() => {
    fetch('/api/categories')
      .then(res => res.json())
      .then(data => {
        // Ensure "All" is the first option, followed by the rest
        const cats = Array.isArray(data) ? data : [];
        if (!cats.includes('All')) {
          setCategories(['All', ...cats]);
        } else {
          setCategories(cats);
        }
      })
      .catch(err => console.error('Failed to fetch categories:', err));
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear duplicate warning when user edits the URL
    if (name === 'url' && duplicateWarning) {
      setDuplicateWarning(null);
      setError('');
    }
  };

  // Quick real-time check when user finishes typing URL (onBlur)
  const handleUrlBlur = async () => {
    const trimmed = formData.url.trim();
    if (!trimmed || trimmed.length < 6) return;

    try {
      setCheckingDuplicate(true);
      const res = await fetch(`/api/admin/websites/check-duplicate?url=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.alreadyExists && data.existingWebsite) {
        setDuplicateWarning({
          message: data.message || `Already Added! This website URL is already in your website list under "${data.existingWebsite.name}".`,
          existingWebsite: data.existingWebsite
        });
      }
    } catch {
      // Ignore network blur errors
    } finally {
      setCheckingDuplicate(false);
    }
  };

  const [previewData, setPreviewData] = useState<{ rssUrl: string; articles: any[] } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setDuplicateWarning(null);

    try {
      const response = await fetch('/api/admin/websites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        // If website or RSS is duplicate
        if (data.alreadyExists && data.existingWebsite) {
          setDuplicateWarning({
            message: data.error || `Already Added! This website or RSS feed URL is already present in your list.`,
            existingWebsite: data.existingWebsite
          });
          return;
        }
        throw new Error(data.error || 'Failed to add website');
      }

      setPreviewData({ rssUrl: data.rssUrl, articles: data.articles || [] });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (previewData) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Website Added Successfully</h1>
          <button
            onClick={() => navigate('/websites')}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
          >
            Back to Websites
          </button>
        </div>

        <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Detected RSS URL</h2>
            <p className="mt-1 text-lg font-mono text-indigo-600 break-all bg-indigo-50 p-3 rounded-lg border border-indigo-100">
              {previewData.rssUrl}
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Parsed News Preview ({previewData.articles.length} items)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {previewData.articles.map((article, idx) => (
                <div key={idx} className="flex gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <img 
                    src={article.image || 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgns8GsVMfyX4OZ6ZzVmTpPvw86v4G5ZPNmZUoCvB8ZJjBg3GfrQCorH3YRTXXKABCUl5tgnPR90GjOt71EQEpUhwWhm8id7UBZwRPph9KZkgZV_MeKZPdnK6tUaJr857cHXZCQqn9TwXUBt740AzQD8TGfED2OjZ9Ai3qUP_hhBrDQKMpIdk9vbhIAPTI/s1254/Breaking%20Ic.png'} 
                    alt="" 
                    className="w-20 h-20 object-cover rounded-md flex-shrink-0 bg-gray-200"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgns8GsVMfyX4OZ6ZzVmTpPvw86v4G5ZPNmZUoCvB8ZJjBg3GfrQCorH3YRTXXKABCUl5tgnPR90GjOt71EQEpUhwWhm8id7UBZwRPph9KZkgZV_MeKZPdnK6tUaJr857cHXZCQqn9TwXUBt740AzQD8TGfED2OjZ9Ai3qUP_hhBrDQKMpIdk9vbhIAPTI/s1254/Breaking%20Ic.png';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 line-clamp-2">{article.title}</h3>
                    <p className="mt-1 text-xs text-gray-500 truncate">{article.link}</p>
                  </div>
                </div>
              ))}
              {previewData.articles.length === 0 && (
                <p className="col-span-full text-center py-8 text-gray-500 italic">No articles found in this feed.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Add New Website</h1>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {duplicateWarning && (
            <div id="duplicate-url-notifier" className="bg-amber-50 border-2 border-amber-400 rounded-xl p-5 shadow-sm space-y-3 animate-fadeIn">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-100 text-amber-700 rounded-lg flex-shrink-0 mt-0.5">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-300">
                        ALREADY ADDED
                      </span>
                      <span className="text-xs text-amber-700 font-medium">Duplicate RSS Feed URL Prevented</span>
                    </div>
                    <h3 className="text-base font-bold text-amber-950 mt-1">
                      This Website / RSS Feed is already registered
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="text-amber-500 hover:text-amber-800 p-1 rounded-md transition-colors"
                  title="Dismiss warning"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-amber-900 leading-relaxed font-medium">
                {duplicateWarning.message}
              </p>

              {/* Existing website info box */}
              <div className="bg-white/90 border border-amber-200 rounded-lg p-3.5 space-y-2 text-sm shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs text-gray-500 font-medium uppercase tracking-wider block">Existing Entry Name</span>
                    <span className="font-bold text-gray-900 text-base">{duplicateWarning.existingWebsite.name}</span>
                  </div>
                  {duplicateWarning.existingWebsite.category && (
                    <span className="inline-block text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-medium border border-gray-200">
                      Category: {duplicateWarning.existingWebsite.category}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-amber-100 text-xs">
                  <div className="truncate">
                    <span className="text-gray-500 block font-medium">Website URL:</span>
                    <a
                      href={duplicateWarning.existingWebsite.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-mono truncate max-w-full"
                    >
                      <span className="truncate">{duplicateWarning.existingWebsite.url}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </div>
                  <div className="truncate">
                    <span className="text-gray-500 block font-medium">RSS Feed URL:</span>
                    <span className="text-amber-900 font-mono truncate block" title={duplicateWarning.existingWebsite.rss_url || duplicateWarning.existingWebsite.url}>
                      {duplicateWarning.existingWebsite.rss_url || duplicateWarning.existingWebsite.url}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => navigate('/websites')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
                >
                  View in Websites List
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDuplicateWarning(null);
                    setFormData(prev => ({ ...prev, url: '' }));
                  }}
                  className="px-3.5 py-1.5 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100/50 text-sm font-medium rounded-lg transition-colors"
                >
                  Clear & Try Another URL
                </button>
              </div>
            </div>
          )}

          {error && !duplicateWarning && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">Website Name</label>
              <div className="mt-1">
                <input
                  type="text"
                  name="name"
                  id="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                  placeholder="e.g., TechCrunch"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <label htmlFor="url" className="block text-sm font-medium text-gray-700">Website URL</label>
                {checkingDuplicate && (
                  <span className="text-xs text-indigo-600 flex items-center gap-1 font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking duplicates...
                  </span>
                )}
              </div>
              <div className="mt-1">
                <input
                  type="url"
                  name="url"
                  id="url"
                  required
                  value={formData.url}
                  onChange={handleChange}
                  onBlur={handleUrlBlur}
                  className={`shadow-sm block w-full sm:text-sm rounded-md p-2 border transition-all ${
                    duplicateWarning 
                      ? 'border-amber-400 ring-2 ring-amber-300 bg-amber-50/40 text-amber-900 focus:ring-amber-500 focus:border-amber-500'
                      : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                  }`}
                  placeholder="https://techcrunch.com"
                />
              </div>
              {duplicateWarning ? (
                <p className="mt-2 text-xs text-amber-800 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" />
                  This URL or RSS feed already exists in your database list!
                </p>
              ) : (
                <p className="mt-2 text-sm text-gray-500">
                  We will automatically scan this URL for RSS feeds (/feed, /rss, /rss.xml, etc.)
                </p>
              )}
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700">Category</label>
              <div className="mt-1">
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border bg-white"
                  required
                >
                  <option value="">Select a category</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="country" className="block text-sm font-medium text-gray-700">Country</label>
              <div className="mt-1">
                <input
                  type="text"
                  name="country"
                  id="country"
                  value={formData.country}
                  onChange={handleChange}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                  placeholder="e.g., US, UK, Global"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
              <div className="mt-1">
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border bg-white"
                >
                  <option value="Active">Active</option>
                  <option value="Disabled">Disabled</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-5 border-t border-gray-200 flex justify-end">
            <button
              type="button"
              onClick={() => navigate('/websites')}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mr-3"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Finding RSS Feed...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5 mr-2" />
                  Find RSS & Save
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
