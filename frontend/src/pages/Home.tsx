import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      <header className="text-center md:text-left py-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
          Welcome to <span className="text-rose-500">StreamForge</span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl">
          Your premium destination for high-quality video streaming. Discover, watch, and share your favorite moments.
        </p>
      </header>
      
      <section>
        <h2 className="text-xl font-semibold text-zinc-200 mb-6 flex items-center gap-2">
          <div className="w-2 h-6 bg-rose-500 rounded-full"></div>
          Trending Videos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <Link to="/video/1" className="group block bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-900/10">
            <div className="aspect-video bg-zinc-800 relative">
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <div className="w-12 h-12 rounded-full bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-600/30">
                  <svg className="w-5 h-5 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </div>
              </div>
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors">Sample Video 1</h3>
              <p className="text-sm text-zinc-500 mt-1">1.2M views • 2 days ago</p>
            </div>
          </Link>
          <Link to="/video/2" className="group block bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-900/10">
            <div className="aspect-video bg-zinc-800 relative">
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <div className="w-12 h-12 rounded-full bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-600/30">
                  <svg className="w-5 h-5 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </div>
              </div>
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors">Sample Video 2</h3>
              <p className="text-sm text-zinc-500 mt-1">850K views • 5 days ago</p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
