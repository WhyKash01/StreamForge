import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Check, FastForward, Tv, PictureInPicture2 } from 'lucide-react';

export type PlayerMode = 'live' | 'vod' | 'ended';
export type PlayerState = 'waiting' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

interface VideoPlayerProps {
  src: string;
  whepUrl?: string;
  mode: PlayerMode;
  autoPlay?: boolean;
  wasLive?: boolean;
  isTheater?: boolean;
  onToggleTheater?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
}

export default function VideoPlayer({ 
  src, 
  whepUrl, 
  mode, 
  autoPlay = true, 
  wasLive, 
  isTheater,
  onToggleTheater,
  onEnded, 
  onError 
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  // Streaming Protocol Mode (WebRTC for sub-second live, HLS for adaptive/fallback)
  const [activeProtocol, setActiveProtocol] = useState<'webrtc' | 'hls'>(mode === 'live' && whepUrl ? 'webrtc' : 'hls');

  // Update activeProtocol if whepUrl becomes available
  useEffect(() => {
    if (mode === 'live' && whepUrl) {
      setActiveProtocol('webrtc');
    } else {
      setActiveProtocol('hls');
    }
  }, [mode, whepUrl]);
  
  // Timers
  const retryTimeoutRef = useRef<number | null>(null);
  const controlsTimeoutRef = useRef<number | null>(null);
  const liveSyncIntervalRef = useRef<number | null>(null);

  // Player State
  const [playerState, setPlayerState] = useState<PlayerState>('loading');
  const [showUnmuteOverlay, setShowUnmuteOverlay] = useState(false);
  
  // Controls State
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isFallingBehind, setIsFallingBehind] = useState(false);
  
  // Quality State
  const [levels, setLevels] = useState<{ height: number; bitrate: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [showSettings, setShowSettings] = useState(false);

  // Format Time Helper
  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // --- WebRTC (WHEP) Initialization for Sub-Second Live Streaming ---
  useEffect(() => {
    if (activeProtocol !== 'webrtc' || !whepUrl || mode !== 'live' || !videoRef.current) return;
    const video = videoRef.current;
    let isDestroyed = false;

    const initWhep = async () => {
      try {
        setPlayerState('loading');
        if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
        }

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        pcRef.current = pc;

        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          if (!isDestroyed && video) {
            video.srcObject = event.streams[0];
            attemptPlay();
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setPlayerState('playing');
          } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            console.warn('[VideoPlayer] WebRTC connection failed/dropped, falling back to HLS');
            if (onError) onError('WebRTC connection dropped');
            if (!isDestroyed) setActiveProtocol('hls');
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const res = await fetch(whepUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: offer.sdp,
        });

        if (!res.ok) {
          throw new Error(`WHEP endpoint returned ${res.status}`);
        }

        const answerSdp = await res.text();
        if (!isDestroyed && pc.signalingState !== 'closed') {
          await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
        }
      } catch (err) {
        console.warn('[VideoPlayer] WebRTC WHEP connection error, falling back to HLS:', err);
        if (!isDestroyed) {
          setActiveProtocol('hls');
        }
      }
    };

    initWhep();

    return () => {
      isDestroyed = true;
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (video) {
        video.srcObject = null;
      }
    };
  }, [activeProtocol, whepUrl, mode]);

  // --- HLS & Network Initialization ---
  useEffect(() => {
    if (activeProtocol !== 'hls' || !src || !videoRef.current) return;
    const video = videoRef.current;
    let retryDelay = 2000;
    let isDestroyed = false;

    const initHls = () => {
      if (isDestroyed) return;

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          maxMaxBufferLength: 30,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 10,
        });
        hlsRef.current = hls;

        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          if (isDestroyed) return;
          setPlayerState('paused'); // Wait for play() to succeed
          
          const sortedLevels = [...data.levels].sort((a, b) => b.height - a.height);
          setLevels(sortedLevels.map(l => ({ height: l.height, bitrate: l.bitrate })));
          
          if (autoPlay) attemptPlay();
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (isDestroyed) return;
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.stopLoad();
              
              if (mode === 'vod') {
                // Hard error for VOD
                setPlayerState('error');
                if (onError) onError('Video not found or network error.');
              } else {
                // Live mode: Might be waiting for broadcast to start, or mid-stream disconnect
                if (video.readyState === 0 && video.currentTime === 0) {
                  // Bootup 404
                  setPlayerState('waiting');
                  retryTimeoutRef.current = setTimeout(() => {
                    retryDelay = Math.min(retryDelay * 1.5, 10000); // Exponential backoff up to 10s
                    initHls();
                  }, retryDelay);
                } else {
                  // Mid-stream stall. HLS.js will natively attempt to recover and reconnect.
                  // Notify parent to trigger status polling in case broadcast ended.
                  if (onError) onError('Live stream stalled');
                }
              }
            } else {
              setPlayerState('error');
              if (onError) onError('Playback Error: ' + data.type);
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native fallback
        video.src = src;
        if (autoPlay) attemptPlay();
      }
    };

    initHls();

    return () => {
      isDestroyed = true;
      if (hlsRef.current) hlsRef.current.destroy();
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (liveSyncIntervalRef.current) clearInterval(liveSyncIntervalRef.current);
    };
  }, [activeProtocol, src, mode, autoPlay, onError, onEnded]);

  // --- Autoplay Policy ---
  const attemptPlay = async () => {
    if (!videoRef.current) return;
    try {
      videoRef.current.muted = isMuted;
      await videoRef.current.play();
      setPlayerState('playing');
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        // Autoplay blocked. Fallback to muted.
        videoRef.current.muted = true;
        setIsMuted(true);
        setShowUnmuteOverlay(true);
        try {
          await videoRef.current.play();
          setPlayerState('playing');
        } catch (e) {
          console.error("Muted autoplay also failed", e);
        }
      }
    }
  };

  // --- Video Event Listeners ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlayerState('playing');
    const onPause = () => setPlayerState('paused');
    const onTimeUpdate = () => {
      if (!isScrubbing) setCurrentTime(video.currentTime);
    };
    const onDurationChange = () => setDuration(video.duration);
    const onEndedNative = () => {
      setPlayerState('ended');
      if (onEnded) onEnded();
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('ended', onEndedNative);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('ended', onEndedNative);
    };
  }, [isScrubbing, onEnded]);

  // --- Live Sync Tracker ---
  useEffect(() => {
    if (mode === 'live') {
      liveSyncIntervalRef.current = setInterval(() => {
        if (hlsRef.current && videoRef.current) {
          const liveSync = hlsRef.current.liveSyncPosition;
          if (liveSync !== null && liveSync - videoRef.current.currentTime > 5) {
            setIsFallingBehind(true);
          } else {
            setIsFallingBehind(false);
          }
        }
      }, 1000);
      return () => {
        if (liveSyncIntervalRef.current) clearInterval(liveSyncIntervalRef.current);
      }
    }
  }, [mode]);


  // --- Controls Handlers ---
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  const toggleMute = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current) return;
    const newMuted = !videoRef.current.muted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
    if (showUnmuteOverlay) setShowUnmuteOverlay(false);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const val = parseFloat(e.target.value);
    videoRef.current.volume = val;
    setVolume(val);
    if (val === 0) {
      videoRef.current.muted = true;
      setIsMuted(true);
    } else if (isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
      if (showUnmuteOverlay) setShowUnmuteOverlay(false);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(err => console.error(err));
    } else {
      await document.exitFullscreen();
    }
  };

  const jumpToLive = () => {
    if (!videoRef.current || !hlsRef.current || hlsRef.current.liveSyncPosition === null) return;
    videoRef.current.currentTime = hlsRef.current.liveSyncPosition;
    videoRef.current.play();
  };

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

  // --- Scrubber Interaction ---
  const scrubberRef = useRef<HTMLDivElement>(null);
  const handleScrubberChange = useCallback((clientX: number) => {
    if (!scrubberRef.current || !videoRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = pos * duration;
    setCurrentTime(newTime);
    videoRef.current.currentTime = newTime;
  }, [duration]);

  const onScrubberPointerDown = (e: React.PointerEvent) => {
    setIsScrubbing(true);
    handleScrubberChange(e.clientX);
    scrubberRef.current?.setPointerCapture(e.pointerId);
  };
  const onScrubberPointerMove = (e: React.PointerEvent) => {
    if (isScrubbing) handleScrubberChange(e.clientX);
  };
  const onScrubberPointerUp = (e: React.PointerEvent) => {
    if (isScrubbing) {
      setIsScrubbing(false);
      scrubberRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.error("Picture-in-Picture error:", err);
    }
  };

  // --- Keyboard & Mouse Inactivity ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) {
        return; // Ignore shortcuts when typing
      }
      
      switch(e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlay();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 't':
        case 'T':
          if (onToggleTheater) {
            e.preventDefault();
            onToggleTheater();
          }
          break;
        case 'j':
        case 'J':
          if (videoRef.current) {
            e.preventDefault();
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
            setCurrentTime(videoRef.current.currentTime);
          }
          break;
        case 'l':
        case 'L':
          if (videoRef.current) {
            e.preventDefault();
            videoRef.current.currentTime = Math.min(videoRef.current.duration || Infinity, videoRef.current.currentTime + 10);
            setCurrentTime(videoRef.current.currentTime);
          }
          break;
        case 'ArrowRight':
          if (videoRef.current) {
            e.preventDefault();
            videoRef.current.currentTime = Math.min(videoRef.current.duration || Infinity, videoRef.current.currentTime + 5);
            setCurrentTime(videoRef.current.currentTime);
          }
          break;
        case 'ArrowLeft':
          if (videoRef.current) {
            e.preventDefault();
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
            setCurrentTime(videoRef.current.currentTime);
          }
          break;
        case 'ArrowUp':
          if (videoRef.current) {
            e.preventDefault();
            const newVol = Math.min(1, Number((volume + 0.1).toFixed(2)));
            setVolume(newVol);
            videoRef.current.volume = newVol;
            if (isMuted) {
              setIsMuted(false);
              videoRef.current.muted = false;
            }
          }
          break;
        case 'ArrowDown':
          if (videoRef.current) {
            e.preventDefault();
            const newVol = Math.max(0, Number((volume - 0.1).toFixed(2)));
            setVolume(newVol);
            videoRef.current.volume = newVol;
          }
          break;
        default:
          if (/^[0-9]$/.test(e.key) && mode === 'vod' && duration > 0 && videoRef.current) {
            e.preventDefault();
            const target = (parseInt(e.key, 10) / 10) * duration;
            videoRef.current.currentTime = target;
            setCurrentTime(target);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, duration, volume, isMuted, onToggleTheater]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (playerState === 'playing') {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 2500);
    }
  };

  const handleMouseLeave = () => {
    if (playerState === 'playing') setShowControls(false);
    setShowSettings(false);
  };

  // --- Render Overlays ---
  const renderOverlay = () => {
    if (playerState === 'waiting') {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
          <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-4" />
          <h3 className="text-xl font-bold text-zinc-100">Stream starting soon</h3>
          <p className="text-sm text-zinc-400 mt-2">Waiting for broadcaster...</p>
        </div>
      );
    }
    if (playerState === 'loading') {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 pointer-events-none">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      );
    }
    if (showUnmuteOverlay) {
      return (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/20 z-20 cursor-pointer"
          onClick={(e) => {
             e.stopPropagation();
             toggleMute();
          }}
        >
          <div className="bg-black/70 backdrop-blur px-6 py-3 rounded-full flex items-center gap-3 text-white border border-white/10 hover:bg-black/80 transition-colors">
            <VolumeX className="w-5 h-5" />
            <span className="font-semibold tracking-wide uppercase text-sm">Click to Unmute</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative group bg-black overflow-hidden flex items-center justify-center"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={() => setShowSettings(false)}
    >
      <video 
        ref={videoRef}
        className="w-full h-full object-contain"
        controls={false}
        playsInline={true}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      />

      {renderOverlay()}

      {/* Control Bar */}
      <div 
        className={`absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/90 via-black/40 to-transparent pt-16 pb-4 px-4 transition-opacity duration-300 z-30 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {/* Scrubber */}
        {true && (
          <div className="w-full h-4 mb-2 group/scrubber cursor-pointer relative"
               ref={scrubberRef}
               onPointerDown={onScrubberPointerDown}
               onPointerMove={onScrubberPointerMove}
               onPointerUp={onScrubberPointerUp}
               onPointerCancel={onScrubberPointerUp}>
            <div className="absolute top-1.5 left-0 right-0 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-rose-500 rounded-full relative"
                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            {/* Scrubber Thumb */}
            <div 
              className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-lg shadow-black transition-transform ${isScrubbing ? 'scale-100' : 'scale-0 group-hover/scrubber:scale-100'}`}
              style={{ left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 7px)` }}
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <button onClick={togglePlay} className="text-white hover:text-rose-400 p-2 min-w-11 min-h-11 flex items-center justify-center transition-colors">
              {playerState === 'playing' ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
            </button>

            {/* Volume */}
            <div className="flex items-center group/vol">
              <button onClick={toggleMute} className="text-white hover:text-rose-400 p-2 min-w-11 min-h-11 flex items-center justify-center transition-colors">
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <div className="w-0 overflow-hidden group-hover/vol:w-24 transition-all duration-300 flex items-center origin-left">
                <input 
                  type="range" 
                  min="0" max="1" step="0.05" 
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1.5 accent-rose-500 bg-white/20 rounded-full outline-none cursor-pointer"
                />
              </div>
            </div>

            {/* Time / Live Badge */}
            <div className="ml-2 flex items-center gap-4 text-sm font-medium">
              {mode !== 'live' && (
                <span className="text-zinc-200">{formatTime(currentTime)} <span className="text-zinc-500 font-normal mx-1">/</span> {formatTime(duration)}</span>
              )}
              
              {mode === 'live' && (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={isFallingBehind ? jumpToLive : undefined}
                    className={`flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase transition-colors px-2 py-1 rounded-full ${isFallingBehind ? 'text-zinc-400 hover:bg-white/10 cursor-pointer' : 'text-rose-500 cursor-default'}`}
                  >
                    {isFallingBehind ? (
                      <FastForward className="w-3.5 h-3.5" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    )}
                    LIVE
                  </button>

                  <div className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-zinc-700/80 bg-zinc-900/90 shadow-sm">
                    {activeProtocol === 'webrtc' ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-emerald-400 font-bold">⚡ WebRTC (&lt;500ms)</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveProtocol('hls'); }}
                          className="text-zinc-400 hover:text-zinc-200 text-[10px] ml-1 underline cursor-pointer"
                          title="Switch to HLS adaptive"
                        >
                          HLS
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        <span className="text-zinc-300">📼 HLS</span>
                        {whepUrl && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveProtocol('webrtc'); }}
                            className="text-emerald-400 hover:text-emerald-300 text-[10px] ml-1 font-bold underline cursor-pointer"
                            title="Switch to ultra-low latency WebRTC"
                          >
                            ⚡ WebRTC
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
              {mode === 'ended' && (
                <div className="flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase text-zinc-500 px-2 py-1">
                  <span className="w-2 h-2 rounded-full bg-zinc-600" />
                  ENDED
                </div>
              )}
              {mode === 'vod' && wasLive && (
                <div className="flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase text-zinc-400 px-2.5 py-0.5 border border-zinc-700/60 rounded-full bg-zinc-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                  STREAM REPLAY
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Settings */}
            {Hls.isSupported() && levels.length > 0 && (
              <div className="relative">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSettings(!showSettings);
                  }}
                  className="text-white hover:text-rose-400 p-2 min-w-11 min-h-11 flex items-center justify-center transition-colors"
                >
                  <Settings className="w-5 h-5" />
                </button>
                
                {showSettings && (
                  <div 
                    className="absolute bottom-full right-0 mb-4 w-40 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden py-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                      Quality
                    </div>
                    <button 
                      onClick={() => handleLevelChange(-1)}
                      className={`w-full text-left px-4 py-2.5 min-h-11 text-sm flex items-center justify-between hover:bg-zinc-800 transition-colors ${currentLevel === -1 ? 'text-rose-500 font-medium' : 'text-zinc-300'}`}
                    >
                      Auto
                      {currentLevel === -1 && <Check className="w-4 h-4" />}
                    </button>
                    {levels.map((level, i) => (
                      <button 
                        key={i}
                        onClick={() => handleLevelChange(level.height)}
                        className={`w-full text-left px-4 py-2.5 min-h-11 text-sm flex items-center justify-between hover:bg-zinc-800 transition-colors ${currentLevel === level.height ? 'text-rose-500 font-medium' : 'text-zinc-300'}`}
                      >
                        {level.height}p
                        {currentLevel === level.height && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Theater Mode */}
            {onToggleTheater && (
              <button 
                onClick={onToggleTheater} 
                className={`p-2 min-w-11 min-h-11 flex items-center justify-center transition-colors cursor-pointer ${
                  isTheater ? 'text-rose-500' : 'text-white hover:text-rose-400'
                }`}
                title={isTheater ? "Default view (t)" : "Theater mode (t)"}
              >
                <Tv className="w-5 h-5" />
              </button>
            )}

            {/* Picture-in-Picture */}
            {typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled && (
              <button 
                onClick={togglePiP} 
                className="text-white hover:text-rose-400 p-2 min-w-11 min-h-11 flex items-center justify-center transition-colors cursor-pointer"
                title="Picture in Picture"
              >
                <PictureInPicture2 className="w-5 h-5" />
              </button>
            )}

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="text-white hover:text-rose-400 p-2 min-w-11 min-h-11 flex items-center justify-center transition-colors cursor-pointer" title="Fullscreen (f)">
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
