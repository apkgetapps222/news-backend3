import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';

export default function AddWebsite() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  
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
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const [previewData, setPreviewData] = useState<{ rssUrl: string; articles: any[] } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/websites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
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
                    src={article.image} 
                    alt="" 
                    className="w-20 h-20 object-cover rounded-md flex-shrink-0"
                    referrerPolicy="no-referrer"
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
          {error && (
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
              <label htmlFor="url" className="block text-sm font-medium text-gray-700">Website URL</label>
              <div className="mt-1">
                <input
                  type="url"
                  name="url"
                  id="url"
                  required
                  value={formData.url}
                  onChange={handleChange}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                  placeholder="https://techcrunch.com"
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                We will automatically scan this URL for RSS feeds (/feed, /rss, /rss.xml, etc.)
              </p>
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
