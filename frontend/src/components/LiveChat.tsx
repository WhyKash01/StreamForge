import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Send, Users, ShieldAlert, ArrowDown, Radio, ChevronDown, Smile } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RootState } from '../store/store';

const QUICK_EMOJIS = ['🔥', '👏', '❤️', '🎮', '🚀', '😂', '👋', '🎉'];

interface ChatMessage {
  type: string;
  video_id: number;
  user_id?: number;
  username: string;
  avatar_url?: string;
  content?: string;
  created_at: string;
  count?: number;
  history?: ChatMessage[];
}

interface LiveChatProps {
  videoId: number;
  isOwner?: boolean;
  channelOwnerId?: number;
}

export default function LiveChat({ videoId, isOwner, channelOwnerId }: LiveChatProps) {
  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [viewerCount, setViewerCount] = useState<number>(1);
  const [isConnected, setIsConnected] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Auto-scroll logic
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
      setIsScrolledUp(false);
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setIsScrolledUp(!isAtBottom);
  };

  useEffect(() => {
    let unmounted = false;

    const connectWebSocket = () => {
      if (unmounted) return;

      let wsUrl: string;
      const apiUrl = import.meta.env.VITE_API_URL;
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

      if (apiUrl) {
        const wsBase = apiUrl.replace(/^http/, 'ws');
        wsUrl = `${wsBase}/live/${videoId}/ws${tokenParam}`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.port === '5173' ? 'localhost:8080' : window.location.host;
        wsUrl = `${protocol}//${host}/api/live/${videoId}/ws${tokenParam}`;
      }

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setIsConnected(true);
        console.log('[LiveChat] Connected to WebSocket hub for video:', videoId);
      };

      ws.onmessage = (event) => {
        if (unmounted) return;
        try {
          const payload: ChatMessage = JSON.parse(event.data);

          if (payload.type === 'history' && payload.history) {
            setMessages(payload.history);
            setTimeout(() => scrollToBottom(false), 50);
          } else if (payload.type === 'chat') {
            setMessages((prev) => [...prev, payload]);
            if (!isScrolledUp) {
              setTimeout(() => scrollToBottom(true), 50);
            }
          } else if (payload.type === 'viewer_count' && typeof payload.count === 'number') {
            setViewerCount(payload.count);
          } else if (payload.type === 'error' && payload.content) {
            setErrorToast(payload.content);
            setTimeout(() => setErrorToast(null), 3000);
          }
        } catch (e) {
          console.error('[LiveChat] Failed to parse message', e);
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setIsConnected(false);
        reconnectTimeoutRef.current = window.setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (err) => {
        console.warn('[LiveChat] WebSocket error:', err);
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [videoId]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    socketRef.current.send(JSON.stringify({ content: trimmed }));
    setInputText('');
    setShowEmojiPicker(false);
  };

  const handleAddEmoji = (emoji: string) => {
    setInputText((prev) => (prev ? `${prev} ${emoji}` : emoji));
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isCollapsed) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-rose-500 animate-pulse" />
          <span className="text-xs font-bold text-zinc-200">Live Chat</span>
          <span className="text-[11px] text-zinc-500 font-medium">({viewerCount} watching)</span>
        </div>
        <button
          onClick={() => setIsCollapsed(false)}
          className="text-xs font-bold px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors cursor-pointer"
        >
          Show Chat
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[560px] bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/90 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-rose-500 animate-pulse" />
          <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Live Chat</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-800/80 px-2.5 py-1 rounded-full border border-zinc-700/60 font-medium">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400 font-bold">{viewerCount}</span>
            <span className="hidden sm:inline">watching</span>
          </div>
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-amber-500 animate-ping'}`}
            title={isConnected ? 'Connected' : 'Connecting...'}
          />
          <button
            onClick={() => setIsCollapsed(true)}
            className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-zinc-800 transition-colors cursor-pointer ml-1"
            title="Hide chat"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 text-xs px-4">
            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center mb-2 text-zinc-400">
              💬
            </div>
            <span>Welcome to the stream chat! Say hello and join the conversation.</span>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isStreamer = Boolean((channelOwnerId && msg.user_id === channelOwnerId) || (isOwner && msg.user_id === user?.id));
            const isSelf = user && msg.user_id === user.id;

            return (
              <div key={i} className="flex items-start gap-2.5 text-xs group">
                {msg.avatar_url ? (
                  <img
                    src={msg.avatar_url}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5 border border-zinc-700"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-400 shrink-0 mt-0.5">
                    {msg.username ? msg.username.charAt(0).toUpperCase() : '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1 leading-relaxed">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span
                      className={`font-semibold truncate ${
                        isStreamer
                          ? 'text-rose-400 font-bold'
                          : isSelf
                          ? 'text-indigo-400 font-medium'
                          : 'text-zinc-300'
                      }`}
                    >
                      {msg.username}
                    </span>
                    {isStreamer && (
                      <span className="text-[9px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1 py-0.2 rounded font-bold uppercase tracking-wider">
                        Streamer
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500 select-none">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <p className="text-zinc-200 break-words mt-0.5 select-text">
                    {msg.content}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* "New Messages Below" Pill */}
      {isScrolledUp && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800/95 hover:bg-zinc-700 text-zinc-200 text-xs px-3 py-1.5 rounded-full shadow-lg border border-zinc-700 flex items-center gap-1.5 transition-all animate-bounce z-10 cursor-pointer"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>New messages below</span>
        </button>
      )}

      {/* Error / Rate Limit Toast */}
      {errorToast && (
        <div className="mx-3 mb-2 px-3 py-1.5 bg-rose-950/80 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-center gap-2 animate-fade-in shrink-0">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
          <span className="truncate">{errorToast}</span>
        </div>
      )}

      {/* Quick Reactions Bar */}
      {isAuthenticated && showEmojiPicker && (
        <div className="px-3 py-2 bg-zinc-950/95 border-t border-zinc-800/80 flex items-center gap-1.5 overflow-x-auto shrink-0 animate-in fade-in">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleAddEmoji(emoji)}
              className="text-base p-1.5 hover:bg-zinc-800 rounded-lg transition-transform hover:scale-125 cursor-pointer shrink-0"
              title={`Add ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input Form */}
      <div className="p-3 bg-zinc-950/90 border-t border-zinc-800 shrink-0">
        {isAuthenticated ? (
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                showEmojiPicker ? 'bg-zinc-800 text-rose-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
              title="Quick emojis"
            >
              <Smile className="w-4 h-4" />
            </button>
            <div className="relative flex-1">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                maxLength={500}
                placeholder="Send a message in live chat..."
                className="w-full bg-zinc-900 text-zinc-100 placeholder-zinc-500 text-xs rounded-xl px-3.5 py-2.5 pr-12 border border-zinc-800 focus:outline-none focus:border-rose-500 transition-colors"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 select-none">
                {inputText.length > 0 ? `${inputText.length}/500` : ''}
              </span>
            </div>
            <button
              type="submit"
              disabled={!inputText.trim() || !isConnected}
              className="p-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white rounded-xl transition-all shrink-0 cursor-pointer disabled:cursor-not-allowed shadow-xs"
              title="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <div className="text-center py-1">
            <p className="text-xs text-zinc-400 mb-2">Sign in to join the live chat</p>
            <Link
              to="/login"
              className="inline-block px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold rounded-lg border border-zinc-700 transition-colors"
            >
              Log In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
