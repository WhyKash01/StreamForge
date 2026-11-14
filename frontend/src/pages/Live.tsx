import { useState, useRef, useEffect } from 'react';
import { 
  Radio, 
  Copy, 
  Check, 
  Image as ImageIcon, 
  Settings, 
  Eye,
  EyeOff,
  Activity,
  Play
} from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import type { RootState } from '../store/store';
import { updateLiveSettings } from '../store/slices/authSlice';
import api from '../api/axios';
import axios from 'axios';
import { useToast } from '../context/ToastContext';

export default function Live() {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const { showToast } = useToast();

  const streamPath = user?.stream_key || '';
  const rtmpServerUrl = `rtmp://localhost:1935/live`;

  const [serverCopied, setServerCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  
  // Stream Settings State
  const [title, setTitle] = useState(user?.live_title || '');
  const [description, setDescription] = useState(user?.live_description || '');
  const [category, setCategory] = useState(user?.live_category || '');
  const [tags, setTags] = useState(user?.live_tags || '');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [dbStatus, setDbStatus] = useState<string>('Offline');
  const [liveVideoId, setLiveVideoId] = useState<number | null>(null);

  // Poll the backend for the actual database status of the live stream
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const checkStatus = async () => {
      try {
        const res = await api.get('/live/status');
        setDbStatus(res.data.status);
        if (res.data.video_id) {
          setLiveVideoId(res.data.video_id);
        }
      } catch (e) {
        console.error(e);
      }
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Update local state if Redux user state changes
  useEffect(() => {
    if (user && !title && user.live_title) {
      setTitle(user.live_title);
      setDescription(user.live_description || '');
      setCategory(user.live_category || '');
      setTags(user.live_tags || '');
    }
  }, [user, title]);

  const handleCopyServer = () => {
    navigator.clipboard.writeText(rtmpServerUrl);
    setServerCopied(true);
    showToast('RTMP Server URL copied to clipboard!', 'success');
    setTimeout(() => setServerCopied(false), 2000);
  };
  
  const handleCopyKey = () => {
    navigator.clipboard.writeText(streamPath);
    setKeyCopied(true);
    showToast('Stream Key copied to clipboard! Keep it private.', 'success');
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setThumbnailFile(e.target.files[0]);
      showToast('Live stream poster selected', 'info');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    setSaveMessage('Saving...');

    try {
      const res = await api.post('/live/settings', {
        title,
        description,
        hasThumbnail: !!thumbnailFile,
        thumbnailContentType: thumbnailFile ? thumbnailFile.type : '',
        category,
        tags,
      });

      const { thumbnailPresignedUrl, thumbnailUrl } = res.data;

      if (thumbnailFile && thumbnailPresignedUrl) {
        setSaveMessage('Uploading thumbnail...');
        await axios.put(thumbnailPresignedUrl, thumbnailFile, {
          headers: {
            'Content-Type': thumbnailFile.type,
          },
        });
      }

      dispatch(updateLiveSettings({
        live_title: title,
        live_description: description,
        live_thumbnail_url: thumbnailUrl,
        live_category: category,
        live_tags: tags,
      }));

      setSaveMessage('Settings saved!');
      showToast('Live stream settings updated successfully!', 'success');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err: any) {
      console.error(err);
      const errText = err.response?.data?.error || err.message || 'Failed to save settings';
      setSaveMessage(`Failed: ${errText}`);
      showToast(errText, 'error');
      setTimeout(() => setSaveMessage(''), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  // Status badge styling
  const getStatusBadge = () => {
    switch (dbStatus) {
      case 'Live':
        return (
          <div className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 border border-rose-500/30 rounded-xl">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
            </span>
            <span className="text-sm font-bold text-rose-400">BROADCASTING LIVE</span>
          </div>
        );
      case 'Uploading':
        return (
          <div className="flex items-center gap-2 px-4 py-2 bg-sky-500/10 border border-sky-500/30 rounded-xl">
            <div className="w-3 h-3 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
            <span className="text-sm font-semibold text-sky-400">Archiving Stream...</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl">
            <span className="w-3 h-3 rounded-full bg-zinc-600" />
            <span className="text-sm font-medium text-zinc-400">Offline</span>
          </div>
        );
    }
  };

  // Unauthenticated view
  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto text-center mt-20">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 shadow-2xl">
          <Radio className="w-14 h-14 text-zinc-700 mx-auto mb-5" />
          <h1 className="text-2xl font-bold text-white mb-3">Go Live on StreamForge</h1>
          <p className="text-zinc-400 text-sm mb-8 max-w-sm mx-auto">
            Log in to access your stream dashboard, get your broadcast credentials, and start streaming.
          </p>
          <Link 
            to="/login"
            className="inline-block px-8 py-3 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-rose-500/20"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto mt-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-1">Streamer Studio Dashboard</h1>
          <p className="text-zinc-400 text-xs sm:text-sm">Configure broadcast metadata, ingest with OBS Studio, and monitor your live stream.</p>
        </div>
        {getStatusBadge()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Left Column: Stream Settings (3/5) */}
        <form onSubmit={handleSaveSettings} className="lg:col-span-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-5">
          <h2 className="text-base font-bold flex items-center gap-2 text-zinc-200">
            <Settings className="w-4 h-4 text-zinc-400" />
            Live Broadcast Metadata
          </h2>
          
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Stream Title *</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors"
              placeholder="What are you streaming today?"
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Description</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors min-h-24 resize-y"
              placeholder="Tell your viewers what to expect..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">
                Category <span className="text-zinc-600 normal-case">(Optional)</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors"
              >
                <option value="">Select Category...</option>
                <option value="Gaming">Gaming</option>
                <option value="Music">Music</option>
                <option value="Tech">Tech & Development</option>
                <option value="Esports">Esports</option>
                <option value="IRL">IRL & Chatting</option>
                <option value="Creative">Creative Arts</option>
                <option value="Education">Education</option>
                <option value="Entertainment">Entertainment</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">
                Tags <span className="text-zinc-600 normal-case">(Optional)</span>
              </label>
              <input 
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors"
                placeholder="e.g. ranked, speedrun, chill"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Stream Poster Thumbnail</label>
            <div 
              onClick={() => !isSaving && thumbnailInputRef.current?.click()}
              className={`border border-dashed rounded-xl h-36 flex flex-col items-center justify-center relative overflow-hidden transition-colors ${
                isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-zinc-500'
              } ${
                thumbnailFile || user?.live_thumbnail_url ? 'border-rose-500/50 bg-zinc-950' : 'border-zinc-800 bg-zinc-950/60'
              }`}
            >
              <input 
                type="file" 
                ref={thumbnailInputRef}
                onChange={handleThumbnailChange}
                accept="image/jpeg, image/png, image/webp"
                className="hidden" 
                disabled={isSaving}
              />
              
              {thumbnailFile ? (
                <>
                  <img src={URL.createObjectURL(thumbnailFile)} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                  <ImageIcon className="w-6 h-6 text-white relative z-10 drop-shadow-md" />
                  <span className="text-white text-xs mt-1 relative z-10 font-bold drop-shadow-md bg-black/60 px-3 py-1 rounded-full">Change Poster</span>
                </>
              ) : user?.live_thumbnail_url ? (
                 <>
                  <img src={user.live_thumbnail_url} alt="Current" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                  <ImageIcon className="w-6 h-6 text-white relative z-10 drop-shadow-md" />
                  <span className="text-white text-xs mt-1 relative z-10 font-bold drop-shadow-md bg-black/60 px-3 py-1 rounded-full">Change Poster</span>
                </>
              ) : (
                <div className="text-center p-3">
                  <ImageIcon className="w-7 h-7 text-zinc-600 mx-auto mb-1.5" />
                  <p className="text-zinc-300 text-xs font-medium">Click to upload poster image</p>
                  <p className="text-zinc-600 text-[10px] mt-0.5">Displayed on home feed and video player preview</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className={`text-xs font-medium ${saveMessage.includes('Failed') ? 'text-rose-400' : 'text-emerald-400'}`}>
              {saveMessage}
            </span>
            <button
              type="submit"
              disabled={isSaving || !title.trim()}
              className="py-2.5 px-6 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-rose-600/20 cursor-pointer"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>

        {/* Right Column: Credentials & Live Monitor (2/5) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* In-Studio Live Monitor Card */}
          {dbStatus === 'Live' && liveVideoId ? (
            <div className="bg-rose-950/20 border border-rose-500/40 rounded-2xl p-6 shadow-xl animate-in fade-in">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4 h-4 animate-pulse" /> Live Stream Active
                </span>
                <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  MediaMTX Ingest OK
                </span>
              </div>
              <p className="text-sm text-zinc-300 font-semibold mb-3">
                Your stream is live on StreamForge with sub-500ms WebRTC & HLS delivery.
              </p>
              <Link
                to={`/video/${liveVideoId}`}
                className="flex items-center justify-center gap-2 w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-rose-600/30"
              >
                <Play className="w-4 h-4 fill-current" />
                Open Live Player & Chat
              </Link>
            </div>
          ) : null}

          {/* Broadcast Credentials */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-bold mb-4 flex items-center gap-2 text-zinc-200">
              <Radio className="w-4 h-4 text-rose-500" />
              Broadcast Credentials (OBS / vMix)
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Server Ingest URL</label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type="text"
                    readOnly
                    value={rtmpServerUrl}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-300 font-mono focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyServer}
                    className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors border border-zinc-700 shrink-0 cursor-pointer"
                    title="Copy server URL"
                  >
                    {serverCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Stream Key</label>
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 cursor-pointer"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showKey ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type={showKey ? 'text' : 'password'}
                    readOnly
                    value={streamPath}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-300 font-mono focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors border border-zinc-700 shrink-0 cursor-pointer"
                    title="Copy stream key"
                  >
                    {keyCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 p-3.5 bg-rose-500/5 border border-rose-500/15 rounded-xl text-xs text-zinc-400 leading-relaxed">
              <strong className="text-rose-400">Pro-Tip:</strong> In OBS Settings &rarr; Stream, set Service to <span className="text-white font-mono">Custom</span>, paste Server and Stream Key, and click <span className="text-white font-semibold">Start Streaming</span>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
