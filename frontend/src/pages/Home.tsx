import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import api from '../api/axios';
import { Video as VideoIcon, User as UserIcon, Play, Radio, Eye } from 'lucide-react';
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

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'live', label: '🔴 Live Now' },
  { id: 'videos', label: 'VODs' },
  { id: 'Gaming', label: '🎮 Gaming' },
  { id: 'Music', label: '🎵 Music' },
  { id: 'Tech', label: '💻 Tech & Dev' },
  { id: 'Esports', label: '🏆 Esports' },
  { id: 'IRL', label: '☕ IRL' },
  { id: 'Creative', label: '🎬 Creative' },
];

export default function Home() {
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQ = searchParams.get('q') || '';
  const filterParam = searchParams.get('filter') || 'all';

  const { videos: dbVideos, isLoading: loading } = useSelector((state: RootState) => state.app);
  const [activeCategory, setActiveCategory] = useState<string>(filterParam);

  useEffect(() => {
    if (filterParam) {
      setActiveCategory(filterParam);
    }
  }, [filterParam]);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const params: Record<string, string> = {};
        if (searchQ) params.q = searchQ;
        
        // If selecting a custom category like Gaming, Tech, etc.
        if (activeCategory && !['all', 'live', 'videos'].includes(activeCategory)) {
          params.category = activeCategory;
        }

        const dbRes = await api.get('/metadata/videos', { params: Object.keys(params).length ? params : undefined });
        const videoList = Array.isArray(dbRes.data) ? dbRes.data : dbRes.data.videos || [];
        dispatch(setVideos(videoList));
      } catch (err) {
        console.error('Failed to fetch videos', err);
      } finally {
        dispatch(setLoading(false));
      }
    };

    fetchVideos();
    const interval = setInterval(fetchVideos, 8000);
    return () => clearInterval(interval);
  }, [dispatch, searchQ, activeCategory]);

  // Featured live stream for top hero banner
  const featuredLiveStream = useMemo(() => {
    if (searchQ) return null; // Don't show hero during search
    return dbVideos.find(
      (v) => v.type === 'Live' && (v.status === 'Live' || v.status === 'Processing')
    );
  }, [dbVideos, searchQ]);

  // Filtered and sorted video list
  const displayVideos = useMemo(() => {
    return dbVideos
      // Base filter: only show Live streams or completely processed videos
      .filter(v => v.status === 'Live' || v.status === 'Done' || (v.type === 'Live' && v.status === 'Processing'))
      // Category / Type filter
      .filter(v => {
        if (activeCategory === 'live') return v.type === 'Live';
        if (activeCategory === 'videos') return v.type === 'VOD' && v.status === 'Done';
        if (activeCategory !== 'all') {
          return v.category?.toLowerCase() === activeCategory.toLowerCase();
        }
        return true;
      })
      // Sort logic: Active 'Live' status on top, then sort by date descending
      .sort((a, b) => {
        const aIsLive = (a.type === 'Live' && (a.status === 'Live' || a.status === 'Processing')) ? 1 : 0;
        const bIsLive = (b.type === 'Live' && (b.status === 'Live' || b.status === 'Processing')) ? 1 : 0;
        
        if (aIsLive !== bIsLive) {
          return bIsLive - aIsLive; // Push active live streams to top
        }
        return new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime();
      });
  }, [dbVideos, activeCategory]);

  const handleCategorySelect = (id: string) => {
    setActiveCategory(id);
    const newParams = new URLSearchParams(searchParams);
    if (id === 'all') {
      newParams.delete('filter');
    } else {
      newParams.set('filter', id);
    }
    setSearchParams(newParams);
  };

  const renderChannelAvatar = (video: DBVideo) => {
    if (!video.User) return null;
    return (
      <Link to={`/channel/${video.User.username}`} onClick={(e) => e.stopPropagation()} className="shrink-0">
        {video.User.avatar_url ? (
          <img src={video.User.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover bg-zinc-800 ring-1 ring-zinc-700 hover:ring-rose-500/50 transition-all" />
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
      
      {/* Search Header Indicator */}
      {searchQ && (
        <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
          <span className="text-sm text-zinc-300">
            Showing search results for <span className="text-white font-semibold">"{searchQ}"</span>
          </span>
          <button
            onClick={() => setSearchParams({})}
            className="text-xs text-rose-400 hover:text-rose-300 font-medium transition-colors cursor-pointer"
          >
            Clear Search
          </button>
        </div>
      )}

      {/* Featured Live Stream Hero Banner */}
      {featuredLiveStream && activeCategory === 'all' && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-950/40 via-zinc-900/80 to-zinc-950 border border-rose-500/30 p-5 sm:p-7 shadow-2xl backdrop-blur-md">
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            
            {/* Left Info Column */}
            <div className="flex-1 flex flex-col items-start gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-600 text-white shadow-lg shadow-rose-900/50">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  FEATURED LIVE STREAM
                </span>
                {featuredLiveStream.category && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {featuredLiveStream.category}
                  </span>
                )}
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight line-clamp-2">
                {featuredLiveStream.title}
              </h2>

              {featuredLiveStream.User && (
                <div className="flex items-center gap-2.5">
                  {featuredLiveStream.User.avatar_url ? (
                    <img src={featuredLiveStream.User.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-rose-500/50" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center">
                      <UserIcon className="w-4 h-4 text-zinc-400" />
                    </div>
                  )}
                  <span className="text-sm font-semibold text-zinc-200">
                    {featuredLiveStream.User.display_name || featuredLiveStream.User.username}
                  </span>
                </div>
              )}

              {featuredLiveStream.description && (
                <p className="text-xs sm:text-sm text-zinc-400 line-clamp-2 max-w-xl">
                  {featuredLiveStream.description}
                </p>
              )}

              <Link
                to={`/video/${featuredLiveStream.ID}`}
                className="mt-2 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold shadow-lg shadow-rose-600/30 transition-all hover:scale-105"
              >
                <Play className="w-4 h-4 fill-current" />
                Watch Live Now
              </Link>
            </div>

            {/* Right Thumbnail Column */}
            <Link
              to={`/video/${featuredLiveStream.ID}`}
              className="group relative w-full md:w-96 aspect-video rounded-xl overflow-hidden shrink-0 border border-zinc-800/80 shadow-2xl"
            >
              {featuredLiveStream.thumbnail_url ? (
                <img
                  src={featuredLiveStream.thumbnail_url}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                  <Radio className="w-12 h-12 text-rose-500 animate-pulse" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-4">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-rose-400" />
                  Live Broadcasting
                </span>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* Dynamic Category Chips */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => handleCategorySelect(cat.id)}
              className={`px-4 py-1.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-white text-zinc-950 shadow-md scale-102'
                  : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Videos Grid */}
      <section>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : displayVideos.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/50 rounded-2xl border border-zinc-800/50 mt-4">
            <VideoIcon className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-zinc-300 mb-2">No videos found</h3>
            <p className="text-zinc-500 text-sm max-w-md mx-auto">
              There are no videos matching the selected category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-1">
            {displayVideos.map((video) => {
              const isCurrentlyLive = video.type === 'Live' && (video.status === 'Live' || video.status === 'Processing');
              
              return (
                <Link 
                  to={`/video/${video.ID}`}
                  key={video.ID} 
                  className="group flex flex-col transition-all cursor-pointer"
                >
                  <div className={`aspect-video bg-zinc-900 rounded-xl overflow-hidden relative ${isCurrentlyLive ? 'border border-rose-500/40 group-hover:border-rose-500' : 'border border-zinc-800/80 group-hover:border-zinc-700'}`}>
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <VideoIcon className="w-8 h-8 text-zinc-700" />
                      </div>
                    )}
                    
                    {/* Overlay Badges */}
                    {isCurrentlyLive ? (
                      <div className="absolute bottom-2 right-2 bg-rose-600 text-white text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1.5 shadow-lg">
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                        LIVE
                      </div>
                    ) : (
                      <div className="absolute bottom-2 right-2 bg-black/85 text-white text-[11px] font-bold px-1.5 py-0.5 rounded backdrop-blur-xs">
                        {video.duration ? `${Math.floor(video.duration / 60)}:${(video.duration % 60).toString().padStart(2, '0')}` : timeAgo(video.CreatedAt)}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex gap-3 pr-2">
                    {renderChannelAvatar(video)}
                    <div className="flex flex-col overflow-hidden">
                      <h3 className="font-semibold text-zinc-100 line-clamp-2 text-sm leading-snug group-hover:text-rose-400 transition-colors">
                        {video.title}
                      </h3>
                      <div className="mt-1 flex flex-col text-xs text-zinc-400">
                        {renderChannelMeta(video)}
                        {isCurrentlyLive ? (
                          <span className="text-rose-500 font-medium mt-0.5 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            Streaming now
                          </span>
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
