import { useState } from 'react';
import ReactPlayer from 'react-player';
import { Radio, Users, Copy, CheckCircle2 } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';

// Workaround for strict typescript rejecting ReactPlayer's props
const Player = ReactPlayer as any;

export default function Live() {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);

  // In a real app, this stream ID would come from the URL params or a live stream list endpoint.
  // For this demo, we'll assume the stream path is 'demo'
  const streamPath = 'demo';
  const hlsUrl = `http://localhost:8888/${streamPath}/stream.m3u8`;
  const rtmpUrl = `rtmp://localhost:1935/${streamPath}`;

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(rtmpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 text-zinc-100 flex flex-col lg:flex-row gap-8 mt-4">

      {/* Left Column: Video Player */}
      <div className="flex-1 space-y-6">
        <div className="bg-zinc-950 rounded-2xl overflow-hidden shadow-xl border border-zinc-800">
          <div className="aspect-video bg-black relative flex items-center justify-center group">
            <Player
              url={hlsUrl}
              playing
              controls
              width="100%"
              height="100%"
              fallback={<div className="text-zinc-500">Connecting to stream...</div>}
            />
          </div>

          <div className="p-6 bg-zinc-900 border-t border-zinc-800">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.7)]"></span>
                  StreamForge Live Demo
                </h1>
                <p className="text-zinc-400">Broadcasting live in full quality.</p>
              </div>
              <div className="flex items-center gap-2 bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg border border-red-500/20">
                <Users className="w-4 h-4" />
                <span className="font-semibold text-sm">42 Watching</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Broadcast Info */}
      <div className="w-full lg:w-80 space-y-6">
        {isAuthenticated && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-rose-400">
              <Radio className="w-5 h-5" />
              Broadcast This Stream
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
              <strong>Note:</strong> When you stop streaming, the recording will automatically be processed and uploaded to the VOD section!
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
