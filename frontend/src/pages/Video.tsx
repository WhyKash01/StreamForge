import { useParams, Link } from 'react-router-dom';

export default function Video() {
  const { id } = useParams();

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <Link to="/" className="inline-flex items-center text-zinc-400 hover:text-white transition-colors w-fit group">
        <svg className="w-5 h-5 mr-2 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16l-4-4m0 0l4-4m-4 4h18" /></svg>
        Back to Home
      </Link>
      
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-2xl">
        <div className="aspect-video bg-black flex items-center justify-center relative">
          {/* Fake Player UI */}
          <div className="absolute inset-0 flex flex-col justify-end opacity-0 hover:opacity-100 transition-opacity bg-gradient-to-t from-black/80 to-transparent">
            <div className="p-4 flex items-center gap-4">
              <button className="text-white hover:text-rose-500 transition-colors">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </button>
              <div className="flex-1 h-1 bg-zinc-600 rounded-full cursor-pointer">
                <div className="w-1/3 h-full bg-rose-500 rounded-full relative">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full"></div>
                </div>
              </div>
              <span className="text-xs font-medium">1:23 / 5:40</span>
            </div>
          </div>
          <div className="text-zinc-600 flex flex-col items-center gap-2">
            <svg className="w-16 h-16 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p>Video Player Placeholder for Video {id}</p>
          </div>
        </div>
        
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-2">Playing Video {id}</h2>
          <div className="flex items-center gap-4 text-sm text-zinc-400 mb-6">
            <span>1.2M views</span>
            <span>•</span>
            <span>Oct 24, 2026</span>
          </div>
          <div className="bg-zinc-800/50 p-4 rounded-lg">
            <p className="text-zinc-300">This is a premium high-quality video description. StreamForge delivers the best content directly to your screen with zero buffering and crystal clear resolution.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
