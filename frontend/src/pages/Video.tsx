import { useParams, Link } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import Hls from 'hls.js';
import api from '../api/axios';
import { Settings, Check } from 'lucide-react';

export default function Video() {
  const { id } = useParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [levels, setLevels] = useState<{ height: number; bitrate: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 is Auto
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const fetchPlayback = async () => {
      try {
        const res = await api.get(`/metadata/videos/${id}/play`);
        setPlaybackUrl(res.data.playback_url);
        setTitle(res.data.title);
      } catch (err: any) {
        console.error('Failed to fetch playback info', err);
        setError(err.response?.data?.error || 'Failed to load video');
      } finally {
        setLoading(false);
      }
    };

    fetchPlayback();
  }, [id]);

  useEffect(() => {
    if (!playbackUrl || !videoRef.current) return;

    const video = videoRef.current;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxMaxBufferLength: 30, // Keeps memory low while buffering aggressively
      });
      hlsRef.current = hls;
      
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        // Sort levels by height descending so 1080p is at the top of the list
        const sortedLevels = [...data.levels].sort((a, b) => b.height - a.height);
        setLevels(sortedLevels.map(l => ({ height: l.height, bitrate: l.bitrate })));
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
           console.error("HLS Fatal Error:", data);
           setError('HLS Error: ' + data.type);
        }
      });

      return () => {
        hls.destroy();
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Fallback for native Safari
      video.src = playbackUrl;
    }
  }, [playbackUrl]);

  const handleLevelChange = (height: number) => {
    if (hlsRef.current) {
      if (height === -1) {
        hlsRef.current.currentLevel = -1; // Auto
        setCurrentLevel(-1);
      } else {
        // Find the index of the level in hls.levels (not our sorted array)
        const index = hlsRef.current.levels.findIndex(l => l.height === height);
        if (index !== -1) {
          hlsRef.current.currentLevel = index;
          setCurrentLevel(height);
        }
      }
      setShowSettings(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <Link to="/" className="inline-flex items-center text-zinc-400 hover:text-white transition-colors w-fit group">
        <svg className="w-5 h-5 mr-2 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16l-4-4m0 0l4-4m-4 4h18" /></svg>
        Back to Home
      </Link>
      
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-2xl">
        <div className="aspect-video bg-black flex items-center justify-center relative group">
          {loading ? (
            <div className="text-zinc-500 animate-pulse font-medium">Loading Player...</div>
          ) : error ? (
            <div className="text-rose-500 flex flex-col items-center gap-2">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span>{error}</span>
            </div>
          ) : (
            <>
              <video 
                ref={videoRef}
                className="w-full h-full object-contain"
                controls
                autoPlay
                muted
              />

              {/* Custom Quality Selector Overlay */}
              {Hls.isSupported() && levels.length > 0 && (
                <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="relative">
                    <button 
                      onClick={() => setShowSettings(!showSettings)}
                      className="bg-black/60 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-sm transition-colors border border-white/10"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                    
                    {showSettings && (
                      <div className="absolute right-0 mt-2 w-40 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden py-1">
                        <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                          Quality
                        </div>
                        <button 
                          onClick={() => handleLevelChange(-1)}
                          className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-zinc-800 transition-colors ${currentLevel === -1 ? 'text-rose-500 font-medium' : 'text-zinc-300'}`}
                        >
                          Auto
                          {currentLevel === -1 && <Check className="w-4 h-4" />}
                        </button>
                        {levels.map((level, i) => (
                          <button 
                            key={i}
                            onClick={() => handleLevelChange(level.height)}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-zinc-800 transition-colors ${currentLevel === level.height ? 'text-rose-500 font-medium' : 'text-zinc-300'}`}
                          >
                            {level.height}p
                            {currentLevel === level.height && <Check className="w-4 h-4" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            {loading ? 'Loading...' : title}
          </h2>
          <div className="flex items-center gap-4 text-sm text-zinc-400 mb-6">
            <span>Now Streaming</span>
            <span>•</span>
            <span className="text-rose-500 font-medium">HLS Video Quality</span>
          </div>
          <div className="bg-zinc-800/50 p-4 rounded-lg">
            <p className="text-zinc-300">
              Powered by StreamForge's custom Go Transcoder and MinIO Edge Delivery. The player dynamically adjusts resolution based on your available bandwidth.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
