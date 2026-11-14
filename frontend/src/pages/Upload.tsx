import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import api from '../api/axios';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  Image as ImageIcon, 
  Loader2, 
  X,
  Film
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../context/ToastContext';

export default function Upload() {
  const { showToast } = useToast();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [finalVideoId, setFinalVideoId] = useState<number | null>(null);
  
  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
    };
  }, [videoPreviewUrl, thumbnailPreviewUrl]);

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
            showToast('Video processing complete! Your video is live.', 'success');
            clearInterval(intervalId);
          } else if (videoStatus === 'Failed') {
            setStatus('error');
            setMessage('Video processing failed. Please try again.');
            showToast('Video processing failed. Please check your video format.', 'error');
            clearInterval(intervalId);
          } else if (videoStatus === 'Processing' && progressMsg) {
            setMessage(progressMsg);
          }
        } catch (err) {
          console.error("Failed to fetch video status during polling", err);
        }
      }, 3000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [status, finalVideoId, showToast]);

  const selectVideoFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      showToast('Please select a valid video file (MP4, WebM, MOV)', 'error');
      return;
    }

    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));

    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
    setStatus('idle');
    setMessage('');
    setUploadProgress(0);
    showToast(`Selected "${file.name}"`, 'info');
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      selectVideoFile(e.target.files[0]);
    }
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file', 'error');
        return;
      }
      if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
      setThumbnailFile(file);
      setThumbnailPreviewUrl(URL.createObjectURL(file));
      showToast('Thumbnail selected', 'info');
    }
  };

  // Drag and Drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (status === 'idle' || status === 'error') {
      setIsDragging(true);
    }
  }, [status]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (status !== 'idle' && status !== 'error') return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      selectVideoFile(e.dataTransfer.files[0]);
    }
  }, [status]);

  const handleRemoveVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoFile(null);
    setVideoPreviewUrl(null);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile || !title.trim()) return;

    setStatus('uploading');
    setUploadProgress(0);
    setMessage('Initializing upload presigned URL...');

    try {
      const initRes = await api.post('/upload/init', {
        title,
        description,
        filename: videoFile.name,
        contentType: videoFile.type || 'video/mp4',
        hasThumbnail: !!thumbnailFile,
        thumbnailContentType: thumbnailFile ? thumbnailFile.type : '',
        category,
        tags,
      });

      const { videoId, videoPresignedUrl, thumbnailPresignedUrl } = initRes.data;

      // Upload Thumbnail if provided
      if (thumbnailFile && thumbnailPresignedUrl) {
        setMessage('Uploading custom thumbnail...');
        await axios.put(thumbnailPresignedUrl, thumbnailFile, {
          headers: {
            'Content-Type': thumbnailFile.type,
          },
        });
      }

      // Upload Video file
      setMessage('Direct streaming to storage...');
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
      setMessage('Upload completed! Worker queue is now transcoding your video...');
      showToast('Upload finished! Transcoder has begun processing.', 'info');
      
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setMessage(err.response?.data?.error || err.message || 'An error occurred during upload.');
      showToast('Upload failed: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 sm:p-8 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl mt-6">
      <div className="flex items-center justify-between pb-6 border-b border-zinc-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
            <UploadCloud className="w-8 h-8 text-rose-500" />
            Upload Video
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Directly upload high-definition video to S3 storage with automated HLS transcoding.
          </p>
        </div>
      </div>

      <form onSubmit={handleUpload} className="space-y-6 mt-6">
        
        {/* Modern Video Dropzone with Instant Client Preview */}
        <div 
          onClick={() => (status === 'idle' || status === 'error') && !videoFile && videoInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-6 transition-all duration-200 overflow-hidden ${
            (status === 'uploading' || status === 'processing' || status === 'success') 
              ? 'opacity-60 cursor-not-allowed' 
              : videoFile ? 'border-rose-500/40 bg-zinc-950' : 'cursor-pointer hover:border-rose-500/60 bg-zinc-950/60'
          } ${isDragging ? 'border-rose-500 bg-rose-500/10 scale-[1.01]' : 'border-zinc-800'}`}
        >
          <input 
            type="file" 
            ref={videoInputRef}
            onChange={handleVideoChange}
            accept="video/*"
            className="hidden" 
            disabled={status === 'uploading' || status === 'processing' || status === 'success'}
          />

          {videoFile && videoPreviewUrl ? (
            /* Instant Video Player Preview Block */
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="relative w-full md:w-80 aspect-video rounded-xl overflow-hidden bg-black shadow-lg shrink-0 border border-zinc-800">
                <video 
                  src={videoPreviewUrl} 
                  controls 
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex-1 w-full flex flex-col justify-between py-1">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-rose-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Film className="w-4 h-4" /> Ready to Upload
                    </span>
                    {(status === 'idle' || status === 'error') && (
                      <button
                        type="button"
                        onClick={handleRemoveVideo}
                        className="text-zinc-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Remove video"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-white mt-1 break-all line-clamp-1">{videoFile.name}</h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
                    <span>{(videoFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                    <span>•</span>
                    <span>{videoFile.type || 'video/mp4'}</span>
                  </div>
                </div>

                {(status === 'idle' || status === 'error') && (
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="mt-4 self-start text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Choose Different Video
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Empty Dropzone State */
            <div className="text-center py-10 px-4">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4 text-rose-500 shadow-md">
                <UploadCloud className="w-8 h-8" />
              </div>
              <p className="text-base font-bold text-zinc-200">
                Drag and drop your video file here, or <span className="text-rose-500 underline">browse</span>
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Supports MP4, WebM, MOV, and MKV up to 2GB
              </p>
            </div>
          )}
        </div>

        {/* Video Metadata Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Title *</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={status === 'uploading' || status === 'processing' || status === 'success'}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors"
                placeholder="Catchy title for your video"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Description</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={status === 'uploading' || status === 'processing' || status === 'success'}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors min-h-28 resize-y"
                placeholder="Tell viewers what your video is about..."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">
                  Category <span className="text-zinc-600 normal-case">(Optional)</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={status === 'uploading' || status === 'processing' || status === 'success'}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors"
                >
                  <option value="">Select Category...</option>
                  <option value="Gaming">Gaming</option>
                  <option value="Music">Music</option>
                  <option value="Tech">Tech & Development</option>
                  <option value="Esports">Esports</option>
                  <option value="IRL">IRL & Chatting</option>
                  <option value="Creative">Creative Arts</option>
                  <option value="Education">Education</option>
                  <option value="Entertainment">Entertainment</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">
                  Tags <span className="text-zinc-600 normal-case">(Optional)</span>
                </label>
                <input 
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  disabled={status === 'uploading' || status === 'processing' || status === 'success'}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors"
                  placeholder="e.g. coding, tutorial, vlog"
                />
              </div>
            </div>
          </div>
          
          {/* Thumbnail Upload & Preview */}
          <div className="space-y-4">
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">
              Thumbnail <span className="text-zinc-600 normal-case">(Optional)</span>
            </label>
            <div 
              onClick={() => (status === 'idle' || status === 'error') && thumbnailInputRef.current?.click()}
              className={`border border-dashed rounded-xl aspect-video flex flex-col items-center justify-center relative overflow-hidden transition-colors ${
                (status === 'uploading' || status === 'processing' || status === 'success') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-zinc-600'
              } ${
                thumbnailPreviewUrl ? 'border-rose-500/50 bg-zinc-950' : 'border-zinc-800 bg-zinc-950/60'
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
              {thumbnailPreviewUrl ? (
                <>
                  <img src={thumbnailPreviewUrl} alt="Thumbnail Preview" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-white text-xs font-bold bg-black/70 px-3 py-1 rounded-full">Change Image</span>
                  </div>
                </>
              ) : (
                <div className="text-center p-4">
                  <ImageIcon className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-zinc-400 text-xs font-medium">Upload Custom Thumbnail</p>
                  <p className="text-zinc-600 text-[10px] mt-1">If blank, frame at 3s is extracted automatically</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress Bars */}
        {status === 'uploading' && (
          <div className="space-y-2 p-5 bg-zinc-950 border border-zinc-800 rounded-xl animate-in fade-in">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400 font-medium">{message}</span>
              <span className="text-rose-500 font-bold">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-linear-to-r from-rose-500 to-orange-500 h-2.5 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div className="p-4 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center gap-3 text-sky-400 animate-in fade-in">
            <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between gap-3 text-emerald-400 animate-in fade-in">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{message}</p>
            </div>
            {finalVideoId && (
              <Link to={`/video/${finalVideoId}`} className="text-sm font-bold underline hover:text-emerald-300">
                View Video Now →
              </Link>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!videoFile || !title.trim() || status === 'uploading' || status === 'processing' || status === 'success'}
          className="w-full py-4 px-6 bg-linear-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {status === 'uploading' 
            ? 'Uploading to S3...' 
            : status === 'processing' 
            ? 'Transcoding in Progress...' 
            : status === 'success' 
            ? 'Processing Finished!' 
            : 'Publish Video'}
        </button>
      </form>
    </div>
  );
}
