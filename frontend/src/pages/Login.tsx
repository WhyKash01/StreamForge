import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { setCredentials } from '../store/slices/authSlice';
import api from '../api/axios';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const response = await api.post('/auth/login', { email, password });
      dispatch(setCredentials({
        user: response.data.user,
        accessToken: response.data.access_token
      }));
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-8 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
      <h2 className="text-3xl font-bold text-white text-center mb-8 tracking-tight">Welcome Back</h2>
      
      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">Email Address</label>
          <input 
            type="email" 
            placeholder="you@example.com" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-shadow"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">Password</label>
          <input 
            type="password" 
            placeholder="••••••••" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-shadow"
          />
        </div>
        <button 
          type="submit" 
          disabled={loading}
          className="w-full mt-2 py-3 px-4 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-medium rounded-xl transition-colors shadow-lg shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Logging in...' : 'Sign In'}
        </button>
      </form>
      <p className="mt-8 text-center text-sm text-zinc-500">
        Don't have an account? <Link to="/register" className="text-rose-500 hover:text-rose-400 font-medium">Register here</Link>
      </p>
    </div>
  );
}
