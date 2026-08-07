import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../api/axios';
import { User as UserIcon, ArrowLeft, Trash2 } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';
import VideoPlayer from '../components/VideoPlayer';

interface ChannelInfo {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
}

interface VideoMeta {
  title: string;
  description: string;
  type: string;
  status: string;
  created_at: string;
}

export default function Video() {
  const { id } = useParams();
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [title, setTitle] = useState('');
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const currentUser = useSelector((state: RootState) => state.auth.user);
  
  const [videoStatus, setVideoStatus] = useState<string>('');
  const [progress, setProgress] = useState<string>('');
  const [isPolling, setIsPolling] = useState(false);

  // Poll for video status after stream ends
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPolling) {
      const checkStatus = async () => {
        try {
           const res = await api.get(`/metadata/videos/${id}/status`);
           setVideoStatus(res.data.status);
           if (res.data.progress) {
             setProgress(res.data.progress);
           }
           if (res.data.status === 'Done' || res.data.status === 'Failed') {
             setIsPolling(false);
           }
        } catch (e) {
           console.error('Failed to poll video status', e);
           // Optional: stop polling on fatal errors, but let's keep retrying for resilience
        }
      };
      
      checkStatus(); // Check immediately
      interval = setInterval(checkStatus, 3000);
    }
    return () => clearInterval(interval);
  }, [isPolling, id]);

  useEffect(() => {
    const fetchPlayback = async () => {
      try {
        const res = await api.get(`/metadata/videos/${id}/play`);
        setPlaybackUrl(res.data.playback_url);
        setTitle(res.data.title);
        setChannel(res.data.channel || null);
        setMeta({
          title: res.data.title,
          description: res.data.description || '',
          type: res.data.type || 'VOD',
          status: res.data.status || 'Done',
          created_at: res.data.created_at || '',
        });
      } catch (err: any) {
        console.error('Failed to fetch playback info', err);
        setError(err.response?.data?.error || 'Failed to load video');
        
        // If the video exists but playback isn't ready, start polling
        if (err.response?.status === 404 || err.response?.status === 400) {
          setIsPolling(true);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPlayback();
  }, [id]);

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
      try {
        await api.delete(`/metadata/videos/${id}`);
        window.location.href = '/';
      } catch (err: any) {
        alert(err.response?.data?.error || 'Failed to delete video');
      }
    }
  };

  const isLive = meta?.type === 'Live' && videoStatus !== 'Done' && videoStatus !== 'Failed';

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <Link to="/" className="inline-flex items-center text-zinc-500 hover:text-white transition-colors w-fit group text-sm">
        <ArrowLeft className="w-4 h-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
        Back to Home
      </Link>
      
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl">
        <div className="aspect-video bg-black flex items-center justify-center relative group">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
              <span className="text-zinc-500 text-sm font-medium">Loading player...</span>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-10 p-6 text-center">
              {['Uploading', 'Uploaded', 'Processing'].includes(videoStatus) ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-6" />
                  <h3 className="text-xl font-bold text-zinc-100 mb-2">Stream has ended</h3>
                  <p className="text-zinc-400 text-sm mb-2">
                    {videoStatus === 'Uploading' ? 'The recording is being uploaded...' :
                     videoStatus === 'Uploaded' ? 'Waiting in queue for processing...' :
                     'The recording is being processed...'}
                  </p>
                  {progress && (
                    <div className="mt-2 text-xs font-mono text-emerald-400 bg-emerald-950/30 px-3 py-1.5 rounded-full border border-emerald-500/20">
                      {progress}
                    </div>
                  )}
                  <span className="text-xs text-zinc-500 mt-4">This page will update automatically.</span>
                </div>
              ) : videoStatus === 'Done' ? (
                <div className="flex flex-col items-center">
                  <svg className="w-12 h-12 text-emerald-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <h3 className="text-xl font-bold text-emerald-400 mb-2">Recording is ready!</h3>
                  <p className="text-zinc-400 text-sm mb-6">The VOD is now available to watch.</p>
                  <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-xl transition-colors shadow-lg shadow-emerald-500/20">
                    Watch VOD
                  </button>
                </div>
              ) : (
                <div className="text-zinc-400 flex flex-col items-center gap-3">
                  <svg className="w-12 h-12 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </div>
          ) : (
              <VideoPlayer 
                src={playbackUrl} 
                onError={(err) => {
                  setError(err);
                  if (err === 'Stream has ended.') {
                    setIsPolling(true);
                  }
                }}
              />
          )}
        </div>
        
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h2 className="text-2xl font-bold text-white">
              {loading ? (
                <div className="h-7 w-64 skeleton rounded" />
              ) : title}
            </h2>
            {isLive && (
              <span className="shrink-0 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-md flex items-center gap-1.5 shadow-lg shadow-red-500/30">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                LIVE
              </span>
            )}
            {currentUser && channel && currentUser.id === channel.id && !isLive && (
              <button 
                onClick={handleDelete}
                className="shrink-0 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 p-2 rounded-lg transition-colors border border-rose-500/20"
                title="Delete Video"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>

          {meta?.description && (
            <p className="text-zinc-400 text-sm mb-6">{meta.description}</p>
          )}
          
          {channel && (
            <div className="flex items-center gap-4 pt-4 border-t border-zinc-800">
              <Link to={`/channel/${channel.username}`}>
                {channel.avatar_url ? (
                  <img src={channel.avatar_url} alt={channel.display_name || channel.username} className="w-12 h-12 rounded-full object-cover border-2 border-zinc-700 hover:border-zinc-500 transition-colors" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-zinc-700 text-zinc-400 hover:border-zinc-500 transition-colors">
                    <UserIcon className="w-6 h-6" />
                  </div>
                )}
              </Link>
              <div>
                <Link to={`/channel/${channel.username}`} className="text-lg font-bold text-zinc-100 hover:text-white transition-colors">
                  {channel.display_name || channel.username}
                </Link>
                <div className="text-sm text-zinc-500">@{channel.username}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
