import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { cn } from '../../lib/utils';

export function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('immeit_sidebar_collapsed') === 'true');

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar open={sidebarOpen} onToggle={() => { const next = !sidebarOpen; setSidebarOpen(next); localStorage.setItem('immeit_sidebar_collapsed', String(!next)); }} />
      <div className="flex-1 flex flex-col min-w-0">
        {title !== undefined && <Topbar title={title} onToggleSidebar={() => { const next = !sidebarOpen; setSidebarOpen(next); localStorage.setItem('immeit_sidebar_collapsed', String(!next)); }} />}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-[1600px] mx-auto stagger-children">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
