import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    
    try {
      await api.post('/auth/register', { 
        email, 
        password,
        username,
        display_name: displayName
      });
      setSuccess('Registration successful! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-8 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
      <h2 className="text-3xl font-bold text-white text-center mb-8 tracking-tight">Create Account</h2>
      
      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 p-4 bg-emerald-900/30 border border-emerald-500/50 rounded-lg text-emerald-200 text-sm">
          {success}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">Username <span className="text-zinc-600">(Channel URL)</span></label>
          <input 
            type="text" 
            placeholder="e.g. john_doe" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            required
            pattern="[a-zA-Z0-9_]+"
            title="Only alphanumeric characters and underscores are allowed"
            minLength={3}
            maxLength={20}
            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-shadow"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">Display Name <span className="text-zinc-600">(Optional)</span></label>
          <input 
            type="text" 
            placeholder="e.g. John Doe" 
            value={displayName} 
            onChange={(e) => setDisplayName(e.target.value)} 
            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-shadow"
          />
        </div>
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
            placeholder="Min 6 characters" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            minLength={6}
            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-shadow"
          />
        </div>
        <button 
          type="submit" 
          disabled={loading || !!success}
          className="w-full mt-2 py-3 px-4 bg-white hover:bg-zinc-200 active:bg-zinc-300 text-black font-semibold rounded-xl transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating account...' : 'Register'}
        </button>
      </form>
      <p className="mt-8 text-center text-sm text-zinc-500">
        Already have an account? <Link to="/login" className="text-white hover:text-zinc-300 font-medium transition-colors">Login here</Link>
      </p>
    </div>
  );
}
