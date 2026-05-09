'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  Users, 
  UserSquare2, 
  Calendar, 
  Clock, 
  FileCheck2, 
  BarChart3,
  LogOut,
  LockIcon,
} from 'lucide-react';
import { User } from '@/types/user';
import { authService } from '@/services/authService';
import { isApprovalOfficer, getApprovalOfficerConfig, isFacultyLikeRole } from '@/lib/roleConfig';

interface SidebarProps {
  user: User | null;
}

const createMenuLinks = (dashboardPath: string, label: string) => [
  { href: dashboardPath, label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/profile', label: 'My Profile', icon: UserSquare2 },
  { href: '/schedules', label: 'Work Schedule', icon: Calendar },
  { href: '/attendance', label: 'Attendance', icon: Clock },
  { href: '/clearance', label, icon: FileCheck2 },
];

export function Sidebar({ user }: Readonly<SidebarProps>) {
  const pathname = usePathname();
  const router = useRouter();

  // Admin Links
  const adminLinks = [
    { href: '/dashboard/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/faculty', label: 'Faculty Management', icon: Users },
    { href: '/schedules', label: 'Scheduling', icon: Calendar },
    { href: '/attendance', label: 'Attendance Monitoring', icon: Clock },
    { href: '/clearance', label: 'Clearance Compliance', icon: FileCheck2 },
    { href: '/reports', label: 'Reports', icon: BarChart3 },
    { href: '/dashboard/profile', label: 'My Profile', icon: UserSquare2 },
    { href: '/dashboard/changepassword', label: 'Change Password', icon: LockIcon },
  ];

  // Faculty Links
  const facultyLinks = [
    { href: '/dashboard/faculty', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/profile', label: 'My Profile', icon: UserSquare2 },
    { href: '/schedules', label: 'My Schedule', icon: Calendar },
    { href: '/attendance', label: 'Attendance', icon: Clock },
    { href: '/clearance', label: 'Clearance Status', icon: FileCheck2 },
    { href: '/dashboard/changepassword', label: 'Change Password', icon: LockIcon },
  ];

  let links = adminLinks;
  if (isFacultyLikeRole(user?.role)) {
    links = facultyLinks;
  } else if (isApprovalOfficer(user?.role)) {
    // Dynamically create links for approval officers
    const officerConfig = getApprovalOfficerConfig(user?.role as string);
    if (officerConfig) {
      links = createMenuLinks(officerConfig.dashboardPath, officerConfig.label);
    }
  }

  const handleLogout = () => {
    authService.logout();
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <div className="flex h-full w-64 flex-col bg-slate-900 text-white shadow-xl transition-all duration-300">
      <div className="flex h-16 items-center justify-start px-4 border-b border-slate-800">
        <Image
          src="/cropped.png"
          alt="DomStaX"
          width={168}
          height={40}
          className="h-8 w-auto"
          priority
        />
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="flex flex-col space-y-1 px-3">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (pathname.startsWith(link.href) && link.href !== '/dashboard' && link.href !== '#');
            return (
              <Link
                key={link.label}
                href={link.href}
                className={cn(
                  'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive 
                    ? 'bg-red-600/10 text-red-400' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <Icon className={cn('mr-3 h-5 w-5', isActive ? 'text-red-400' : 'text-slate-400')} />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      
      <div className="border-t border-slate-800 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-red-400 font-bold border border-slate-700">
            {user?.name?.charAt(0) ?? 'U'}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{user?.name}</span>
            <span className="text-xs text-slate-400 capitalize">{user?.role}</span>
          </div>
        </div>
        
        <button 
          onClick={handleLogout}
          className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
        >
          <LogOut className="mr-3 h-5 w-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
