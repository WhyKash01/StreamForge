import { Link, useLocation } from 'react-router-dom';
import { Home, Users, PlaySquare, Compass } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
}

export default function Sidebar({ isOpen }: SidebarProps) {
  const location = useLocation();

  const links = [
    { name: 'Home', path: '/', icon: <Home className="w-5 h-5" /> },
    { name: 'Explore', path: '/explore', icon: <Compass className="w-5 h-5" /> },
    { name: 'Subscriptions', path: '/subscriptions', icon: <Users className="w-5 h-5" /> },
    { name: 'Library', path: '/library', icon: <PlaySquare className="w-5 h-5" /> },
  ];

  return (
    <aside
      className={`fixed top-16 left-0 bottom-0 bg-zinc-950 border-r border-zinc-800 transition-all duration-300 z-40 overflow-y-auto ${
        isOpen ? 'w-60' : 'w-0 sm:w-20'
      }`}
    >
      <div className="flex flex-col py-3">
        {links.map((link) => {
          const isActive = location.pathname === link.path;
          return (
            <Link
              key={link.name}
              to={link.path}
              className={`flex items-center mx-2 px-3 py-3 rounded-xl transition-colors ${
                isActive ? 'bg-zinc-800 text-white font-medium' : 'hover:bg-zinc-800/50 text-zinc-400 hover:text-white'
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
            <div className="px-5 py-2 text-sm font-semibold text-zinc-400">StreamForge</div>
            <div className="px-5 py-3 text-sm text-zinc-500 leading-relaxed">
              Explore infinite worlds, epic gaming moments, and vibrant live communities.
            </div>
            <div className="px-5 text-xs text-zinc-600 mt-2 pb-6">
              © 2026 StreamForge LLC
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
