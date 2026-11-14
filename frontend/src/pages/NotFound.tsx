import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Home, Radio, LayoutDashboard, Search, Compass } from 'lucide-react';

export default function NotFound() {
  const [searchVal, setSearchVal] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      navigate(`/?q=${encodeURIComponent(searchVal.trim())}`);
    }
  };

  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center text-center px-4 py-12">
      {/* Glow Graphic Badge */}
      <div className="relative mb-6">
        <div className="absolute -inset-4 bg-rose-600/20 rounded-full blur-2xl" />
        <div className="relative w-24 h-24 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-2xl">
          <Compass className="w-12 h-12 text-rose-500 animate-spin-slow" />
        </div>
      </div>

      <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-rose-500 via-orange-400 to-amber-300 bg-clip-text text-transparent">
        404
      </h1>
      
      <h2 className="text-xl sm:text-2xl font-bold text-white mt-3 mb-2">
        Lost in the Stream?
      </h2>
      
      <p className="text-zinc-400 text-sm max-w-md mx-auto leading-relaxed mb-8">
        The video, stream, or channel you are looking for doesn't exist, has ended, or was moved.
      </p>

      {/* Embedded Quick Search Form */}
      <form onSubmit={handleSearch} className="w-full max-w-md mb-8">
        <div className="flex bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden focus-within:border-zinc-700 transition-colors shadow-lg">
          <input
            type="text"
            placeholder="Search videos, creators, or streams..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            className="flex-1 bg-transparent px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <button
            type="submit"
            className="px-5 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 transition-colors flex items-center justify-center cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Quick Action Links */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-sm font-bold shadow-md transition-all hover:scale-105"
        >
          <Home className="w-4 h-4" />
          Return Home
        </Link>
        <Link
          to="/?filter=live"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-sm font-semibold transition-all hover:scale-105"
        >
          <Radio className="w-4 h-4 text-rose-500" />
          Live Streams
        </Link>
        <Link
          to="/studio"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-sm font-semibold transition-all hover:scale-105"
        >
          <LayoutDashboard className="w-4 h-4 text-amber-400" />
          Creator Studio
        </Link>
      </div>
    </div>
  );
}
