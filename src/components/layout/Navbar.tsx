'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationCenter } from '@/components/NotificationCenter';

interface NavbarProps {
  onMenuClick?: () => void;
  userId?: string | null;
}

export function Navbar({ onMenuClick, userId = null }: Readonly<NavbarProps>) {

  return (
    <header className="flex h-16 w-full items-center justify-between border-b bg-white px-6 shadow-sm">
      <div className="flex items-center gap-4 flex-1">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
      </div>
      
      <div className="flex items-center gap-4">
        <NotificationCenter userId={userId} />
      </div>
    </header>
  );
}
