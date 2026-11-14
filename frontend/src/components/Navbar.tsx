import { Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Search, Menu, Upload, User as UserIcon, LogOut, LayoutDashboard } from 'lucide-react';
import type { RootState } from '../store/store';
import { logout } from '../store/slices/authSlice';
import api from '../api/axios';
import { useState } from 'react';

export default function Navbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error(e);
    }
    dispatch(logout());
    setDropdownOpen(false);
    navigate('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/');
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 flex justify-between items-center px-4 bg-zinc-950 border-b border-zinc-800 z-50">
      <div className="flex items-center gap-4">
        <button onClick={onMenuClick} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
          <Menu className="w-6 h-6 text-zinc-100" />
        </button>
        <Link to="/" className="text-xl font-bold bg-linear-to-r from-rose-500 to-orange-500 bg-clip-text text-transparent hidden sm:block">
          StreamForge
        </Link>
      </div>

      <form onSubmit={handleSearch} className="flex-1 max-w-xl px-4 hidden md:flex">
        <div className="flex w-full bg-zinc-900 border border-zinc-800 rounded-full overflow-hidden focus-within:border-zinc-700 transition-colors">
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent px-4 py-2 text-zinc-100 placeholder-zinc-400 focus:outline-none"
          />
          <button type="submit" className="px-5 bg-zinc-800/50 hover:bg-zinc-800 transition-colors flex items-center justify-center border-l border-zinc-800">
            <Search className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
      </form>

      <div className="flex items-center gap-2 sm:gap-4">
        {isAuthenticated ? (
          <>
            <Link to="/studio" className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-300" title="Create">
              <Upload className="w-5 h-5" />
            </Link>

            <div className="relative">
              <button onClick={() => setDropdownOpen(!dropdownOpen)} className="flex items-center">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-zinc-700" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                    <UserIcon className="w-4 h-4 text-zinc-400" />
                  </div>
                )}
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden py-2 text-sm z-50">
                  <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt="Avatar" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-zinc-400" />
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-zinc-100">{user?.display_name || user?.username}</div>
                      <div className="text-zinc-400">@{user?.username}</div>
                    </div>
                  </div>
                  
                  <Link to={`/channel/${user?.username}`} onClick={() => setDropdownOpen(false)} className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 transition-colors text-zinc-200">
                    <UserIcon className="w-4 h-4" />
                    Your channel
                  </Link>
                  <Link to="/studio" onClick={() => setDropdownOpen(false)} className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 transition-colors text-zinc-200">
                    <LayoutDashboard className="w-4 h-4" />
                    StreamForge Studio
                  </Link>
                  <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 transition-colors text-zinc-200 text-left">
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Link to="/login" className="px-3 sm:px-4 py-1.5 text-sm font-medium text-zinc-300 hover:text-white transition-colors">
              Log in
            </Link>
            <Link to="/register" className="px-3 sm:px-4 py-1.5 text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-full transition-colors shadow-lg shadow-rose-500/20">
              Sign up
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
