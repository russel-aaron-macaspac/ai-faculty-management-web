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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    // Approval officers: create a tailored menu without the Work Schedule entry
    const officerConfig = getApprovalOfficerConfig(user?.role as string);
    if (officerConfig) {
      const officerDashboardPath = `${officerConfig.dashboardPath}/${officerConfig.id}`;
      links = [
        { href: officerDashboardPath, label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/profile', label: 'My Profile', icon: UserSquare2 },
        { href: '/attendance', label: 'Attendance', icon: Clock },
        { href: '/clearance', label: officerConfig.label, icon: FileCheck2 },
        { href: '/dashboard/changepassword', label: 'Change Password', icon: LockIcon },
      ];

      if (user?.role === 'dean' || user?.role === 'ovpaa' || user?.role === 'registrar') {
        links.splice(3, 0, { href: '/dashboard/schedule-approvals', label: 'Schedule Approvals', icon: Calendar });
      }
    }
  }

  // Determine a display name that supports both `name` and legacy `full_name` fields
  const displayName = user?.name ?? (user as unknown as { full_name?: string })?.full_name ?? '';

  const isImelda = (u?: User | null) => {
    if (!u) return false;
    const nameLike = (u.name ?? (u as unknown as { full_name?: string })?.full_name ?? '').trim().toLowerCase();
    const role = (u.role || '').toString().toLowerCase();
    return nameLike === 'imelda tolentino' && role === 'program_chair';
  };

  // Only expose schedule-loading to the program chair Imelda Tolentino
  if (isImelda(user)) {
    links.push({ href: '/schedule-loading', label: 'Schedule Loading', icon: Calendar });
  }

  const handleLogout = () => {
    authService.logout();
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <aside className="flex h-full w-72 flex-col border-r border-white/10 navy-panel text-white shadow-[8px_0_40px_-30px_rgba(0,0,0,0.5)] transition-all duration-300">
      <div className="flex h-20 items-center justify-start gap-3 border-b border-white/10 px-5">
        <Image
          src="/cropped.png"
          alt="DomStaX"
          width={168}
          height={40}
          className="h-8 w-auto"
          priority
        />
        <div className="hidden flex-col sm:flex">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#D4A017]">Faculty Hub</span>
          <span className="text-xs text-slate-300">Operations dashboard</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <nav className="flex flex-col gap-1.5">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (pathname.startsWith(link.href) && link.href !== '/dashboard' && link.href !== '#');
            return (
              <Link
                key={link.label}
                href={link.href}
                className={cn(
                  'group flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                  isActive 
                    ? 'bg-[#D4A017] text-[#0F172A] shadow-sm' 
                    : 'text-slate-300 hover:bg-white/8 hover:text-white'
                )}
              >
                <Icon className={cn('mr-3 h-5 w-5 transition-colors', isActive ? 'text-[#0F172A]' : 'text-slate-400 group-hover:text-white')} />
                <span className="truncate">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      
      <div className="border-t border-white/10 p-5 space-y-4">
        <div className="flex items-center gap-3 rounded-[12px] border border-white/10 bg-white/5 p-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#D4A017]/15 font-semibold text-[#D4A017] ring-1 ring-[#D4A017]/20">
            {displayName?.charAt(0) ?? 'U'}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white">{displayName || user?.role}</span>
            <Badge variant="outline" className="mt-1 w-fit capitalize border-white/10 bg-white/5 text-slate-100">{user?.role}</Badge>
          </div>
        </div>
        
        <Button 
          variant="outline"
          onClick={handleLogout}
          className="flex w-full items-center justify-start gap-3 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
