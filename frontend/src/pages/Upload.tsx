import { useState, useRef } from 'react';
import axios from 'axios';
import api from '../api/axios';
import { UploadCloud, FileVideo, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus('idle');
      setMessage('');
      setUploadProgress(0);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setStatus('uploading');
    setUploadProgress(0);
    setMessage('');

    try {
      // Pre-Signed URL flow
      // 1. Get pre-signed URL from backend
        const presignRes = await api.get('/upload/presigned', {
          params: {
            filename: file.name,
            contentType: file.type || 'video/mp4',
          },
        });

        const { presignedUrl } = presignRes.data;

        // 2. Upload directly to MinIO/S3 using the pre-signed URL
        await axios.put(presignedUrl, file, {
          headers: {
            'Content-Type': file.type || 'video/mp4',
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(percentCompleted);
            }
          },
        });

      setStatus('success');
      setMessage('Video uploaded successfully to MinIO!');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setMessage(err.response?.data?.error || err.message || 'An error occurred during upload.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl mt-10">
      <h1 className="text-3xl font-bold text-zinc-100 mb-6 flex items-center gap-3">
        <UploadCloud className="w-8 h-8 text-rose-500" />
        Upload Video
      </h1>

      <div className="space-y-6">
        {/* File Dropzone */}
        <div 
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors ${
            file ? 'border-rose-500/50 bg-rose-500/5' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-950/50'
          }`}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="video/*"
            className="hidden" 
          />
          
          {file ? (
            <div className="text-center">
              <FileVideo className="w-12 h-12 text-rose-500 mx-auto mb-3" />
              <p className="text-zinc-200 font-medium">{file.name}</p>
              <p className="text-zinc-500 text-sm mt-1">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div className="text-center">
              <UploadCloud className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium">Click to select a video file</p>
              <p className="text-zinc-500 text-sm mt-1">MP4, WebM, or OGG up to 2GB</p>
            </div>
          )}
        </div>

        {/* Upload Progress */}
        {status === 'uploading' && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Uploading...</span>
              <span className="text-rose-500 font-medium">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-rose-500 to-orange-500 h-2.5 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Status Messages */}
        {status === 'success' && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleUpload}
          disabled={!file || status === 'uploading'}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-semibold rounded-xl shadow-lg shadow-rose-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'uploading' ? 'Uploading...' : 'Upload Video'}
        </button>
      </div>
    </div>
  );
}
