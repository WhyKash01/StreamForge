import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import api from '../api/axios';
import { Video, User as UserIcon } from 'lucide-react';
import type { RootState } from '../store/store';
import { setVideos, setLoading } from '../store/slices/appSlice';
import type { DBVideo } from '../store/slices/appSlice';

function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function Home() {
  const dispatch = useDispatch();
  const { videos: dbVideos, isLoading: loading } = useSelector((state: RootState) => state.app);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const dbRes = await api.get('/metadata/videos');
        dispatch(setVideos(dbRes.data || []));
      } catch (err) {
        console.error('Failed to fetch videos', err);
      } finally {
        dispatch(setLoading(false));
      }
    };
    fetchVideos();
    
    const interval = setInterval(fetchVideos, 5000);
    return () => clearInterval(interval);
  }, [dispatch]);

  const [filter, setFilter] = useState<'all' | 'live' | 'videos'>('all');

  const displayVideos = dbVideos
    // Base filter: only show Live streams or completely processed videos
    .filter(v => v.status === 'Live' || v.status === 'Done' || (v.type === 'Live' && v.status === 'Processing'))
    // Category filter
    .filter(v => {
      if (filter === 'live') return v.type === 'Live';
      if (filter === 'videos') return v.type === 'VOD' && v.status === 'Done';
      return true; // 'all' shows both
    })
    // Sort logic: Active 'Live' status on top, then sort by date descending
    .sort((a, b) => {
      const aIsLive = (a.type === 'Live' && (a.status === 'Live' || a.status === 'Processing')) ? 1 : 0;
      const bIsLive = (b.type === 'Live' && (b.status === 'Live' || b.status === 'Processing')) ? 1 : 0;
      
      if (aIsLive !== bIsLive) {
        return bIsLive - aIsLive; // Push active live streams to the top
      }
      
      // If both are live or both are done, sort by date
      return new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime();
    });

  const renderChannelAvatar = (video: DBVideo) => {
    if (!video.User) return null;
    return (
      <Link to={`/channel/${video.User.username}`} onClick={(e) => e.stopPropagation()} className="shrink-0">
        {video.User.avatar_url ? (
          <img src={video.User.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover bg-zinc-800" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
            <UserIcon className="w-5 h-5" />
          </div>
        )}
      </Link>
    );
  };

  const renderChannelMeta = (video: DBVideo) => {
    if (!video.User) return null;
    const displayName = video.User.display_name || video.User.username;
    return (
      <Link to={`/channel/${video.User.username}`} onClick={(e) => e.stopPropagation()} className="text-sm text-zinc-400 hover:text-white transition-colors block truncate">
        {displayName}
      </Link>
    );
  };

  // Skeleton card for loading state
  const SkeletonCard = () => (
    <div className="flex flex-col bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800">
      <div className="aspect-video skeleton" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 skeleton" />
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full skeleton" />
          <div className="h-3 w-20 skeleton" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      
      {/* Category Filters (YouTube style) */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            filter === 'all' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('live')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            filter === 'live' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
          }`}
        >
          Live
        </button>
        <button
          onClick={() => setFilter('videos')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            filter === 'videos' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
          }`}
        >
          Videos
        </button>
      </div>

      {/* Videos Grid */}
      <section>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : displayVideos.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/50 rounded-2xl border border-zinc-800/50 mt-4">
            <Video className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-zinc-300 mb-2">No videos found</h3>
            <p className="text-zinc-500 text-sm max-w-md mx-auto">
              There are no videos matching the selected category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-2">
            {displayVideos.map((video) => {
              const isCurrentlyLive = video.type === 'Live' && (video.status === 'Live' || video.status === 'Processing');
              
              return (
                <Link 
                  to={`/video/${video.ID}`}
                  key={video.ID} 
                  className="group flex flex-col transition-all cursor-pointer"
                >
                  <div className={`aspect-video bg-zinc-900 rounded-xl overflow-hidden relative ${isCurrentlyLive ? 'border border-rose-500/30 group-hover:border-rose-500/60' : ''}`}>
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="w-8 h-8 text-zinc-700" />
                      </div>
                    )}
                    
                    {/* Overlay Badges */}
                    {isCurrentlyLive ? (
                      <div className="absolute bottom-2 right-2 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1.5 shadow-lg">
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                        LIVE
                      </div>
                    ) : video.CreatedAt && (
                      <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[11px] font-bold px-1.5 py-0.5 rounded">
                        {timeAgo(video.CreatedAt)}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex gap-3 pr-2">
                    {renderChannelAvatar(video)}
                    <div className="flex flex-col overflow-hidden">
                      <h3 className="font-medium text-zinc-100 line-clamp-2 text-sm leading-snug">
                        {video.title}
                      </h3>
                      <div className="mt-1 flex flex-col text-xs text-zinc-400">
                        {renderChannelMeta(video)}
                        {isCurrentlyLive ? (
                          <span className="text-rose-500 font-medium mt-0.5">Streaming now</span>
                        ) : (
                          <span>{video.views || 0} views • {timeAgo(video.CreatedAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
