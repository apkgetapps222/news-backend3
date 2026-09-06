import { Link } from 'react-router-dom';
import { Clock, Tag, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NewsCardProps {
  id: number;
  title: string;
  image: string | null;
  source: string;
  category: string | null;
  publish_date: string;
  submitted?: number;
}

export default function NewsCard({ id, title, image, source, category, publish_date, submitted }: NewsCardProps) {
  const formattedDate = publish_date 
    ? formatDistanceToNow(new Date(publish_date), { addSuffix: true })
    : 'Unknown time';

  return (
    <Link 
      to={`/news/${id}`} 
      className="group flex flex-col bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-indigo-100 h-full relative"
    >
      {submitted === 1 && (
        <div className="absolute top-3 right-3 z-10 bg-emerald-500 text-white px-2 py-1 rounded-lg text-[10px] font-bold flex items-center space-x-1 shadow-lg">
          <CheckCircle2 className="w-3 h-3" />
          <span>POSTED</span>
        </div>
      )}
      <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
        {image ? (
          <img 
            src={image} 
            alt={title} 
            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
            onError={(e) => {
              // Fallback if image fails to load
              (e.target as HTMLImageElement).src = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgns8GsVMfyX4OZ6ZzVmTpPvw86v4G5ZPNmZUoCvB8ZJjBg3GfrQCorH3YRTXXKABCUl5tgnPR90GjOt71EQEpUhwWhm8id7UBZwRPph9KZkgZV_MeKZPdnK6tUaJr857cHXZCQqn9TwXUBt740AzQD8TGfED2OjZ9Ai3qUP_hhBrDQKMpIdk9vbhIAPTI/s1254/Breaking%20Ic.png';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-300">
            <span className="text-4xl font-serif opacity-20">{source?.charAt(0) || 'N'}</span>
          </div>
        )}
        
        {/* Source Badge overlay */}
        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-gray-900 shadow-sm">
          {source}
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-lg font-bold text-gray-900 leading-tight mb-3 group-hover:text-indigo-600 transition-colors line-clamp-3">
          {title}
        </h3>
        
        <div className="mt-auto pt-4 flex items-center justify-between text-xs text-gray-500 border-t border-gray-50">
          <div className="flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>{formattedDate}</span>
          </div>
          
          {category && (
            <div className="flex items-center space-x-1.5 text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md font-medium">
              <Tag className="w-3 h-3" />
              <span className="uppercase tracking-wider text-[10px]">{category}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
