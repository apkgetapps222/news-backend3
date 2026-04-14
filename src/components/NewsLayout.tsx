import { Outlet, Link } from 'react-router-dom';
import { Newspaper } from 'lucide-react';

export default function NewsLayout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/news" className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700 transition-colors">
            <Newspaper className="w-6 h-6" />
            <span className="text-xl font-bold tracking-tight">NewsFeed</span>
          </Link>
          <nav>
            <Link to="/" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
              Admin Panel
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
      
      <footer className="bg-white border-t border-gray-200 py-8 mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} NewsFeed. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
