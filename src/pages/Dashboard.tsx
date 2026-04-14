import { useEffect, useState } from 'react';
import { Activity, Globe, Newspaper, TrendingUp, RefreshCw } from 'lucide-react';

interface Stats {
  totalWebsites: number;
  activeSources: number;
  totalNews: number;
  todayNews: number;
  lastCronRun?: string;
}

interface Settings {
  auto_submit: string;
  max_description_words: string;
  news_webhook_url: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings>({ 
    auto_submit: 'OFF', 
    max_description_words: '150',
    news_webhook_url: ''
  });
  const [loading, setLoading] = useState(true);
  const [updatingSettings, setUpdatingSettings] = useState(false);

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr || dateStr === 'Never') return 'Never';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch (e) {
      return dateStr;
    }
  };

  useEffect(() => {
    // Fetch stats
    fetch('/api/admin/stats')
      .then(res => res.json())
      .then(data => {
        setStats(data);
      })
      .catch(err => console.error(err));
  }, []);

  const [webhookUrl, setWebhookUrl] = useState<string>('');

  useEffect(() => {
    // Fetch settings
    fetch('/api/admin/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(prev => ({ ...prev, ...data }));
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });

    // Fetch webhook URL for display
    fetch('/api/admin/debug/webhook-url')
      .then(res => res.json())
      .then(data => setWebhookUrl(data.url))
      .catch(err => console.error(err));
  }, []);

  const [syncingNews, setSyncingNews] = useState(false);

  const handleSyncNews = async () => {
    setSyncingNews(true);
    try {
      const res = await fetch('/api/admin/sync-news', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        alert(`Successfully imported ${data.imported} new articles.`);
        // Refresh stats
        const statsRes = await fetch('/api/admin/stats');
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSyncingNews(false);
    }
  };

  const [syncingStatus, setSyncingStatus] = useState(false);

  const handleSyncStatus = async () => {
    setSyncingStatus(true);
    try {
      const res = await fetch('/api/admin/sync-sheet', { method: 'POST' });
      if (res.ok) {
        alert('Successfully synced submitted status from Google Sheet.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSyncingStatus(false);
    }
  };

  const [submittingPending, setSubmittingPending] = useState(false);

  const handleSubmitPending = async () => {
    setSubmittingPending(true);
    try {
      const res = await fetch('/api/admin/submit-pending', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || `Successfully started submission of ${data.count} news items.`);
        // Refresh stats
        const statsRes = await fetch('/api/admin/stats');
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingPending(false);
    }
  };

  const handleResetSubmitted = async () => {
    if (!confirm('Are you sure you want to reset the submitted status for ALL news? This will allow them to be sent to Google Sheet again.')) return;
    try {
      const res = await fetch('/api/admin/reset-submitted', { method: 'POST' });
      if (res.ok) {
        alert('Successfully reset submitted status for all news.');
        // Refresh stats
        const statsRes = await fetch('/api/admin/stats');
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateSetting = async (key: string, value: string) => {
    setUpdatingSettings(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, [key]: value }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleToggleAutoSubmit = () => {
    const newValue = settings.auto_submit === 'ON' ? 'OFF' : 'ON';
    handleUpdateSetting('auto_submit', newValue);
  };

  const statCards = [
    { name: 'Total Websites Added', value: stats?.totalWebsites || 0, icon: Globe, color: 'text-blue-600', bg: 'bg-blue-100' },
    { name: 'Active News Sources', value: stats?.activeSources || 0, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { name: 'Total Imported News', value: stats?.totalNews || 0, icon: Newspaper, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { name: 'News Imported Today', value: stats?.todayNews || 0, icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-100' },
    { name: 'Last Cron Run', value: formatDate(stats?.lastCronRun), icon: RefreshCw, color: 'text-purple-600', bg: 'bg-purple-100', isDate: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncStatus}
            disabled={syncingStatus}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncingStatus ? 'animate-spin' : ''}`} />
            {syncingStatus ? 'Syncing Status...' : 'Sync Status from Sheet'}
          </button>
          <button
            onClick={handleSubmitPending}
            disabled={submittingPending}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <TrendingUp className={`w-4 h-4 ${submittingPending ? 'animate-pulse' : ''}`} />
            {submittingPending ? 'Submitting...' : 'Submit Pending News'}
          </button>
          <button
            onClick={handleSyncNews}
            disabled={syncingNews}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncingNews ? 'animate-spin' : ''}`} />
            {syncingNews ? 'Syncing News...' : 'Sync All News'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
              <div className="h-10 w-10 bg-gray-200 rounded-lg mb-4"></div>
              <div className="h-4 w-24 bg-gray-200 rounded mb-2"></div>
              <div className="h-8 w-16 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {statCards.map((stat) => (
            <div key={stat.name} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-500 truncate">{stat.name}</p>
                  <p className={`mt-2 font-bold text-gray-900 ${stat.isDate ? 'text-sm' : 'text-3xl'}`}>
                    {stat.isDate ? stat.value : stat.value.toLocaleString()}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${stat.bg} flex-shrink-0 ml-3`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System Settings</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-gray-900">Auto Submit to Google Sheet</h3>
              <p className="text-xs text-gray-500">Automatically send new articles to Google Sheet when imported.</p>
            </div>
            <button
              onClick={handleToggleAutoSubmit}
              disabled={updatingSettings}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                settings.auto_submit === 'ON' ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.auto_submit === 'ON' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {settings.auto_submit === 'ON' && (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-gray-900">Max Description Words</h3>
                <p className="text-xs text-gray-500">Limit the number of words in the description sent to Google Sheet.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={settings.max_description_words}
                  onChange={(e) => handleUpdateSetting('max_description_words', e.target.value)}
                  className="w-20 px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  min="1"
                  max="1000"
                />
                <span className="text-xs text-gray-500 font-medium">words</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-gray-900">News Webhook URL</h3>
                <p className="text-xs text-gray-500">The Google Apps Script URL for submitting news.</p>
              </div>
            </div>
            <input
              type="text"
              value={settings.news_webhook_url}
              onChange={(e) => handleUpdateSetting('news_webhook_url', e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://script.google.com/macros/s/.../exec"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-100">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-red-900">Reset Submitted Status</h3>
              <p className="text-xs text-red-600">Mark all news as "Not Submitted" so they can be sent again.</p>
            </div>
            <button
              onClick={handleResetSubmitted}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors shadow-sm"
            >
              Reset All
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System Status</h2>
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span>News Import Engine is running. Next run in &lt; 10 minutes.</span>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 overflow-hidden">
            <p className="text-xs font-bold text-gray-400 uppercase mb-1">Current Webhook URL</p>
            <p className="text-xs font-mono text-gray-600 break-all">{webhookUrl || 'Loading...'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
