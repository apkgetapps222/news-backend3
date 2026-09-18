import React, { useEffect, useState, FormEvent } from 'react';
import { Edit2, Trash2, Power, PowerOff, ExternalLink, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Website {
  id: number;
  name: string;
  url: string;
  rss_url: string;
  category: string;
  status: string;
  total_news: number;
  last_sync: string;
}

export default function Websites() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  const [syncingSheet, setSyncingSheet] = useState(false);

  const [editingWebsite, setEditingWebsite] = useState<Website | null>(null);
  const [editForm, setEditForm] = useState({ name: '', url: '', rss_url: '', category: '', status: '' });

  const fetchWebsites = () => {
    setLoading(true);
    fetch('/api/admin/websites')
      .then(res => res.json())
      .then(data => {
        setWebsites(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const handleEditClick = (website: Website) => {
    setEditingWebsite(website);
    setEditForm({
      name: website.name,
      url: website.url,
      rss_url: website.rss_url || '',
      category: website.category,
      status: website.status
    });
  };

  const handleUpdateWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWebsite) return;

    try {
      const res = await fetch(`/api/admin/websites/${editingWebsite.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditingWebsite(null);
        fetchWebsites();
      } else {
        alert(data.error || 'Failed to update website');
      }
    } catch (error) {
      console.error('Failed to update website');
      alert('Failed to update website');
    }
  };

  const syncFromSheet = async () => {
    setSyncingSheet(true);
    try {
      const res = await fetch('/api/admin/sync-sheet', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('Successfully synced websites from Google Sheet.');
        fetchWebsites();
      } else {
        alert(data.error || 'Failed to sync from Google Sheet');
      }
    } catch (error) {
      console.error('Failed to sync from sheet');
      alert('Failed to sync from sheet');
    } finally {
      setSyncingSheet(false);
    }
  };

  useEffect(() => {
    fetchWebsites();
  }, []);

  const toggleStatus = async (website: Website) => {
    const newStatus = website.status === 'Active' ? 'Disabled' : 'Active';
    try {
      await fetch(`/api/admin/websites/${website.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...website, status: newStatus }),
      });
      fetchWebsites();
    } catch (error) {
      console.error('Failed to toggle status');
    }
  };

  const syncWebsite = async (id: number) => {
    setSyncingId(id);
    try {
      const res = await fetch(`/api/admin/websites/${id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully imported ${data.imported} new articles.`);
        fetchWebsites();
      } else {
        alert(data.error || 'Failed to sync website');
      }
    } catch (error) {
      console.error('Failed to sync website');
      alert('Failed to sync website');
    } finally {
      setSyncingId(null);
    }
  };

  const deleteWebsite = async (id: number) => {
    // Using a custom modal would be better, but for now we'll just delete directly
    // to avoid window.confirm
    try {
      await fetch(`/api/admin/websites/${id}`, { method: 'DELETE' });
      fetchWebsites();
    } catch (error) {
      console.error('Failed to delete website');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Website Sources</h1>
        <div className="flex space-x-3">
          <button
            onClick={syncFromSheet}
            disabled={syncingSheet}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncingSheet ? 'animate-spin' : ''}`} />
            Sync from Sheet
          </button>
          <Link
            to="/websites/add"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Add New Website
          </Link>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Website</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Imported News</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Sync</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">Loading...</td>
                </tr>
              ) : websites.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">No websites added yet.</td>
                </tr>
              ) : (
                websites.map((website) => (
                  <tr key={website.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{website.id}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{website.name}</span>
                        <a href={website.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:text-indigo-900 flex items-center mt-1">
                          {website.url} <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                        {website.rss_url && (
                          <span className="text-xs text-gray-500 mt-1 truncate max-w-xs" title={website.rss_url}>
                            RSS: {website.rss_url}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {website.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        website.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {website.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                      {website.total_news.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                      {formatDate(website.last_sync)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleEditClick(website)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => syncWebsite(website.id)}
                          disabled={syncingId === website.id || website.status !== 'Active'}
                          className={`text-blue-600 hover:text-blue-900 disabled:opacity-50 disabled:cursor-not-allowed`}
                          title="Sync Now"
                        >
                          <RefreshCw className={`w-4 h-4 ${syncingId === website.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => toggleStatus(website)}
                          className={`${website.status === 'Active' ? 'text-green-600 hover:text-green-900' : 'text-gray-400 hover:text-gray-600'}`}
                          title={website.status === 'Active' ? 'Disable' : 'Enable'}
                        >
                          {website.status === 'Active' ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => deleteWebsite(website.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingWebsite && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 opacity-75" aria-hidden="true" onClick={() => setEditingWebsite(null)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="relative inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6 z-10">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Edit Website</h3>
                <form onSubmit={handleUpdateWebsite} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <input
                      type="text"
                      required
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">URL</label>
                    <input
                      type="url"
                      required
                      value={editForm.url}
                      onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">RSS URL (Optional)</label>
                    <input
                      type="url"
                      value={editForm.rss_url}
                      onChange={(e) => setEditForm({ ...editForm, rss_url: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Category</label>
                    <input
                      type="text"
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    >
                      <option value="Active">Active</option>
                      <option value="Disabled">Disabled</option>
                    </select>
                  </div>
                  <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                    <button
                      type="submit"
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:col-start-2 sm:text-sm"
                    >
                      Update
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingWebsite(null)}
                      className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:col-start-1 sm:text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
