import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { cn } from '../../lib/utils';

export function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('immeit_sidebar_collapsed') !== 'true');

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 relative selection:bg-indigo-100 selection:text-indigo-900">
      {/* Ambient background glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl pointer-events-none" />

      <Sidebar open={sidebarOpen} onToggle={() => { const next = !sidebarOpen; setSidebarOpen(next); localStorage.setItem('immeit_sidebar_collapsed', String(!next)); }} />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {title !== undefined && <Topbar title={title} onToggleSidebar={() => { const next = !sidebarOpen; setSidebarOpen(next); localStorage.setItem('immeit_sidebar_collapsed', String(!next)); }} />}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8 max-w-[1600px] mx-auto stagger-children">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
