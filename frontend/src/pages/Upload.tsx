import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import api from '../api/axios';
import { UploadCloud, FileVideo, CheckCircle2, AlertCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Upload() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [finalVideoId, setFinalVideoId] = useState<number | null>(null);
  
  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // Poll video status during processing phase
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    
    if (status === 'processing' && finalVideoId) {
      intervalId = setInterval(async () => {
        try {
          const res = await api.get(`/metadata/videos/${finalVideoId}/status`);
          const videoStatus = res.data.status;
          const progressMsg = res.data.progress;
          
          if (videoStatus === 'Done') {
            setStatus('success');
            setMessage('Processing complete! Your video is now live.');
            clearInterval(intervalId);
          } else if (videoStatus === 'Failed') {
            setStatus('error');
            setMessage('Video processing failed. Please try again.');
            clearInterval(intervalId);
          } else if (videoStatus === 'Processing' && progressMsg) {
            setMessage(progressMsg);
          }
        } catch (err) {
          console.error("Failed to fetch video status during polling", err);
        }
      }, 3000); // Check every 3 seconds
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [status, finalVideoId]);

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setVideoFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
      setStatus('idle');
      setMessage('');
      setUploadProgress(0);
    }
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setThumbnailFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile || !title.trim()) return;

    setStatus('uploading');
    setUploadProgress(0);
    setMessage('Initializing upload...');

    try {
      const initRes = await api.post('/upload/init', {
        title,
        description,
        filename: videoFile.name,
        contentType: videoFile.type || 'video/mp4',
        hasThumbnail: !!thumbnailFile,
        thumbnailContentType: thumbnailFile ? thumbnailFile.type : '',
      });

      const { videoId, videoPresignedUrl, thumbnailPresignedUrl } = initRes.data;

      if (thumbnailFile && thumbnailPresignedUrl) {
        setMessage('Uploading thumbnail...');
        await axios.put(thumbnailPresignedUrl, thumbnailFile, {
          headers: {
            'Content-Type': thumbnailFile.type,
          },
        });
      }

      setMessage('Uploading video...');
      await axios.put(videoPresignedUrl, videoFile, {
        headers: {
          'Content-Type': videoFile.type || 'video/mp4',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        },
      });

      setFinalVideoId(videoId);
      setStatus('processing');
      setMessage('Upload finished! Processing and transcoding your video...');
      
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setMessage(err.response?.data?.error || err.message || 'An error occurred during upload.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl mt-10">
      <h1 className="text-3xl font-bold text-zinc-100 mb-6 flex items-center gap-3">
        <UploadCloud className="w-8 h-8 text-rose-500" />
        Upload Video
      </h1>

      <form onSubmit={handleUpload} className="space-y-6">
        
        {/* Video Dropzone */}
        <div 
          onClick={() => (status === 'idle' || status === 'error') && videoInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors ${
            (status === 'uploading' || status === 'processing' || status === 'success') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          } ${
            videoFile ? 'border-rose-500/50 bg-rose-500/5' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-950/50'
          }`}
        >
          <input 
            type="file" 
            ref={videoInputRef}
            onChange={handleVideoChange}
            accept="video/*"
            className="hidden" 
            disabled={status === 'uploading' || status === 'processing' || status === 'success'}
          />
          
          {videoFile ? (
            <div className="text-center">
              <FileVideo className="w-12 h-12 text-rose-500 mx-auto mb-3" />
              <p className="text-zinc-200 font-medium">{videoFile.name}</p>
              <p className="text-zinc-500 text-sm mt-1">
                {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div className="text-center">
              <UploadCloud className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium">Click to select a video file</p>
              <p className="text-zinc-500 text-sm mt-1">Required • MP4, WebM, or OGG up to 2GB</p>
            </div>
          )}
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Title *</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={status === 'uploading' || status === 'processing' || status === 'success'}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors"
                placeholder="Catchy title for your video"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={status === 'uploading' || status === 'processing' || status === 'success'}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors min-h-30 resize-y"
                placeholder="Tell viewers about your video..."
              />
            </div>
          </div>
          
          {/* Thumbnail Upload */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-zinc-400 mb-1">Thumbnail</label>
            <div 
              onClick={() => (status === 'idle' || status === 'error') && thumbnailInputRef.current?.click()}
              className={`border border-dashed rounded-xl aspect-video flex flex-col items-center justify-center relative overflow-hidden transition-colors ${
                (status === 'uploading' || status === 'processing' || status === 'success') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-zinc-500'
              } ${
                thumbnailFile ? 'border-rose-500/50 bg-zinc-950' : 'border-zinc-700 bg-zinc-950/50'
              }`}
            >
              <input 
                type="file" 
                ref={thumbnailInputRef}
                onChange={handleThumbnailChange}
                accept="image/jpeg, image/png, image/webp"
                className="hidden" 
                disabled={status === 'uploading' || status === 'processing' || status === 'success'}
              />
              {thumbnailFile ? (
                <>
                  <img src={URL.createObjectURL(thumbnailFile)} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-50" />
                  <ImageIcon className="w-8 h-8 text-white relative z-10 drop-shadow-md" />
                  <span className="text-white text-xs mt-2 relative z-10 font-medium drop-shadow-md bg-black/50 px-2 py-1 rounded">Change Image</span>
                </>
              ) : (
                <div className="text-center p-4">
                  <ImageIcon className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-zinc-400 text-sm">Upload Thumbnail</p>
                  <p className="text-zinc-600 text-xs mt-1">Optional (Auto-generated if empty)</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Upload & Processing Progress */}
        {status === 'uploading' && (
          <div className="space-y-2 p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">{message}</span>
              <span className="text-rose-500 font-medium">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-linear-to-r from-rose-500 to-orange-500 h-2.5 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center gap-3 text-blue-400">
            <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

        {/* Status Messages */}
        {status === 'success' && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between gap-3 text-emerald-400">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{message}</p>
            </div>
            {finalVideoId && (
              <Link to={`/video/${finalVideoId}`} className="text-sm font-bold underline hover:text-emerald-300">
                View Video
              </Link>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

        {/* Action Button */}
        <button
          type="submit"
          disabled={!videoFile || !title.trim() || status === 'uploading' || status === 'processing' || status === 'success'}
          className="w-full py-3.5 px-4 bg-linear-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-semibold rounded-xl shadow-lg shadow-rose-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'uploading' ? 'Uploading...' : status === 'processing' ? 'Processing...' : status === 'success' ? 'Finished!' : 'Upload Video'}
        </button>
      </form>
    </div>
  );
}
