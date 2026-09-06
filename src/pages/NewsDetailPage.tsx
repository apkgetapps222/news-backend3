import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Calendar, Tag, User, Loader2, AlertCircle, Send, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface NewsDetail {
  id: number;
  title: string;
  description: string;
  image: string | null;
  source: string;
  category: string | null;
  publish_date: string;
  article_url: string;
  submitted: number;
}

export default function NewsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [news, setNews] = useState<NewsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error' | 'duplicate'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [autoSubmit, setAutoSubmit] = useState<boolean>(false);

  useEffect(() => {
    // Fetch auto_submit setting
    fetch('/api/admin/settings')
      .then(res => res.json())
      .then(data => {
        setAutoSubmit(data.auto_submit === 'ON');
      })
      .catch(err => console.error(err));

    const fetchNewsDetail = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/news/${id}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error('Article not found');
          throw new Error('Failed to fetch article details');
        }
        const data = await res.json();
        setNews(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchNewsDetail();
    }
  }, [id]);

  const handleSubmitToSheet = async () => {
    if (!news) return;
    
    // Check if already submitted (UI check)
    if (news.submitted === 1) {
      setSubmitStatus('duplicate');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const res = await fetch('/api/news/submit-to-sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: news.id })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.alreadySubmitted) {
          setSubmitStatus('duplicate');
          setNews(prev => prev ? { ...prev, submitted: 1 } : null);
          return;
        }
        throw new Error(data.error || data.details || 'Failed to submit to sheet');
      }

      setSubmitStatus('success');
      setNews(prev => prev ? { ...prev, submitted: 1 } : null);
      setTimeout(() => setSubmitStatus('idle'), 5000);
    } catch (err: any) {
      console.error("Error submitting to sheet:", err);
      setSubmitError(err.message);
      setSubmitStatus('error');
      setTimeout(() => {
        setSubmitStatus('idle');
        setSubmitError(null);
      }, 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (error || !news) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Article Not Found</h2>
        <p className="text-lg text-gray-600 mb-8">{error || "The article you're looking for doesn't exist or has been removed."}</p>
        <Link 
          to="/news" 
          className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to News Feed
        </Link>
      </div>
    );
  }

  const formattedDate = news.publish_date 
    ? format(new Date(news.publish_date), 'MMMM d, yyyy • h:mm a')
    : 'Unknown date';

  return (
    <article className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header Image */}
      {news.image ? (
        <div className="w-full h-64 sm:h-80 md:h-96 relative bg-gray-100">
          <img 
            src={news.image} 
            alt={news.title} 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgns8GsVMfyX4OZ6ZzVmTpPvw86v4G5ZPNmZUoCvB8ZJjBg3GfrQCorH3YRTXXKABCUl5tgnPR90GjOt71EQEpUhwWhm8id7UBZwRPph9KZkgZV_MeKZPdnK6tUaJr857cHXZCQqn9TwXUBt740AzQD8TGfED2OjZ9Ai3qUP_hhBrDQKMpIdk9vbhIAPTI/s1254/Breaking%20Ic.png';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
        </div>
      ) : (
        <div className="w-full h-48 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center">
          <span className="text-white/50 text-6xl font-serif font-bold">{news.source.charAt(0)}</span>
        </div>
      )}

      <div className="p-6 sm:p-10 lg:p-12">
        {/* Back Button */}
        <Link 
          to="/news" 
          className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5 transform group-hover:-translate-x-1 transition-transform" />
          Back to feed
        </Link>

        {/* Article Meta */}
        <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-gray-600 font-medium">
          <div className="flex items-center text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-full">
            <User className="w-4 h-4 mr-1.5" />
            {news.source}
          </div>
          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-1.5 text-gray-400" />
            {formattedDate}
          </div>
          {news.category && (
            <div className="flex items-center text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full">
              <Tag className="w-4 h-4 mr-1.5" />
              <span className="uppercase tracking-wider text-[10px] font-bold">{news.category}</span>
            </div>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-8 tracking-tight">
          {news.title}
        </h1>

        {/* Description / Content */}
        <div className="prose prose-lg prose-indigo max-w-none text-gray-700 leading-relaxed mb-12">
          {/* We use dangerouslySetInnerHTML because RSS descriptions often contain HTML formatting */}
          <div dangerouslySetInnerHTML={{ __html: news.description || 'No description available for this article.' }} />
        </div>

        {/* Call to Action */}
        <div className="border-t border-gray-100 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            This article was originally published by <span className="font-bold text-gray-900">{news.source}</span>.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            {submitStatus === 'success' && (
              <span className="text-emerald-600 flex items-center text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Sent to Sheet!
              </span>
            )}
            {submitStatus === 'error' && (
              <span className="text-red-600 flex flex-col items-end text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1.5" />
                  Failed to send
                </div>
                {submitError && <span className="text-[10px] opacity-70 mt-1 max-w-[200px] text-right">{submitError}</span>}
              </span>
            )}
            {submitStatus === 'duplicate' && (
              <span className="text-amber-600 flex items-center text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
                <AlertCircle className="w-4 h-4 mr-1.5" />
                Already Submitted
              </span>
            )}
            {!autoSubmit && (
              <button
                onClick={handleSubmitToSheet}
                disabled={isSubmitting || submitStatus === 'success' || news.submitted === 1}
                className="inline-flex items-center justify-center w-full sm:w-auto px-6 py-3.5 border border-gray-200 text-base font-bold rounded-xl text-gray-700 bg-white hover:bg-gray-50 hover:text-indigo-600 transition-all duration-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (submitStatus === 'success' || news.submitted === 1) ? (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2 text-emerald-500" />
                    Already Submitted
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    Submit to Sheet
                  </>
                )}
              </button>
            )}
            <a 
              href={news.article_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-3.5 border border-transparent text-base font-bold rounded-xl text-white bg-gray-900 hover:bg-indigo-600 transition-all duration-300 shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
            >
              Read Full Article
              <ExternalLink className="w-5 h-5 ml-2" />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
