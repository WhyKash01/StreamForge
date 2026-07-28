import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { Play, Radio, Video } from 'lucide-react';

interface DBVideo {
  ID: number;
  title: string;
  description: string;
  url: string;
  type: string;
  status: string;
  CreatedAt: string;
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
              <Link 
                to={`/video/${stream.ID}`}
                key={stream.ID} 
                className="group block bg-zinc-900 rounded-xl overflow-hidden border border-rose-900/30 hover:border-rose-500/50 transition-all shadow-xl shadow-rose-900/10"
              >
                <div className="aspect-video bg-zinc-950 relative flex items-center justify-center">
                  <div className="absolute top-2 left-2 bg-rose-600 text-white text-xs font-bold px-2 py-1 rounded animate-pulse">LIVE</div>
                  <Radio className="w-10 h-10 text-rose-900/50 group-hover:text-rose-500 transition-colors" />
                </div>
                <div className="p-4 border-t border-zinc-800">
                  <h3 className="font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors truncate">
                    {stream.title}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">{stream.description}</p>
                </div>
              </Link>
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
              <Link 
                to={`/video/${video.ID}`}
                key={video.ID} 
                className="group block bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-900/10"
              >
                <div className="aspect-video bg-zinc-950 relative flex items-center justify-center">
                  <Video className="w-10 h-10 text-zinc-600 group-hover:text-rose-500 transition-colors" />
                </div>
                <div className="p-4 border-t border-zinc-800">
                  <h3 className="font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors truncate">
                    {video.title}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{video.description}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
