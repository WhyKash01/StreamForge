import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Settings, Check } from 'lucide-react';

interface VideoPlayerProps {
  src: string;
  autoPlay?: boolean;
  controls?: boolean;
  onError?: (error: string) => void;
  onPlay?: () => void;
  onReady?: () => void;
}

export default function VideoPlayer({ src, autoPlay = true, controls = true, onError, onPlay, onReady, onEnded }: VideoPlayerProps & { onEnded?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  const [levels, setLevels] = useState<{ height: number; bitrate: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 is Auto
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!src || !videoRef.current) return;

    const video = videoRef.current;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxMaxBufferLength: 30,
      });
      hlsRef.current = hls;
      
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        // Sort levels by height descending
        const sortedLevels = [...data.levels].sort((a, b) => b.height - a.height);
        setLevels(sortedLevels.map(l => ({ height: l.height, bitrate: l.bitrate })));
        if (onReady) onReady();
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
           console.error("HLS Fatal Error:", data);
           if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
             // For network errors (like stream ended / 404 playlist), we do NOT immediately kill the player.
             // We want the user to watch the remaining 10 seconds of buffered video.
             // We will rely on the video's 'waiting' or 'ended' event to fire when the buffer empties.
             // Just stop recovering to prevent infinite error loops
             hls.stopLoad();
             
             // Setup a reliable check for when the buffer runs out
             const checkStalled = setInterval(() => {
                if (video.readyState <= 2 || video.paused || video.ended) { // 2 = HAVE_CURRENT_DATA (no future data)
                   clearInterval(checkStalled);
                   if (onError) onError('Stream has ended.');
                }
             }, 500);
           } else {
             if (onError) onError('Playback Error: ' + data.type);
           }
        }
      });

      return () => {
        hls.destroy();
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Fallback for native Safari
      video.src = src;
    }
  }, [src, onError]);

  const handleLevelChange = (height: number) => {
    if (hlsRef.current) {
      if (height === -1) {
        hlsRef.current.currentLevel = -1;
        setCurrentLevel(-1);
      } else {
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
    <>
      <video 
        ref={videoRef}
        className="w-full h-full object-contain"
        controls={controls}
        autoPlay={autoPlay}
        onPlay={onPlay}
        onEnded={onEnded}
      />

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
  );
}
