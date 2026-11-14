import { Link, useLocation } from 'react-router-dom';
import { Home, Users, Radio, LayoutDashboard } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();

  const links = [
    { name: 'Home', path: '/', icon: <Home className="w-5 h-5" /> },
    { name: 'Live Now', path: '/?filter=live', icon: <Radio className="w-5 h-5 text-rose-500" /> },
    { name: 'Subscriptions', path: '/subscriptions', icon: <Users className="w-5 h-5" /> },
    { name: 'Studio', path: '/studio', icon: <LayoutDashboard className="w-5 h-5 text-amber-400" /> },
  ];

  const handleLinkClick = () => {
    if (window.innerWidth < 768 && onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 md:hidden animate-in fade-in"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={`fixed top-16 left-0 bottom-0 bg-zinc-950 border-r border-zinc-800/80 transition-all duration-300 z-40 overflow-y-auto ${
          isOpen ? 'w-60 shadow-2xl md:shadow-none' : 'w-0 sm:w-20'
        }`}
      >
        <div className="flex flex-col py-3">
          {links.map((link) => {
            const isActive = location.pathname === link.path || (link.path.includes('?') && location.search.includes('filter=live'));
            return (
              <Link
                key={link.name}
                to={link.path}
                onClick={handleLinkClick}
                className={`flex items-center mx-2 px-3 py-3 rounded-xl transition-all duration-150 ${
                  isActive 
                    ? 'bg-zinc-900 text-white font-semibold border border-zinc-800' 
                    : 'hover:bg-zinc-900/60 text-zinc-400 hover:text-white'
                } ${isOpen ? 'gap-4 justify-start' : 'sm:flex-col sm:gap-1 sm:justify-center hidden'}`}
                title={!isOpen ? link.name : undefined}
              >
                {link.icon}
                <span className={`${isOpen ? 'text-sm' : 'text-[10px]'} whitespace-nowrap`}>
                  {link.name}
                </span>
              </Link>
            );
          })}

          {isOpen && (
            <>
              <div className="mx-4 my-3 border-t border-zinc-800" />
              <div className="px-5 py-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">StreamForge</div>
              <div className="px-5 py-2 text-xs text-zinc-400 leading-relaxed">
                Sub-second live streaming, community chat, and high-definition video on demand.
              </div>
              <div className="px-5 text-[11px] text-zinc-600 mt-2 pb-6">
                © 2026 StreamForge LLC
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
