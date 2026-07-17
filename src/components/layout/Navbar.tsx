'use client';

import { Menu, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationCenter } from '@/components/NotificationCenter';
import { Badge } from '@/components/ui/badge';
import { User } from '@/types/user';

interface NavbarProps {
  onMenuClick?: () => void;
  user?: User | null;
}

export function Navbar({ onMenuClick, user = null }: Readonly<NavbarProps>) {
  const displayName = user?.name ?? (user as unknown as { full_name?: string })?.full_name ?? 'Workspace';
  const roleLabel = user?.role ? user.role.replaceAll('_', ' ') : 'Active session';

  return (
    <header className="sticky top-0 z-30 flex h-20 w-full items-center justify-between border-b border-slate-200/80 bg-white/92 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-4 flex-1">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick} aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>

        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <ShieldCheck className="h-4 w-4 text-[#D4A017]" />
            <span className="truncate">{displayName}</span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">{roleLabel}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-3 sm:gap-4">
        <NotificationCenter userId={user?.id ?? null} />
      </div>
    </header>
  );
}
