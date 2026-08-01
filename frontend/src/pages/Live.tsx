import { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
import { Radio, Users, Copy, CheckCircle2, Image as ImageIcon, Settings } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store/store';
import { updateLiveSettings } from '../store/slices/authSlice';
import api from '../api/axios';
import axios from 'axios';

// Workaround for strict typescript rejecting ReactPlayer's props
const Player = ReactPlayer as any;

export default function Live() {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();

  const streamPath = user?.stream_key || 'demo';
  const hlsUrl = `http://localhost:8888/${streamPath}/stream.m3u8`;
  const rtmpUrl = `rtmp://localhost:1935/${streamPath}`;

  const [copied, setCopied] = useState(false);
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [retryCount, setRetryCount] = useState(0);
  
  // Stream Settings State
  const [title, setTitle] = useState(user?.live_title || '');
  const [description, setDescription] = useState(user?.live_description || '');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [dbStatus, setDbStatus] = useState<string>('Offline');

  // Poll the backend for the actual database status of the live stream
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const checkStatus = async () => {
      try {
        const res = await api.get('/live/status');
        setDbStatus(res.data.status);
      } catch (e) {
        console.error(e);
      }
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Update local state if Redux user state changes (e.g., initial load)
  useEffect(() => {
    if (user && !title && user.live_title) {
      setTitle(user.live_title);
      setDescription(user.live_description || '');
    }
  }, [user]);

  const handleCopy = () => {
    navigator.clipboard.writeText(rtmpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setThumbnailFile(e.target.files[0]);
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
      }));

      setSaveMessage('Settings saved! Ready to stream.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err: any) {
      console.error(err);
      setSaveMessage(`Failed: ${err.response?.data?.error || err.message}`);
      setTimeout(() => setSaveMessage(''), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 text-zinc-100 flex flex-col xl:flex-row gap-8 mt-4">

      {/* Left Column: Video Player */}
      <div className="flex-1 space-y-6">
        <div className="bg-zinc-950 rounded-2xl overflow-hidden shadow-xl border border-zinc-800">
          <div className="aspect-video bg-black relative flex items-center justify-center group overflow-hidden">
            
            {streamStatus === 'offline' && dbStatus === 'Uploading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-10 border border-rose-500/20 shadow-[inset_0_0_50px_rgba(244,63,94,0.1)]">
                <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-6"></div>
                <h3 className="text-xl font-bold text-rose-500 mb-2">Stream Ended</h3>
                <p className="text-zinc-400 text-sm mb-2">Wrapping up the broadcast...</p>
                <div className="bg-zinc-900 px-4 py-2 rounded-full border border-zinc-800 flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-zinc-300 text-xs font-medium tracking-wide">UPLOADING RECORDING TO VOD</span>
                </div>
              </div>
            )}

            {streamStatus === 'offline' && dbStatus !== 'Uploading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-10">
                <Radio className="w-12 h-12 text-zinc-700 mb-4" />
                <h3 className="text-xl font-bold text-zinc-300 mb-2">Stream Offline</h3>
                <p className="text-zinc-500 text-sm mb-6">The broadcast has ended or is not currently active.</p>
                <button 
                  onClick={() => {
                    setStreamStatus('connecting');
                    setRetryCount(c => c + 1);
                  }}
                  className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm rounded-lg transition-colors border border-zinc-700"
                >
                  Retry Connection
                </button>
              </div>
            )}

            <Player
              key={retryCount}
              url={`${hlsUrl}?retry=${retryCount}`}
              playing
              controls
              muted={false}
              volume={1}
              width="100%"
              height="100%"
              onReady={() => setStreamStatus('live')}
              onPlay={() => setStreamStatus('live')}
              onError={(e: any) => {
                console.log('Player error:', e);
                setStreamStatus('offline');
              }}
              fallback={<div className="text-zinc-500">Connecting to stream...</div>}
            />
          </div>

          <div className="p-6 bg-zinc-900 border-t border-zinc-800">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.7)]"></span>
                  {user?.live_title || 'StreamForge Live Demo'}
                </h1>
                <p className="text-zinc-400">{user?.live_description || 'Broadcasting live in full quality.'}</p>
              </div>
              <div className="flex items-center gap-2 bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg border border-red-500/20">
                <Users className="w-4 h-4" />
                <span className="font-semibold text-sm">42 Watching</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Settings & Broadcast Info */}
      <div className="w-full xl:w-100 space-y-6">
        
        {/* Stream Settings Form */}
        {isAuthenticated && (
          <form onSubmit={handleSaveSettings} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl flex flex-col gap-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-zinc-200">
              <Settings className="w-5 h-5" />
              Stream Settings
            </h2>
            
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Stream Title *</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors"
                placeholder="What are you streaming?"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Description</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors min-h-20 resize-y"
                placeholder="Details about this stream..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Thumbnail</label>
              <div 
                onClick={() => !isSaving && thumbnailInputRef.current?.click()}
                className={`border border-dashed rounded-lg h-32 flex flex-col items-center justify-center relative overflow-hidden transition-colors ${
                  isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-zinc-500'
                } ${
                  thumbnailFile || user?.live_thumbnail_url ? 'border-rose-500/50 bg-zinc-950' : 'border-zinc-700 bg-zinc-950/50'
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
                    <img src={URL.createObjectURL(thumbnailFile)} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-50" />
                    <ImageIcon className="w-6 h-6 text-white relative z-10 drop-shadow-md" />
                    <span className="text-white text-xs mt-1 relative z-10 font-medium drop-shadow-md bg-black/50 px-2 py-0.5 rounded">Change</span>
                  </>
                ) : user?.live_thumbnail_url ? (
                   <>
                    <img src={user.live_thumbnail_url} alt="Current" className="absolute inset-0 w-full h-full object-cover opacity-50" />
                    <ImageIcon className="w-6 h-6 text-white relative z-10 drop-shadow-md" />
                    <span className="text-white text-xs mt-1 relative z-10 font-medium drop-shadow-md bg-black/50 px-2 py-0.5 rounded">Change</span>
                  </>
                ) : (
                  <div className="text-center p-2">
                    <ImageIcon className="w-6 h-6 text-zinc-600 mx-auto mb-1" />
                    <p className="text-zinc-500 text-xs mt-1">Optional (Auto if empty)</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs font-medium ${saveMessage.includes('Failed') ? 'text-red-400' : 'text-emerald-400'}`}>
                {saveMessage}
              </span>
              <button
                type="submit"
                disabled={isSaving || !title.trim()}
                className="py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm rounded-lg transition-all disabled:opacity-50"
              >
                Save Settings
              </button>
            </div>
          </form>
        )}

        {/* RTMP Server Info */}
        {isAuthenticated && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-rose-400">
              <Radio className="w-5 h-5" />
              Broadcast URL
            </h2>
            <p className="text-sm text-zinc-400 mb-4">
              To broadcast to this page, set up OBS Studio with the following URL:
            </p>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Server / Stream URL</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={rtmpUrl}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 font-mono focus:outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700"
                  title="Copy to clipboard"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
                </button>
              </div>
            </div>

            <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-300/80">
              <strong>Note:</strong> Set your title and thumbnail <em>before</em> starting your stream in OBS!
            </div>
          </div>
        )}

        {!isAuthenticated && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl text-center">
            <Radio className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-2 text-zinc-200">Want to broadcast?</h2>
            <p className="text-sm text-zinc-500 mb-4">Log in to get your stream key and start broadcasting live!</p>
          </div>
        )}
      </div>

    </div>
  );
}
