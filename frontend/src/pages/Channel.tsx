import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import { Video as VideoIcon, Radio, User as UserIcon } from 'lucide-react';

interface ChannelData {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  videos: any[];
}

export default function Channel() {
  const { username } = useParams<{ username: string }>();
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchChannel = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/channel/${username}`);
        setChannel(res.data.channel);
      } catch (err: any) {
        console.error('Failed to fetch channel', err);
        setError(err.response?.data?.error || 'Channel not found');
      } finally {
        setLoading(false);
      }
    };
    fetchChannel();
  }, [username]);

  if (loading) {
    return <div className="text-center mt-20 text-zinc-500 animate-pulse font-medium">Loading Channel...</div>;
  }

  if (error || !channel) {
    return (
      <div className="text-center mt-20 text-rose-500">
        <h2 className="text-2xl font-bold mb-2">Error</h2>
        <p>{error}</p>
        <Link to="/" className="inline-block mt-4 text-zinc-400 hover:text-white transition-colors">
          Go back home
        </Link>
      </div>
    );
  }

  const liveStreams = (channel.videos || []).filter((v: any) => v.type === 'Live' && v.status === 'Live');
  const vods = (channel.videos || []).filter((v: any) => v.status === 'Done');

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-8 pb-12">
      {/* Channel Header Banner */}
      <div className="bg-zinc-900 rounded-b-3xl border-b border-x border-zinc-800 overflow-hidden shadow-2xl relative">
        <div className="h-32 md:h-48 bg-linear-to-r from-rose-900 to-rose-600 opacity-50"></div>
        <div className="px-6 md:px-12 pb-8 flex flex-col md:flex-row items-center md:items-end gap-6 -mt-16 relative z-10">
          
          <div className="bg-zinc-900 p-2 rounded-full border-4 border-zinc-900">
            {channel.avatar_url ? (
              <img src={channel.avatar_url} alt={channel.display_name || channel.username} className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover bg-zinc-800" />
            ) : (
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                <UserIcon className="w-12 h-12 md:w-16 md:h-16" />
              </div>
            )}
          </div>

          <div className="text-center md:text-left flex-1">
            <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-1">
              {channel.display_name || channel.username}
            </h1>
            <div className="text-zinc-400 font-medium text-lg mb-3">
              @{channel.username}
            </div>
            {channel.bio && (
              <p className="text-zinc-300 max-w-2xl">{channel.bio}</p>
            )}
          </div>
          
          <div>
            <button className="bg-white text-black font-semibold px-6 py-2.5 rounded-full hover:bg-zinc-200 transition-colors shadow-lg">
              Subscribe
            </button>
          </div>
        </div>
      </div>

      {/* Videos Section */}
      <div className="px-4 md:px-0 space-y-12 mt-4">
        
        {liveStreams.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-rose-500 mb-6 flex items-center gap-2">
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
                  <div className="aspect-video bg-zinc-950 relative flex items-center justify-center overflow-hidden">
                    <div className="absolute top-2 left-2 bg-rose-600 text-white text-xs font-bold px-2 py-1 rounded animate-pulse z-10">LIVE</div>
                    {stream.thumbnail_url ? (
                      <img src={stream.thumbnail_url} alt={stream.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" />
                    ) : (
                      <Radio className="w-10 h-10 text-rose-900/50 group-hover:text-rose-500 transition-colors" />
                    )}
                  </div>
                  <div className="p-4 border-t border-zinc-800">
                    <h3 className="font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors truncate">
                      {stream.title}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{stream.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xl font-bold text-zinc-200 mb-6 flex items-center gap-2 border-b border-zinc-800 pb-2">
            Videos
          </h2>
          {vods.length === 0 ? (
            <div className="text-zinc-500 bg-zinc-900/50 p-8 rounded-xl border border-zinc-800/50 text-center">
              This channel hasn't uploaded any videos yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {vods.map((video) => (
                <Link 
                  to={`/video/${video.ID}`}
                  key={video.ID} 
                  className="group block bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-900/10"
                >
                  <div className="aspect-video bg-zinc-950 relative flex items-center justify-center overflow-hidden">
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" />
                    ) : (
                      <VideoIcon className="w-10 h-10 text-zinc-600 group-hover:text-rose-500 transition-colors" />
                    )}
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
    </div>
  );
}
