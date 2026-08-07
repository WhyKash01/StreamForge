import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import api from '../api/axios';
import { Radio, Video, User as UserIcon } from 'lucide-react';
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

  const liveStreams = dbVideos.filter(v => v.type === 'Live' && v.status === 'Live');
  const vods = dbVideos.filter(v => v.status === 'Done');

  const renderChannelInfo = (video: DBVideo) => {
    if (!video.User) return null;
    const displayName = video.User.display_name || video.User.username;
    
    return (
      <Link 
        to={`/channel/${video.User.username}`}
        className="flex items-center gap-2 mt-2 group/channel w-fit"
        onClick={(e) => e.stopPropagation()}
      >
        {video.User.avatar_url ? (
          <img src={video.User.avatar_url} alt={displayName} className="w-6 h-6 rounded-full object-cover border border-zinc-700" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 text-zinc-400">
            <UserIcon className="w-3 h-3" />
          </div>
        )}
        <span className="text-xs text-zinc-400 group-hover/channel:text-zinc-200 transition-colors">
          {displayName}
        </span>
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
    <div className="flex flex-col gap-8">

      {/* Live Now Hero Section */}
      {liveStreams.length > 0 && (
        <section className="relative">
          <div className="absolute inset-0 bg-gradient-to-b from-rose-500/5 to-transparent rounded-3xl pointer-events-none" />
          
          <div className="flex items-center gap-3 mb-6">
            <div className="relative">
              <Radio className="w-6 h-6 text-red-500" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-white">Live Now</h2>
            <span className="text-xs font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
              {liveStreams.length} stream{liveStreams.length > 1 ? 's' : ''}
            </span>
          </div>

          {/* Featured live stream (first one) */}
          <Link 
            to={`/video/${liveStreams[0].ID}`}
            className="group block mb-6 bg-zinc-900 rounded-2xl overflow-hidden border border-rose-500/20 hover:border-rose-500/40 transition-all shadow-2xl shadow-rose-900/10"
          >
            <div className="grid grid-cols-1 lg:grid-cols-5">
              <div className="lg:col-span-3 aspect-video lg:aspect-auto bg-zinc-950 relative overflow-hidden">
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                  <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-md flex items-center gap-1.5 shadow-lg shadow-red-500/30">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    LIVE
                  </span>
                </div>
                {liveStreams[0].thumbnail_url ? (
                  <img 
                    src={liveStreams[0].thumbnail_url} 
                    alt={liveStreams[0].title} 
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" 
                  />
                ) : (
                  <div className="w-full h-full min-h-64 flex items-center justify-center bg-gradient-to-br from-rose-950 to-zinc-950">
                    <Radio className="w-16 h-16 text-rose-900/50 group-hover:text-rose-500/50 transition-colors" />
                  </div>
                )}
              </div>
              <div className="lg:col-span-2 p-6 lg:p-8 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-zinc-800">
                <h3 className="text-2xl font-bold text-white group-hover:text-rose-400 transition-colors mb-3 line-clamp-2">
                  {liveStreams[0].title}
                </h3>
                {liveStreams[0].description && (
                  <p className="text-zinc-400 text-sm mb-4 line-clamp-3">{liveStreams[0].description}</p>
                )}
                {liveStreams[0].User && (
                  <div className="flex items-center gap-3 mt-auto">
                    {liveStreams[0].User.avatar_url ? (
                      <img src={liveStreams[0].User.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-rose-500/30" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-rose-500/30">
                        <UserIcon className="w-5 h-5 text-zinc-400" />
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-semibold text-zinc-100">
                        {liveStreams[0].User.display_name || liveStreams[0].User.username}
                      </div>
                      <div className="text-xs text-zinc-500">Streaming now</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Link>

          {/* Additional live streams */}
          {liveStreams.length > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {liveStreams.slice(1).map((stream) => (
                <Link 
                  to={`/video/${stream.ID}`} 
                  key={stream.ID}
                  className="group flex flex-col bg-zinc-900 rounded-xl overflow-hidden border border-rose-900/30 hover:border-rose-500/50 transition-all shadow-xl shadow-rose-900/10"
                >
                  <div className="aspect-video bg-zinc-950 relative overflow-hidden">
                    <div className="absolute top-2 left-2 z-10">
                      <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-lg shadow-red-500/30">
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                        LIVE
                      </span>
                    </div>
                    {stream.thumbnail_url ? (
                      <img src={stream.thumbnail_url} alt={stream.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Radio className="w-10 h-10 text-rose-900/50 group-hover:text-rose-500 transition-colors" />
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t border-zinc-800 flex-1 flex flex-col">
                    <h3 className="font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors truncate text-sm">
                      {stream.title}
                    </h3>
                    {renderChannelInfo(stream)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
      
      {/* Videos Section */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1.5 h-6 bg-rose-500 rounded-full" />
          <h2 className="text-xl font-bold text-white">Videos</h2>
          {!loading && vods.length > 0 && (
            <span className="text-xs font-medium text-zinc-500">
              {vods.length} video{vods.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : vods.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
            <Video className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-zinc-300 mb-2">No videos yet</h3>
            <p className="text-zinc-500 text-sm max-w-md mx-auto">
              Start a live stream or upload a video to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {vods.map((video) => (
              <Link 
                to={`/video/${video.ID}`}
                key={video.ID} 
                className="group flex flex-col bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-900/10"
              >
                <div className="aspect-video bg-zinc-950 flex items-center justify-center overflow-hidden relative">
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" />
                  ) : (
                    <Video className="w-10 h-10 text-zinc-700 group-hover:text-rose-500 transition-colors" />
                  )}
                  {video.CreatedAt && (
                    <div className="absolute bottom-2 right-2 bg-black/70 text-zinc-300 text-[10px] font-medium px-1.5 py-0.5 rounded backdrop-blur-sm">
                      {timeAgo(video.CreatedAt)}
                    </div>
                  )}
                </div>
                <div className="p-4 border-t border-zinc-800 flex-1 flex flex-col">
                  <h3 className="font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors truncate text-sm">
                    {video.title}
                  </h3>
                  {renderChannelInfo(video)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
