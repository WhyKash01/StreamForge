import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../api/axios';
import { 
  User as UserIcon, 
  Trash2, 
  ThumbsUp, 
  ThumbsDown, 
  Eye, 
  ChevronDown, 
  ChevronUp,
  Share2,
  Copy,
  Check,
  Video as VideoIcon,
  AlertTriangle,
  X
} from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store/store';
import { setVideos, type DBVideo } from '../store/slices/appSlice';
import { 
  recordVideoViewApi, 
  toggleLikeVideoApi, 
  toggleDislikeVideoApi, 
  getVideoLikeStatusApi, 
  toggleSubscriptionApi 
} from '../api/services';
import VideoPlayer from '../components/VideoPlayer';
import Comments from '../components/Comments';
import LiveChat from '../components/LiveChat';
import { useToast } from '../context/ToastContext';

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

export default function Video() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { showToast } = useToast();

  const [playbackUrl, setPlaybackUrl] = useState('');
  const [whepUrl, setWhepUrl] = useState('');
  const [title, setTitle] = useState('');
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  const dbVideos = useSelector((state: RootState) => state.app.videos);

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

  // New UI feature states
  const [isTheater, setIsTheater] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch related videos if dbVideos is empty
  useEffect(() => {
    if (dbVideos.length === 0) {
      api.get('/metadata/videos', { params: { limit: 20 } })
        .then((res) => {
          const list = Array.isArray(res.data) ? res.data : res.data.videos || [];
          dispatch(setVideos(list));
        })
        .catch((e) => console.error('Failed to load recommended videos', e));
    }
  }, [dbVideos.length, dispatch]);

  const recommendedVideos: DBVideo[] = useMemo(() => {
    return dbVideos
      .filter((v) => v.ID !== Number(id) && v.status === 'Done')
      .slice(0, 10);
  }, [dbVideos, id]);

  const fetchPlayback = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError('');
    try {
      const res = await api.get(`/metadata/videos/${id}/play`);
      setPlaybackUrl(res.data.playback_url);
      setWhepUrl(res.data.whep_url || '');
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
      setVideoStatus(res.data.status || 'Done');
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
  }, [id]);

  useEffect(() => {
    fetchPlayback();
  }, [fetchPlayback]);

  // Active status polling: runs when video is Live, waiting in processing pipeline, or after live disconnect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const shouldPoll = isPolling || (meta?.type === 'Live' && videoStatus !== 'Done') || ['Uploading', 'Uploaded', 'Processing'].includes(videoStatus);

    if (shouldPoll && id) {
      const checkStatus = async () => {
        try {
          const res = await api.get(`/metadata/videos/${id}/status`);
          const currentStatus = res.data.status;
          setVideoStatus(currentStatus);

          if (res.data.progress) {
            setProgress(res.data.progress);
          }
          if (res.data.title) {
            setTitle(res.data.title);
          }
          if (res.data.type && meta && meta.type !== res.data.type) {
            setMeta(prev => prev ? { ...prev, type: res.data.type } : null);
          }

          if (currentStatus === 'Done') {
            setIsPolling(false);
            showToast("Live stream has concluded and is now available as a full VOD replay!", "success");
            fetchPlayback(true);
          } else if (currentStatus === 'Failed') {
            setIsPolling(false);
            setError('Processing failed for this video recording.');
          }
        } catch (e) {
          console.error('Failed to poll video status', e);
        }
      };

      interval = setInterval(checkStatus, 3500);
    }
    return () => clearInterval(interval);
  }, [isPolling, meta?.type, videoStatus, id, fetchPlayback, showToast]);

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
    if (!isAuthenticated) {
      showToast("Please sign in to like this video.", "info");
      return;
    }
    if (!id) return;
    try {
      const res = await toggleLikeVideoApi(id);
      setVideoLiked(res.liked);
      setVideoDisliked(res.disliked);
      setLikesCount(res.likes_count);
      setDislikesCount(res.dislikes_count);
    } catch (e) {
      console.error("Failed to like video", e);
      showToast("Failed to update like status", "error");
    }
  };

  const handleDislikeVideo = async () => {
    if (!isAuthenticated) {
      showToast("Please sign in to dislike this video.", "info");
      return;
    }
    if (!id) return;
    try {
      const res = await toggleDislikeVideoApi(id);
      setVideoLiked(res.liked);
      setVideoDisliked(res.disliked);
      setLikesCount(res.likes_count);
      setDislikesCount(res.dislikes_count);
    } catch (e) {
      console.error("Failed to dislike video", e);
      showToast("Failed to update dislike status", "error");
    }
  };

  const handleSubscribe = async () => {
    if (!isAuthenticated) {
      showToast("Please sign in to subscribe.", "info");
      return;
    }
    if (!channel) return;
    try {
      const res = await toggleSubscriptionApi(channel.id);
      setIsSubscribed(res.subscribed);
      setChannel(prev => prev ? { ...prev, followers_count: (prev.followers_count || 0) + (res.subscribed ? 1 : -1) } : prev);
      showToast(res.subscribed ? `Subscribed to ${channel.display_name || channel.username}` : `Unsubscribed from ${channel.display_name || channel.username}`, 'success');
    } catch (e) {
      console.error("Failed to subscribe", e);
      showToast("Failed to update subscription", "error");
    }
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await api.delete(`/metadata/videos/${id}`);
      showToast("Video deleted successfully", "success");
      navigate('/');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to delete video', "error");
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  const handleCopyShareLink = () => {
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShareCopied(true);
      showToast("Video link copied to clipboard!", "success");
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {
      showToast("Failed to copy link", "error");
    });
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

  // Render player block
  const renderPlayer = () => (
    <div className={`w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl transition-all duration-300 ${isTheater ? 'max-h-[75vh]' : ''}`}>
      {loading ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-3 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
          <span className="text-zinc-500 text-sm font-medium">Loading player...</span>
        </div>
      ) : (error || (['Uploading', 'Uploaded'].includes(videoStatus)) || (videoStatus === 'Processing' && meta?.type !== 'Live') || (meta?.type === 'Live' && videoStatus && videoStatus !== 'Live')) ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
          {(['Uploading', 'Uploaded', 'Processing'].includes(videoStatus) || (meta?.type === 'Live' && videoStatus && videoStatus !== 'Live')) ? (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-6" />
              <h3 className="text-xl font-bold text-zinc-100 mb-2">Stream has ended</h3>
              <p className="text-zinc-400 text-sm mb-2 max-w-md">
                {videoStatus === 'Uploading' ? 'The broadcast recording is being packaged and uploaded to storage...' :
                 videoStatus === 'Uploaded' ? 'Queued in transcode pipeline for high-definition VOD processing...' :
                 'Transcoding recording into multi-resolution adaptive VOD replay...'}
              </p>
              {progress && (
                <div className="mt-2 text-xs font-mono text-emerald-400 bg-emerald-950/30 px-3 py-1.5 rounded-full border border-emerald-500/20">
                  {progress}
                </div>
              )}
              <span className="text-xs text-zinc-500 mt-4">The player will automatically load the full VOD replay once finished.</span>
              <div className="mt-8">
                <Link to="/" className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-sm rounded-xl transition-colors inline-flex items-center gap-2 border border-zinc-700">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                  Browse other streams
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center max-w-md">
              <div className="w-14 h-14 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
                <VideoIcon className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-zinc-100 mb-2">Playback Unavailable</h3>
              <p className="text-zinc-400 text-sm mb-6">{error}</p>
              <Link to="/" className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-xl transition-colors">
                Return to Home
              </Link>
            </div>
          )}
        </div>
      ) : (
        <VideoPlayer
          key={playbackUrl || 'player'}
          src={playbackUrl}
          whepUrl={whepUrl}
          mode={(meta?.type === 'Live' && videoStatus !== 'Done') ? 'live' : 'vod'}
          wasLive={meta?.type === 'Live' || title.includes('(VOD)')}
          isTheater={isTheater}
          onToggleTheater={() => setIsTheater(!isTheater)}
          onEnded={() => {
            if (meta?.type === 'Live') setIsPolling(true);
          }}
          onError={() => {
            if (meta?.type === 'Live') setIsPolling(true);
          }}
        />
      )}
    </div>
  );

  return (
    <div className={`mx-auto transition-all duration-300 ${isTheater ? 'max-w-screen-2xl' : 'max-w-7xl'}`}>
      
      {/* Theater Mode Top Player */}
      {isTheater && (
        <div className="mb-6">
          {renderPlayer()}
        </div>
      )}

      {/* Main Grid: Left details & comments, Right sidebar (Chat for Live, Up Next for VOD) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        
        {/* Main Content Column */}
        <div className="lg:col-span-2 xl:col-span-3 min-w-0 flex flex-col gap-4">
          
          {/* Normal Mode Video Player */}
          {!isTheater && renderPlayer()}

          {/* Video Metadata & Actions Bar */}
          <div className="flex flex-col gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 leading-snug">
              {title || 'Loading title...'}
            </h1>

            <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-zinc-800/80">
              
              {/* Creator Channel Badge */}
              <div className="flex items-center gap-3">
                {channel && (
                  <>
                    <Link to={`/channel/${channel.username}`} className="shrink-0">
                      {channel.avatar_url ? (
                        <img src={channel.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover bg-zinc-800 ring-2 ring-zinc-800 hover:ring-rose-500/50 transition-all" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center">
                          <UserIcon className="w-5 h-5 text-zinc-400" />
                        </div>
                      )}
                    </Link>
                    <div className="min-w-0">
                      <Link to={`/channel/${channel.username}`} className="text-sm font-bold text-white hover:text-rose-400 transition-colors truncate block">
                        {channel.display_name || channel.username}
                      </Link>
                      <span className="text-xs text-zinc-400">
                        {channel.followers_count ? formatCount(channel.followers_count) : '0'} subscribers
                      </span>
                    </div>
                    {!isOwner && (
                      <button
                        onClick={handleSubscribe}
                        className={`ml-3 px-4 py-2 text-xs font-bold rounded-full transition-all duration-200 cursor-pointer ${
                          isSubscribed 
                            ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700' 
                            : 'bg-white text-zinc-950 hover:bg-zinc-200 shadow-md'
                        }`}
                      >
                        {isSubscribed ? 'Subscribed' : 'Subscribe'}
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Action Buttons: Like / Dislike, Share, Delete */}
              <div className="flex items-center gap-2">
                
                {/* Like / Dislike Pill */}
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-full overflow-hidden">
                  <button 
                    onClick={handleLikeVideo}
                    className={`flex items-center gap-2 px-3.5 py-1.5 transition-colors cursor-pointer ${videoLiked ? 'bg-rose-500/15 text-rose-400' : 'hover:bg-zinc-800 text-zinc-300'}`}
                    title="I like this"
                  >
                    <ThumbsUp className={`w-4 h-4 ${videoLiked ? 'fill-current' : ''}`} />
                    <span className="text-xs font-semibold">{likesCount > 0 ? formatCount(likesCount) : ''}</span>
                  </button>
                  <div className="w-px h-5 bg-zinc-800" />
                  <button 
                    onClick={handleDislikeVideo}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors cursor-pointer ${videoDisliked ? 'bg-rose-500/15 text-rose-400' : 'hover:bg-zinc-800 text-zinc-300'}`}
                    title="I dislike this"
                  >
                    <ThumbsDown className={`w-4 h-4 ${videoDisliked ? 'fill-current' : ''}`} />
                    {dislikesCount > 0 && <span className="text-xs font-semibold">{formatCount(dislikesCount)}</span>}
                  </button>
                </div>

                {/* Share Button */}
                <button
                  onClick={() => setShowShareModal(true)}
                  className="flex items-center gap-2 px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-full text-xs font-semibold transition-colors cursor-pointer"
                  title="Share video"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>
                
                {/* Delete button — owner only */}
                {isOwner && !isLive && (
                  <button 
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="flex items-center justify-center p-2 bg-zinc-900 hover:bg-rose-500/20 border border-zinc-800 text-zinc-400 hover:text-rose-400 rounded-full transition-colors cursor-pointer"
                    title="Delete Video"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Collapsible Description Box */}
            <div 
              className="bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 cursor-pointer transition-colors"
              onClick={() => setDescExpanded(!descExpanded)}
            >
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-zinc-400" />
                  {formatViews(viewsCount)}
                </span>
                <span className="text-zinc-600">•</span>
                <span>{formatDate(meta?.created_at || '')}</span>
                {meta?.category && (
                  <>
                    <span className="text-zinc-600">•</span>
                    <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full text-[11px]">{meta.category}</span>
                  </>
                )}
                
                <span className="ml-auto flex items-center gap-1 text-zinc-400 hover:text-white">
                  {descExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </div>
              
              {descExpanded && (
                <div className="mt-3 space-y-3 pt-3 border-t border-zinc-800" onClick={e => e.stopPropagation()}>
                  {meta?.description && (
                    <p className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed">{meta.description}</p>
                  )}
                  
                  {meta?.tags && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {meta.tags.split(',').map(tag => tag.trim()).filter(Boolean).map((tag, i) => (
                        <span key={i} className="text-rose-400 hover:text-rose-300 text-xs font-medium cursor-pointer transition-colors bg-rose-500/10 px-2 py-0.5 rounded-md">
                          #{tag.replace(/^#/, '')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {!descExpanded && meta?.description && (
                <p className="text-zinc-400 text-sm mt-1.5 line-clamp-1">{meta.description}</p>
              )}
            </div>
          </div>

          {/* Comments Section (VOD mode only) */}
          {!isLive && channel && id && (
            <div className="mt-2">
              <Comments videoId={Number(id)} videoOwnerId={channel.id} />
            </div>
          )}
        </div>

        {/* Right Sidebar Column */}
        <div className="lg:col-span-1 min-w-0">
          {isLive && id ? (
            /* Live Chat Panel */
            <div className="sticky top-20">
              <LiveChat videoId={Number(id)} isOwner={Boolean(isOwner)} />
            </div>
          ) : (
            /* Up Next / Recommended Videos List for VOD */
            <div className="sticky top-20 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-1">
                <h3 className="font-bold text-zinc-200 text-sm tracking-wide">Up Next</h3>
                <span className="text-[11px] text-zinc-500 font-medium">Auto-play</span>
              </div>

              {recommendedVideos.length === 0 ? (
                <div className="p-6 bg-zinc-900/50 border border-zinc-800/50 rounded-xl text-center text-xs text-zinc-500">
                  No other videos currently available.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {recommendedVideos.map((rec) => (
                    <Link
                      key={rec.ID}
                      to={`/video/${rec.ID}`}
                      className="group flex gap-3 p-2 rounded-xl hover:bg-zinc-900 border border-transparent hover:border-zinc-800/80 transition-all cursor-pointer"
                    >
                      <div className="relative w-36 sm:w-40 aspect-video shrink-0 bg-zinc-900 rounded-lg overflow-hidden">
                        {rec.thumbnail_url ? (
                          <img src={rec.thumbnail_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-700 bg-zinc-800">
                            <VideoIcon className="w-6 h-6" />
                          </div>
                        )}
                        {rec.duration && (
                          <span className="absolute bottom-1 right-1 bg-black/85 text-[10px] font-bold px-1.5 py-0.5 rounded text-white backdrop-blur-xs">
                            {Math.floor(rec.duration / 60)}:{(rec.duration % 60).toString().padStart(2, '0')}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0 justify-start">
                        <h4 className="text-xs font-semibold text-zinc-200 line-clamp-2 leading-snug group-hover:text-rose-400 transition-colors">
                          {rec.title}
                        </h4>
                        <span className="text-[11px] text-zinc-400 mt-1 truncate">
                          {rec.User?.display_name || rec.User?.username}
                        </span>
                        <span className="text-[10px] text-zinc-500 mt-0.5">
                          {formatViews(rec.views || 0)} • {timeAgo(rec.CreatedAt)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Share Modal Dialog */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Share2 className="w-5 h-5 text-rose-500" /> Share Video
              </h3>
              <button 
                onClick={() => setShowShareModal(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-zinc-400 mb-4">
              Copy the link below to share this stream or video with others.
            </p>

            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl p-2.5">
              <input 
                type="text" 
                readOnly 
                value={window.location.href}
                className="flex-1 bg-transparent text-sm text-zinc-200 outline-none select-all font-mono"
              />
              <button
                onClick={handleCopyShareLink}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  shareCopied ? 'bg-emerald-600 text-white' : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {shareCopied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Delete Video</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Are you sure you want to delete <span className="text-white font-medium">"{title}"</span>? This will permanently delete the video and cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white font-medium rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-900/30"
              >
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
