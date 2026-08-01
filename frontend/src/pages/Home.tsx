import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { Play, Radio, Video, User as UserIcon } from 'lucide-react';

interface DBVideo {
  ID: number;
  title: string;
  description: string;
  url: string;
  type: string;
  status: string;
  thumbnail_url: string;
  CreatedAt: string;
  User?: {
    username: string;
    display_name: string;
    avatar_url: string;
  };
}

export default function Home() {
  const [dbVideos, setDbVideos] = useState<DBVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const dbRes = await api.get('/metadata/videos');
        setDbVideos(dbRes.data || []);
      } catch (err) {
        console.error('Failed to fetch videos', err);
      } finally {
        setLoading(false);
      }
    };
    fetchVideos();
    
    // Poll every 5 seconds for live streams updates
    const interval = setInterval(fetchVideos, 5000);
    return () => clearInterval(interval);
  }, []);

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

  return (
    <div className="flex flex-col gap-8">
      <header className="text-center md:text-left py-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
          Welcome to <span className="text-rose-500">StreamForge</span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl">
          Your premium destination for high-quality video streaming. Discover, watch, and share your favorite moments.
        </p>
      </header>

      {/* Live Streams Section */}
      {liveStreams.length > 0 && (
        <section className="bg-rose-950/20 border border-rose-900/50 p-6 rounded-2xl mb-4">
          <h2 className="text-xl font-semibold text-rose-500 mb-6 flex items-center gap-2">
            <Radio className="w-6 h-6 animate-pulse" />
            Live Now
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {liveStreams.map((stream) => (
              <div key={stream.ID} className="group flex flex-col bg-zinc-900 rounded-xl overflow-hidden border border-rose-900/30 hover:border-rose-500/50 transition-all shadow-xl shadow-rose-900/10">
                <Link to={`/video/${stream.ID}`} className="block relative">
                  <div className="aspect-video bg-zinc-950 flex items-center justify-center overflow-hidden">
                    <div className="absolute top-2 left-2 bg-rose-600 text-white text-xs font-bold px-2 py-1 rounded animate-pulse z-10">LIVE</div>
                    {stream.thumbnail_url ? (
                      <img src={stream.thumbnail_url} alt={stream.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" />
                    ) : (
                      <Radio className="w-10 h-10 text-rose-900/50 group-hover:text-rose-500 transition-colors" />
                    )}
                  </div>
                </Link>
                <div className="p-4 border-t border-zinc-800 flex-1 flex flex-col">
                  <Link to={`/video/${stream.ID}`}>
                    <h3 className="font-semibold text-zinc-100 hover:text-rose-400 transition-colors truncate">
                      {stream.title}
                    </h3>
                  </Link>
                  {renderChannelInfo(stream)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      
      {/* VODs Section */}
      <section>
        <h2 className="text-xl font-semibold text-zinc-200 mb-6 flex items-center gap-2">
          <div className="w-2 h-6 bg-rose-500 rounded-full"></div>
          Recent Uploads & Recordings
        </h2>

        {loading ? (
          <div className="text-zinc-500">Loading videos...</div>
        ) : vods.length === 0 ? (
          <div className="text-zinc-500 bg-zinc-900 p-8 rounded-xl border border-zinc-800 text-center">
            No videos available yet. Go ahead and start a stream or upload a video!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {vods.map((video) => (
              <div key={video.ID} className="group flex flex-col bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-900/10">
                <Link to={`/video/${video.ID}`} className="block relative">
                  <div className="aspect-video bg-zinc-950 flex items-center justify-center overflow-hidden">
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" />
                    ) : (
                      <Video className="w-10 h-10 text-zinc-600 group-hover:text-rose-500 transition-colors" />
                    )}
                  </div>
                </Link>
                <div className="p-4 border-t border-zinc-800 flex-1 flex flex-col">
                  <Link to={`/video/${video.ID}`}>
                    <h3 className="font-semibold text-zinc-100 hover:text-rose-400 transition-colors truncate">
                      {video.title}
                    </h3>
                  </Link>
                  {renderChannelInfo(video)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
