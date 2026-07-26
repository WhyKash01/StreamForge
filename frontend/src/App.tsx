import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from './store/store';
import { logout } from './store/slices/authSlice';
import Home from './pages/Home';
import Video from './pages/Video';
import Login from './pages/Login';
import Register from './pages/Register';
import api from './api/axios';
import './App.css';

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
    <div className="app-container">
      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', background: '#222', color: 'white' }}>
        <Link to="/" style={{ color: 'white', textDecoration: 'none' }}>
          <h2>StreamForge</h2>
        </Link>
        <div>
          {isAuthenticated ? (
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
              <span>Welcome, {user?.email}</span>
              <button onClick={handleLogout} style={{ cursor: 'pointer' }}>Logout</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '15px' }}>
              <Link to="/login" style={{ color: 'white' }}>Login</Link>
              <Link to="/register" style={{ color: 'white' }}>Register</Link>
            </div>
          )}
        </div>
      </nav>
      <main style={{ padding: '20px' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/video/:id" element={<Video />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
