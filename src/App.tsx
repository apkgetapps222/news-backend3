/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import NewsLayout from './components/NewsLayout';
import Dashboard from './pages/Dashboard';
import Websites from './pages/Websites';
import AddWebsite from './pages/AddWebsite';
import NewsList from './pages/NewsList';
import NewsDetailPage from './pages/NewsDetailPage';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Admin Routes */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="websites" element={<Websites />} />
          <Route path="websites/add" element={<AddWebsite />} />
        </Route>

        {/* Public News Routes */}
        <Route path="/news" element={<NewsLayout />}>
          <Route index element={<NewsList />} />
          <Route path=":id" element={<NewsDetailPage />} />
        </Route>
      </Routes>
    </Router>
  );
}
