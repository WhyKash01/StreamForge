
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from './store/store';
import { logout } from './store/slices/authSlice';
import Home from './pages/Home';
import Video from './pages/Video';
import Login from './pages/Login';
import Register from './pages/Register';
import Upload from './pages/Upload';
import Live from './pages/Live';
import Channel from './pages/Channel';
import api from './api/axios';
import { User as UserIcon, Radio } from 'lucide-react';

function App() {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error(e);
    }
    dispatch(logout());
    navigate('/login');
  };



  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <nav className="flex justify-between items-center px-6 py-4 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800/60 sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-2xl font-bold bg-linear-to-r from-rose-500 to-orange-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity">
            StreamForge
          </Link>
        </div>
        <div>
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              
              <Link to={`/channel/${user?.username}`} className="flex items-center gap-2 text-zinc-300 hover:text-white transition-colors mr-1">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-zinc-700" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                    <UserIcon className="w-4 h-4 text-zinc-400" />
                  </div>
                )}
                <span className="text-sm font-medium hidden sm:block">{user?.display_name || user?.username}</span>
              </Link>



              <Link 
                to="/live" 
                className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors shadow-lg shadow-red-500/20"
              >
                <Radio className="w-3.5 h-3.5" />
                Go Live
              </Link>

              <Link to="/upload" className="px-4 py-1.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors border border-zinc-700">
                Upload
              </Link>
              <button 
                onClick={handleLogout} 
                className="px-4 py-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Link to="/login" className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors">
                Login
              </Link>
              <Link to="/register" className="px-4 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors shadow-lg shadow-rose-500/20">
                Register
              </Link>
            </div>
          )}
        </div>
      </nav>
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/video/:id" element={<Video />} />
          <Route path="/live" element={<Live />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/channel/:username" element={<Channel />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
