import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import { Video as VideoIcon, Radio, User as UserIcon } from 'lucide-react';

interface ChannelData {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  banner_url: string;
  bio: string;
  is_verified: boolean;
  followers_count: number;
  following_count: number;
  videos: any[];
  is_subscribed?: boolean;
}

import { toggleSubscriptionApi } from '../api/services';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';

export default function Channel() {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { username } = useParams<{ username: string }>();
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'videos' | 'live'>('home');

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

  const handleSubscribe = async () => {
    if (!channel) return;
    setSubmitting(true);
    
    // Optimistic update
    const wasSubscribed = channel.is_subscribed;
    setChannel(prev => prev ? {
      ...prev,
      is_subscribed: !wasSubscribed,
      followers_count: prev.followers_count + (wasSubscribed ? -1 : 1)
    } : prev);

    try {
      await toggleSubscriptionApi(channel.id);
    } catch (err) {
      // Revert optimistic update on failure
      setChannel(prev => prev ? {
        ...prev,
        is_subscribed: wasSubscribed,
        followers_count: prev.followers_count + (wasSubscribed ? 1 : -1)
      } : prev);
      console.error('Failed to toggle subscription', err);
    } finally {
      setSubmitting(false);
    }
  };

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
  const pastLiveStreams = (channel.videos || []).filter((v: any) => v.type === 'Live' && v.status === 'Done');
  const uploadedVods = (channel.videos || []).filter((v: any) => v.type === 'VOD' && v.status === 'Done');
  const allCompletedVideos = [...uploadedVods, ...pastLiveStreams].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-8 pb-12">
      {/* Channel Header Banner */}
      <div className="w-full relative">
        <div className="h-40 md:h-56 lg:h-64 w-full bg-zinc-800 overflow-hidden rounded-xl">
          {channel.banner_url ? (
            <img src={channel.banner_url} alt="Banner" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-linear-to-r from-rose-900 to-rose-600 opacity-50"></div>
          )}
        </div>
        
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mt-6 px-4 md:px-8">
          <div className="shrink-0">
            {channel.avatar_url ? (
              <img src={channel.avatar_url} alt={channel.display_name || channel.username} className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover bg-zinc-800" />
            ) : (
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                <UserIcon className="w-12 h-12 md:w-16 md:h-16" />
              </div>
            )}
          </div>

          <div className="text-center md:text-left flex-1 flex flex-col justify-center pt-2">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-1 flex items-center justify-center md:justify-start gap-2">
              {channel.display_name || channel.username}
              {channel.is_verified && (
                <span className="bg-zinc-600 text-white rounded-full p-0.5" title="Verified">
                  {/* SVG Checkmark */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
            </h1>
            <div className="text-zinc-400 font-medium text-sm md:text-base mb-3 flex items-center justify-center md:justify-start gap-2">
              <span>@{channel.username}</span>
              <span>•</span>
              <span>{channel.followers_count || 0} subscribers</span>
              <span>•</span>
              <span>{channel.videos?.length || 0} videos</span>
            </div>
            {channel.bio && (
              <p className="text-zinc-300 max-w-2xl text-sm mb-4 line-clamp-2 md:line-clamp-none">{channel.bio}</p>
            )}
            <div>
              {currentUser?.username === channel.username ? (
                <Link to="/studio">
                  <button className="bg-zinc-800 text-white hover:bg-zinc-700 font-semibold px-4 py-2 rounded-full transition-colors shadow-sm">
                    Customize channel
                  </button>
                </Link>
              ) : (
                <button 
                  onClick={handleSubscribe}
                  disabled={submitting}
                  className={`font-semibold px-4 py-2 rounded-full transition-colors shadow-sm disabled:opacity-70 ${
                    channel.is_subscribed 
                      ? 'bg-zinc-800 text-white hover:bg-zinc-700' 
                      : 'bg-white text-black hover:bg-zinc-200'
                  }`}
                >
                  {channel.is_subscribed ? 'Subscribed' : 'Subscribe'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-6 mt-8 px-4 md:px-8 border-b border-zinc-800">
          <button 
            onClick={() => setActiveTab('home')}
            className={`px-1 py-3 font-medium transition-colors ${activeTab === 'home' ? 'text-white border-b-2 border-white' : 'text-zinc-400 hover:text-white'}`}
          >Home</button>
          <button 
            onClick={() => setActiveTab('videos')}
            className={`px-1 py-3 font-medium transition-colors ${activeTab === 'videos' ? 'text-white border-b-2 border-white' : 'text-zinc-400 hover:text-white'}`}
          >Videos</button>
          <button 
            onClick={() => setActiveTab('live')}
            className={`px-1 py-3 font-medium transition-colors ${activeTab === 'live' ? 'text-white border-b-2 border-white' : 'text-zinc-400 hover:text-white'}`}
          >Live</button>
        </div>
      </div>

      {/* Videos Section */}
      <div className="px-4 md:px-0 space-y-12 mt-4">
        
        {(activeTab === 'home' || activeTab === 'live') && liveStreams.length > 0 && (
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

        {(activeTab === 'home' || activeTab === 'videos') && (
          <section>
            <h2 className="text-xl font-bold text-zinc-200 mb-6 flex items-center gap-2 border-b border-zinc-800 pb-2">
              {activeTab === 'home' ? 'Recent Videos' : 'Uploads'}
            </h2>
            {(activeTab === 'home' ? allCompletedVideos : uploadedVods).length === 0 ? (
              <div className="text-zinc-500 bg-zinc-900/50 p-8 rounded-xl border border-zinc-800/50 text-center">
                This channel hasn't uploaded any videos yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {(activeTab === 'home' ? allCompletedVideos : uploadedVods).map((video) => (
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
        )}

        {activeTab === 'live' && pastLiveStreams.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-zinc-200 mb-6 flex items-center gap-2 border-b border-zinc-800 pb-2">
              Past Streams
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {pastLiveStreams.map((video) => (
                <Link 
                  to={`/video/${video.ID}`}
                  key={video.ID} 
                  className="group block bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-900/10"
                >
                  <div className="aspect-video bg-zinc-950 relative flex items-center justify-center overflow-hidden">
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" />
                    ) : (
                      <Radio className="w-10 h-10 text-zinc-600 group-hover:text-rose-500 transition-colors" />
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
          </section>
        )}
      </div>
    </div>
  );
}
