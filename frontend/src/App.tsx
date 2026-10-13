import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from './store/store';
import { updateUserProfile } from './store/slices/authSlice';
import Home from './pages/Home';
import Video from './pages/Video';
import Login from './pages/Login';
import Register from './pages/Register';
import Studio from './pages/Studio';
import Live from './pages/Live';
import Channel from './pages/Channel';
import Subscriptions from './pages/Subscriptions';
import api from './api/axios';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import { useState } from 'react';

function App() {
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();

  useEffect(() => {
    // Sync the latest user profile on app load if authenticated
    if (isAuthenticated) {
      api.get('/auth/me')
        .then(res => {
          if (res.data && res.data.user) {
            dispatch(updateUserProfile(res.data.user));
          }
        })
        .catch(err => {
          console.error("Failed to sync user profile", err);
        });
    }
  }, [isAuthenticated, dispatch]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 font-sans">
      <Navbar onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />
      
      <div className="flex flex-1 pt-16">
        <Sidebar isOpen={isSidebarOpen} />
        
        <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-60' : 'ml-0 sm:ml-20'}`}>
          <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/video/:id" element={<Video />} />
              <Route path="/live" element={<Live />} />
              <Route path="/studio" element={<Studio />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/channel/:username" element={<Channel />} />
              <Route path="/subscriptions" element={<Subscriptions />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
