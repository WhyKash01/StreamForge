import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../api/axios';
import { User as UserIcon, Trash2, ThumbsUp, ThumbsDown, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';
import { recordVideoViewApi, toggleLikeVideoApi, toggleDislikeVideoApi, getVideoLikeStatusApi, toggleSubscriptionApi } from '../api/services';
import VideoPlayer from '../components/VideoPlayer';
import Comments from '../components/Comments';

interface ChannelInfo {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  followers_count?: number;
}

interface VideoMeta {
  title: string;
  description: string;
  type: string;
  status: string;
  created_at: string;
  category?: string;
  tags?: string;
  views?: number;
  likes_count?: number;
  dislikes_count?: number;
}

export default function Video() {
  const { id } = useParams();
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [title, setTitle] = useState('');
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isStreamEnded, setIsStreamEnded] = useState(false);
  
  const currentUser = useSelector((state: RootState) => state.auth.user);
  
  const [videoStatus, setVideoStatus] = useState<string>('');
  const [progress, setProgress] = useState<string>('');
  const [isPolling, setIsPolling] = useState(false);
  
  const [videoLiked, setVideoLiked] = useState(false);
  const [videoDisliked, setVideoDisliked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [dislikesCount, setDislikesCount] = useState(0);
  const [viewsCount, setViewsCount] = useState(0);
  
  const [descExpanded, setDescExpanded] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);

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
        }
      };
      
      checkStatus();
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
          category: res.data.category || '',
          tags: res.data.tags || '',
          views: res.data.views || 0,
          likes_count: res.data.likes_count || 0,
          dislikes_count: res.data.dislikes_count || 0,
        });
        setLikesCount(res.data.likes_count || 0);
        setDislikesCount(res.data.dislikes_count || 0);
        setViewsCount(res.data.views || 0);
        
        if (id) {
          recordVideoViewApi(id).catch(e => console.error("Failed to record view", e));
        }
      } catch (err: any) {
        console.error('Failed to fetch playback info', err);
        setError(err.response?.data?.error || 'Failed to load video');
        
        if (err.response?.status === 404 || err.response?.status === 400) {
          setIsPolling(true);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPlayback();
  }, [id]);

  // Check subscription status
  useEffect(() => {
    if (channel && isAuthenticated) {
      api.get(`/channel/${channel.username}`).then(res => {
        setIsSubscribed(res.data.is_subscribed || false);
      }).catch(() => {});
    }
  }, [channel, isAuthenticated]);

  useEffect(() => {
    if (id && isAuthenticated) {
      getVideoLikeStatusApi(id).then(res => {
        setVideoLiked(res.liked);
        setVideoDisliked(res.disliked);
      }).catch(e => console.error(e));
    }
  }, [id, isAuthenticated]);

  const handleLikeVideo = async () => {
    if (!isAuthenticated) return alert("Please sign in to like this video.");
    if (!id) return;
    try {
      const res = await toggleLikeVideoApi(id);
      setVideoLiked(res.liked);
      setVideoDisliked(res.disliked);
      setLikesCount(res.likes_count);
      setDislikesCount(res.dislikes_count);
    } catch (e) {
      console.error("Failed to like video", e);
    }
  };

  const handleDislikeVideo = async () => {
    if (!isAuthenticated) return alert("Please sign in to dislike this video.");
    if (!id) return;
    try {
      const res = await toggleDislikeVideoApi(id);
      setVideoLiked(res.liked);
      setVideoDisliked(res.disliked);
      setLikesCount(res.likes_count);
      setDislikesCount(res.dislikes_count);
    } catch (e) {
      console.error("Failed to dislike video", e);
    }
  };

  const handleSubscribe = async () => {
    if (!isAuthenticated) return alert("Please sign in to subscribe.");
    if (!channel) return;
    try {
      const res = await toggleSubscriptionApi(channel.id);
      setIsSubscribed(res.subscribed);
      setChannel(prev => prev ? { ...prev, followers_count: (prev.followers_count || 0) + (res.subscribed ? 1 : -1) } : prev);
    } catch (e) {
      console.error("Failed to subscribe", e);
    }
  };

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

  const formatViews = (views: number) => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K views`;
    return `${views} views`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const isLive = meta?.type === 'Live' && videoStatus !== 'Done' && videoStatus !== 'Failed';
  const isOwner = currentUser && channel && currentUser.id === channel.id;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Video Player — full width, no border */}
      <div className="w-full aspect-video bg-black rounded-xl overflow-hidden">
        {loading ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-3 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
            <span className="text-zinc-500 text-sm font-medium">Loading player...</span>
          </div>
        ) : error ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
            {(['Uploading', 'Uploaded'].includes(videoStatus) || (videoStatus === 'Processing' && meta?.type !== 'Live')) ? (
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
                <div className="mt-8">
                  <Link to="/" className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-sm rounded-xl transition-colors inline-flex items-center gap-2 border border-zinc-700">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Browse other streams
                  </Link>
                </div>
              </div>
            ) : videoStatus === 'Done' ? (
              <div className="flex flex-col items-center">
                <svg className="w-12 h-12 text-emerald-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <h3 className="text-xl font-bold text-emerald-400 mb-2">Recording is ready!</h3>
                <p className="text-zinc-400 text-sm mb-6">The VOD is now available to watch.</p>
                <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-xl transition-colors">
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
          (() => {
            const currentStatus = videoStatus || meta?.status;
            const isActiveLive = meta?.type === 'Live' && !meta?.title?.endsWith(' (VOD)') && (currentStatus === 'Live' || currentStatus === 'Processing');
            const isPastBroadcast = meta?.type === 'Live' && !isActiveLive;

            if (currentStatus === 'Done' && meta?.status !== 'Done') {
              return (
                <div className="w-full aspect-video bg-zinc-900/50 rounded-2xl flex flex-col items-center justify-center border border-zinc-800 p-6 text-center">
                  <svg className="w-12 h-12 text-emerald-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <h3 className="text-xl font-bold text-emerald-400 mb-2">Recording is ready!</h3>
                  <p className="text-zinc-400 text-sm mb-6">The high-quality VOD is now available to watch.</p>
                  <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-xl transition-colors">
                    Watch VOD
                  </button>
                </div>
              );
            }

            if (isPastBroadcast && (currentStatus === 'Uploading' || currentStatus === 'Processing' || currentStatus === 'Pending')) {
              return (
                <div className="w-full aspect-video bg-zinc-900/50 rounded-2xl flex flex-col items-center justify-center border border-zinc-800 p-6 text-center">
                  <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-4" />
                  <h3 className="text-xl font-bold text-zinc-200 mb-2">The Live Stream has ended</h3>
                  <p className="text-zinc-400 text-sm max-w-md">The high-quality VOD is currently being processed and will be available to watch shortly. Please check back soon.</p>
                </div>
              );
            }

            return (
              <VideoPlayer 
                src={playbackUrl} 
                mode={isActiveLive ? (isStreamEnded ? 'ended' : 'live') : 'vod'}
                wasLive={isPastBroadcast}
              onError={(err) => {
                setError(err);
                if (err === 'Stream has ended.') {
                  setIsPolling(true);
                }
              }}
              onEnded={() => {
                console.log('VideoPlayer onEnded triggered.', { type: meta?.type, status: videoStatus });
                if (meta?.type === 'Live' && videoStatus !== 'Done') {
                  setIsStreamEnded(true);
                  setIsPolling(true);
                }
              }}
            />
            );
          })()
        )}
      </div>
      
      {/* Title */}
      <div className="mt-3 px-1">
        <h1 className="text-xl font-bold text-white leading-snug flex items-center gap-3">
          {loading ? (
            <div className="h-6 w-96 bg-zinc-800 rounded animate-pulse" />
          ) : (
            <>
              {title}
              {isLive && (
                <span className="shrink-0 bg-red-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  LIVE
                </span>
              )}
            </>
          )}
        </h1>
      </div>

      {/* Channel Row + Actions — YouTube-style */}
      <div className="mt-3 px-1 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Left: Channel Info + Subscribe */}
        <div className="flex items-center gap-3">
          {channel && (
            <>
              <Link to={`/channel/${channel.username}`} className="shrink-0">
                {channel.avatar_url ? (
                  <img src={channel.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover bg-zinc-800" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-zinc-400" />
                  </div>
                )}
              </Link>
              <div className="min-w-0">
                <Link to={`/channel/${channel.username}`} className="text-sm font-semibold text-white hover:text-zinc-200 transition-colors truncate block">
                  {channel.display_name || channel.username}
                </Link>
                <span className="text-xs text-zinc-400">
                  {channel.followers_count ? formatCount(channel.followers_count) : '0'} subscribers
                </span>
              </div>
              {!isOwner && (
                <button
                  onClick={handleSubscribe}
                  className={`ml-2 px-4 py-2 text-sm font-semibold rounded-full transition-all duration-200 ${
                    isSubscribed 
                      ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200' 
                      : 'bg-white text-zinc-900 hover:bg-zinc-200'
                  }`}
                >
                  {isSubscribed ? 'Subscribed' : 'Subscribe'}
                </button>
              )}
            </>
          )}
        </div>
        
        {/* Right: Like/Dislike + Delete */}
        <div className="flex items-center gap-2">
          {/* Like / Dislike pill */}
          <div className="flex items-center bg-zinc-800 rounded-full overflow-hidden">
            <button 
              onClick={handleLikeVideo}
              className={`flex items-center gap-2 px-4 py-2 transition-colors ${videoLiked ? 'bg-white/15 text-white' : 'hover:bg-zinc-700 text-zinc-200'}`}
            >
              <ThumbsUp className={`w-5 h-5 ${videoLiked ? 'fill-current' : ''}`} />
              <span className="text-sm font-medium">{likesCount > 0 ? formatCount(likesCount) : ''}</span>
            </button>
            <div className="w-px h-6 bg-zinc-600" />
            <button 
              onClick={handleDislikeVideo}
              className={`flex items-center gap-1 px-4 py-2 transition-colors ${videoDisliked ? 'bg-white/15 text-white' : 'hover:bg-zinc-700 text-zinc-200'}`}
            >
              <ThumbsDown className={`w-5 h-5 ${videoDisliked ? 'fill-current' : ''}`} />
              {dislikesCount > 0 && <span className="text-sm font-medium">{formatCount(dislikesCount)}</span>}
            </button>
          </div>
          
          {/* Delete button — only for video owner */}
          {isOwner && !isLive && (
            <button 
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-rose-500/20 text-zinc-300 hover:text-rose-400 rounded-full transition-colors"
              title="Delete Video"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Description Box — YouTube-style collapsible card */}
      <div 
        className="mt-3 mx-1 bg-zinc-800/60 hover:bg-zinc-800/80 rounded-xl px-4 py-3 cursor-pointer transition-colors"
        onClick={() => setDescExpanded(!descExpanded)}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <span className="flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-zinc-400" />
            {formatViews(viewsCount)}
          </span>
          <span className="text-zinc-500">•</span>
          <span>{formatDate(meta?.created_at || '')}</span>
          {meta?.category && (
            <>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-400">{meta.category}</span>
            </>
          )}
          
          <span className="ml-auto">
            {descExpanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
          </span>
        </div>
        
        {descExpanded && (
          <div className="mt-3 space-y-3" onClick={e => e.stopPropagation()}>
            {meta?.description && (
              <p className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed">{meta.description}</p>
            )}
            
            {meta?.tags && (
              <div className="flex flex-wrap gap-2">
                {meta.tags.split(',').map(tag => tag.trim()).filter(Boolean).map((tag, i) => (
                  <span key={i} className="text-blue-400 hover:text-blue-300 text-sm cursor-pointer transition-colors">
                    #{tag.replace(/^#/, '')}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        
        {!descExpanded && meta?.description && (
          <p className="text-zinc-400 text-sm mt-1 line-clamp-1">{meta.description}</p>
        )}
      </div>

      {/* Comments */}
      <div className="mx-1">
        {channel && id && (
          <Comments videoId={Number(id)} videoOwnerId={channel.id} />
        )}
      </div>
    </div>
  );
}
