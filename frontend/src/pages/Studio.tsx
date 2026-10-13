import { useState } from 'react';
import { UploadCloud, Settings, Radio } from 'lucide-react';
import Upload from './Upload';
import Live from './Live';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store/store';
import { updateUserProfileApi, uploadImageToS3 } from '../api/services';
import { updateUserProfile } from '../store/slices/authSlice';

export default function Studio() {
  const [activeTab, setActiveTab] = useState<'upload' | 'customization' | 'live'>('upload');

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Studio Sidebar */}
      <div className="w-64 border-r border-zinc-800 pr-4 hidden md:block">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4 px-3">Studio Menu</h2>
        <div className="space-y-1">
          <button
            onClick={() => setActiveTab('upload')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              activeTab === 'upload' ? 'bg-zinc-800 text-rose-500' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            }`}
          >
            <UploadCloud className="w-5 h-5" />
            Upload Video
          </button>
          <button
            onClick={() => setActiveTab('live')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              activeTab === 'live' ? 'bg-zinc-800 text-rose-500' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            }`}
          >
            <Radio className="w-5 h-5" />
            Go Live
          </button>
          <button
            onClick={() => setActiveTab('customization')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              activeTab === 'customization' ? 'bg-zinc-800 text-rose-500' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            }`}
          >
            <Settings className="w-5 h-5" />
            Customization
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pl-0 md:pl-8 flex flex-col">
        
        {/* Mobile Navigation Tabs */}
        <div className="md:hidden flex items-center gap-2 mb-6 border-b border-zinc-800 pb-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'upload' ? 'bg-zinc-800 text-rose-500' : 'text-zinc-400'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span className="text-sm font-medium">Upload</span>
          </button>
          <button
            onClick={() => setActiveTab('live')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'live' ? 'bg-zinc-800 text-rose-500' : 'text-zinc-400'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span className="text-sm font-medium">Live</span>
          </button>
          <button
            onClick={() => setActiveTab('customization')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'customization' ? 'bg-zinc-800 text-rose-500' : 'text-zinc-400'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="text-sm font-medium">Customize</span>
          </button>
        </div>
        {activeTab === 'upload' && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">Channel content</h1>
              <p className="text-zinc-400 text-sm mt-1">Upload and manage your videos.</p>
            </div>
            {/* Reusing the existing Upload component, but it has its own padding/margin. We might need to adjust it later, but it works as is. */}
            <div className="-mt-10">
              <Upload />
            </div>
          </div>
        )}

        {activeTab === 'live' && (
          <div className="-mt-10 md:-mt-4">
            <Live />
          </div>
        )}

        {activeTab === 'customization' && (
          <CustomizationTab />
        )}
      </div>
    </div>
  );
}

function CustomizationTab() {
  const user = useSelector((state: RootState) => state.auth.user);
  const dispatch = useDispatch();

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const handleSave = async () => {
    setStatus('saving');
    try {
      let finalAvatarUrl = user?.avatar_url;
      let finalBannerUrl = user?.banner_url;

      if (avatarFile) {
        finalAvatarUrl = await uploadImageToS3(avatarFile, 'avatar');
      }
      if (bannerFile) {
        finalBannerUrl = await uploadImageToS3(bannerFile, 'banner');
      }

      await updateUserProfileApi({
        display_name: displayName,
        bio: bio,
        avatar_url: finalAvatarUrl,
        banner_url: finalBannerUrl,
      });

      dispatch(updateUserProfile({
        display_name: displayName,
        bio: bio,
        avatar_url: finalAvatarUrl,
        banner_url: finalBannerUrl,
      }));

      setStatus('success');
      setAvatarFile(null);
      setBannerFile(null);
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-white">Channel customization</h1>
          <p className="text-zinc-400 text-sm mt-1">Update your profile picture, banner image, and basic info.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-full font-medium transition-colors disabled:opacity-50"
        >
          {status === 'saving' ? 'Publishing...' : 'Publish'}
        </button>
      </div>

      {status === 'success' && (
        <div className="mb-6 p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm font-medium">
          Changes published successfully!
        </div>
      )}

      {status === 'error' && (
        <div className="mb-6 p-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm font-medium">
          Failed to publish changes. Please try again.
        </div>
      )}

      <div className="space-y-10 border border-zinc-800 bg-zinc-900 rounded-xl p-8">
        
        {/* Banner Section */}
        <section>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">Banner image</h3>
          <p className="text-sm text-zinc-400 mb-4">This image will appear across the top of your channel.</p>
          
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="w-full sm:w-64 h-32 bg-zinc-950 rounded-lg border border-zinc-700 relative overflow-hidden flex shrink-0">
              {bannerFile ? (
                <img src={URL.createObjectURL(bannerFile)} className="w-full h-full object-cover" alt="Banner Preview" />
              ) : user?.banner_url ? (
                <img src={user.banner_url} className="w-full h-full object-cover" alt="Current Banner" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 font-medium">No Banner</div>
              )}
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-3">For the best results on all devices, use an image that's at least 2048 x 1152 pixels and 6MB or less.</p>
              <label className="text-sm font-medium text-rose-400 cursor-pointer hover:text-rose-300">
                Change
                <input type="file" accept="image/png, image/jpeg, image/webp" className="hidden" onChange={(e) => setBannerFile(e.target.files?.[0] || null)} />
              </label>
            </div>
          </div>
        </section>

        <hr className="border-zinc-800" />

        {/* Picture Section */}
        <section>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">Picture</h3>
          <p className="text-sm text-zinc-400 mb-4">Your profile picture will appear where your channel is presented on StreamForge, like next to your videos and comments.</p>
          
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="w-24 h-24 bg-zinc-950 rounded-full border border-zinc-700 relative overflow-hidden shrink-0">
              {avatarFile ? (
                <img src={URL.createObjectURL(avatarFile)} className="w-full h-full object-cover" alt="Avatar Preview" />
              ) : user?.avatar_url ? (
                <img src={user.avatar_url} className="w-full h-full object-cover" alt="Current Avatar" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 font-medium">No Avatar</div>
              )}
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-3">It's recommended to use a picture that's at least 98 x 98 pixels and 4MB or less. Use a PNG or GIF (no animations) file.</p>
              <label className="text-sm font-medium text-rose-400 cursor-pointer hover:text-rose-300">
                Change
                <input type="file" accept="image/png, image/jpeg, image/webp" className="hidden" onChange={(e) => setAvatarFile(e.target.files?.[0] || null)} />
              </label>
            </div>
          </div>
        </section>

        <hr className="border-zinc-800" />

        {/* Basic Info */}
        <section className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Name</label>
            <p className="text-xs text-zinc-500 mb-2">Choose a channel name that represents you and your content.</p>
            <input 
              type="text" 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full max-w-md bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Description</label>
            <p className="text-xs text-zinc-500 mb-2">Tell viewers about your channel. Your description will appear in the About section of your channel.</p>
            <textarea 
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-rose-500 transition-colors min-h-30 resize-y"
            />
          </div>
        </section>

      </div>
    </div>
  );
}
