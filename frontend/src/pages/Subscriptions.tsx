import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { User as UserIcon } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';
import { getSubscribedChannelsApi } from '../api/services';

interface ChannelData {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  followers_count: number;
  bio?: string;
  is_verified?: boolean;
}

export default function Subscriptions() {
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [loading, setLoading] = useState(true);
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    const fetchChannels = async () => {
      try {
        const res = await getSubscribedChannelsApi();
        setChannels(res.channels || []);
      } catch (err) {
        console.error("Failed to load subscriptions", err);
      } finally {
        setLoading(false);
      }
    };

    fetchChannels();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <UserIcon className="w-16 h-16 text-zinc-600 mb-6" />
        <h2 className="text-2xl font-bold text-white mb-2">Don't miss new videos</h2>
        <p className="text-zinc-400 mb-6">Sign in to see updates from your favorite channels</p>
        <Link to="/login" className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-6 py-2.5 rounded-full transition-colors">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
      <h1 className="text-2xl font-bold text-white mb-8">Subscriptions</h1>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 flex flex-col items-center animate-pulse">
              <div className="w-24 h-24 bg-zinc-800 rounded-full mb-4" />
              <div className="h-5 bg-zinc-800 rounded w-3/4 mb-2" />
              <div className="h-4 bg-zinc-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
          <h2 className="text-xl font-bold text-zinc-300 mb-2">No subscriptions yet</h2>
          <p className="text-zinc-500">Channels you subscribe to will show up here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {channels.map(channel => (
            <Link 
              key={channel.id} 
              to={`/channel/${channel.username}`}
              className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 flex flex-col items-center hover:bg-zinc-800 hover:border-zinc-700 transition-all group text-center"
            >
              <div className="mb-4">
                {channel.avatar_url ? (
                  <img src={channel.avatar_url} alt={channel.username} className="w-24 h-24 rounded-full object-cover bg-zinc-800 group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:scale-105 transition-transform duration-300">
                    <UserIcon className="w-10 h-10" />
                  </div>
                )}
              </div>
              
              <h3 className="font-bold text-lg text-white mb-1 flex items-center justify-center gap-1.5 w-full truncate px-2">
                {channel.display_name || channel.username}
                {channel.is_verified && (
                  <span className="shrink-0 text-zinc-400" title="Verified">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z"/></svg>
                  </span>
                )}
              </h3>
              
              <p className="text-sm text-zinc-400 mb-3">
                @{channel.username}
              </p>
              
              <div className="text-xs font-medium text-zinc-500 bg-zinc-950 px-3 py-1.5 rounded-full">
                {channel.followers_count || 0} subscribers
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
