'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  Users, 
  UserPlus,
  UserSquare2, 
  Calendar, 
  Clock, 
  BookOpen,
  FileCheck2, 
  BarChart3,
  LogOut,
  LockIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { User } from '@/types/user';
import type { ClearanceNotificationState } from '@/hooks/useClearanceNotifications';
import { authService } from '@/services/authService';
import { isApprovalOfficer, getApprovalOfficerConfig, isFacultyLikeRole } from '@/lib/roleConfig';
import { Badge } from '@/components/ui/badge';
import type { ClearanceNotification } from '@/types/clearance';

interface SidebarProps {
  user: User | null;
  notificationState: ClearanceNotificationState;
  collapsed?: boolean;
  onToggle?: () => void;
}

const createMenuLinks = (dashboardPath: string, label: string) => [
  { href: dashboardPath, label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/profile', label: 'My Profile', icon: UserSquare2 },
  { href: '/schedules', label: 'Work Schedule', icon: Calendar },
  { href: '/attendance', label: 'Attendance', icon: Clock },
  { href: '/clearance', label, icon: FileCheck2 },
];

// Labels that belong in the "Account" group at the bottom of the nav,
// separated from primary navigation by a divider + section label.
const ACCOUNT_LABELS = new Set(['Change Password']);

type SidebarLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const CLEARANCE_NOTIFICATION_TYPES: ClearanceNotification['type'][] = [
  'clearance_submitted',
  'clearance_approved',
  'clearance_rejected',
  'clearance_note_added',
  'clearance_deleted',
];

const SCHEDULE_NOTIFICATION_TYPES: ClearanceNotification['type'][] = [
  'schedule_created',
  'schedule_updated',
  'schedule_deleted',
  'schedule_approved',
  'schedule_anomaly',
];

export function Sidebar({ user, notificationState, collapsed = false, onToggle }: Readonly<SidebarProps>) {
  const pathname = usePathname();
  const router = useRouter();
  const { notifications } = notificationState;

  // Admin Links
  const adminLinks = [
    { href: '/dashboard/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/admin/accounts', label: 'Account Creation', icon: UserPlus },
    { href: '/dashboard/admin/subjects', label: 'Subject Management', icon: BookOpen },
    { href: '/faculty', label: 'Faculty Management', icon: Users },
    { href: '/clearance', label: 'Requirements Management', icon: FileCheck2 },
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
    links = [...facultyLinks];
    if (user?.role === 'program_chair') {
      // Program chairs also review faculty clearance submissions routed
      // to the Program Chair office, in addition to their own faculty view.
      links.splice(4, 0, {
        href: '/dashboard/program-chair-approvals',
        label: 'Program Chair Clearance Approvals',
        icon: FileCheck2,
      });
    }
  } else if (isApprovalOfficer(user?.role)) {
    // Approval officers: create a tailored menu without the Work Schedule entry
    const officerConfig = getApprovalOfficerConfig(user?.role as string);
    if (officerConfig) {
      const officerDashboardPath = `${officerConfig.dashboardPath}/${officerConfig.id}`;
      links = [
        { href: officerDashboardPath, label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/profile', label: 'My Profile', icon: UserSquare2 },
        ...(user?.role === 'dean' ? [{ href: '/schedules', label: 'My Schedule', icon: Calendar }] : []),
        { href: '/attendance', label: user?.role === 'hro' ? 'Faculty Attendance' : 'Attendance', icon: Clock },
        ...(['hro', 'dean'].includes(user?.role ?? '') ? [{ href: '/faculty', label: 'Faculty List', icon: Users }] : []),
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

  if (user?.role === 'program_chair') {
    links.push({ href: '/schedule-loading', label: 'Schedule Loading', icon: Calendar });
  }

  if (user?.role === 'program_chair') {
    links.push({ href: '/section-matrix', label: 'Master Schedules', icon: BookOpen });
  }

  if (user?.role === 'registrar') {
    links.push(
      { href: '/section-matrix', label: 'Section Schedules', icon: BookOpen },
      { href: '/room-schedules', label: 'Room Schedules', icon: Calendar },
    );
  }

  // Split into primary nav vs. account-related items so the list gets a
  // section break instead of one long undifferentiated column with a
  // large empty gap above the footer.
  const primaryLinks = links.filter((link) => !ACCOUNT_LABELS.has(link.label));
  const accountLinks = links.filter((link) => ACCOUNT_LABELS.has(link.label));

  const handleLogout = () => {
    authService.logout();
    localStorage.removeItem('user');
    router.push('/login');
  };

  const getNotificationCount = (link: SidebarLink) => {
    const notificationTypes = link.href === '/clearance' || link.href === '/dashboard/program-chair-approvals'
      ? CLEARANCE_NOTIFICATION_TYPES
      : ['/schedules', '/dashboard/schedule-approvals', '/schedule-loading'].includes(link.href)
        ? SCHEDULE_NOTIFICATION_TYPES
        : [];

    return notifications.filter(
      (notification) => !notification.is_read && notificationTypes.includes(notification.type)
    ).length;
  };

  const renderLink = (link: SidebarLink, index: number) => {
    const Icon = link.icon;
    const notificationCount = getNotificationCount(link);
    const isActive = pathname === link.href || (
      link.label !== 'Dashboard' &&
      pathname.startsWith(link.href) &&
      link.href !== '/dashboard' &&
      link.href !== '#'
    );
    return (
      <Link
        key={`${link.href}-${link.label}-${index}`}
        href={link.href}
        aria-current={isActive ? 'page' : undefined}
        title={collapsed ? link.label : undefined}
        className={cn(
          'group relative flex items-center gap-3 rounded-[10px] py-2.5 font-sans text-sm font-medium transition-colors duration-150',
          collapsed ? 'justify-center px-2' : 'px-3.5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]/40',
          isActive
            ? 'bg-white/10 text-white'
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
        )}
      >
        {/* Slim accent bar instead of a fully-filled block — carries the
            brand color without dominating the row. */}
        <span
          className={cn(
            'absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[#D4A017] transition-opacity duration-150',
            isActive ? 'opacity-100' : 'opacity-0'
          )}
          aria-hidden="true"
        />
        <Icon className={cn('h-[18px] w-[18px] shrink-0 transition-colors', isActive ? 'text-[#D4A017]' : 'text-slate-500 group-hover:text-slate-300')} />
        {!collapsed && <span className="truncate">{link.label}</span>}
        {notificationCount > 0 && (
          <Badge
            variant="info"
            className={cn(
              'ml-auto min-w-5 justify-center border-amber-300 bg-amber-300 px-1.5 py-0.5 text-[10px] font-bold leading-4 text-amber-950 shadow-sm',
              collapsed && 'absolute -right-1 -top-1 ml-0'
            )}
            aria-label={`${notificationCount} unread ${link.label} notification${notificationCount === 1 ? '' : 's'}`}
          >
            {notificationCount > 9 ? '9+' : notificationCount}
          </Badge>
        )}
      </Link>
    );
  };

  return (
    <aside className="flex h-screen w-full shrink-0 flex-col overflow-y-auto border-r border-white/10 navy-panel font-sans text-white shadow-[8px_0_40px_-30px_rgba(0,0,0,0.5)] transition-all duration-300">
      <div className={cn('flex h-20 items-center border-b border-white/10', collapsed ? 'justify-center px-3' : 'justify-between px-5')}>
        {!collapsed && (
          <Image
            src="/cropped.png"
            alt="DomStaX"
            width={168}
            height={40}
            className="h-8 w-auto"
            priority
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          className="hidden text-slate-400 hover:bg-white/10 hover:text-white md:inline-flex"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
      </div>

      {/* User identity block now lives right under the logo, in its own
          bordered section — first thing you see after the brand, rather
          than a footer element that felt disconnected from the nav flow. */}
      <div className={cn('border-b border-white/10 py-4', collapsed ? 'px-3' : 'px-4')}>
        <div className={cn('rounded-[10px] border border-white/10 bg-white/5 p-2.5', collapsed && 'text-center')}>
          <div className={cn('flex min-w-0 flex-col', collapsed && 'hidden')}>
            <span className="truncate font-sans text-sm font-medium text-white">{displayName || user?.role}</span>
            <Badge variant="outline" className="mt-0.5 w-fit border-white/10 bg-transparent px-1.5 py-0 font-sans text-[10px] capitalize text-slate-400">
              {user?.role === 'program_chair' ? 'Program chair' : user?.role}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-3 py-5">
        <nav className="flex flex-col gap-0.5">
          {primaryLinks.map(renderLink)}
        </nav>

        {accountLinks.length > 0 && (
          <div className="mt-auto pt-6">
            <div className={cn('flex items-center gap-2 pb-2', collapsed ? 'px-2' : 'px-3.5')}>
              {!collapsed && <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Account</span>}
              <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
            </div>
            <nav className="flex flex-col gap-0.5">
              {accountLinks.map(renderLink)}
            </nav>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 p-4">
        <button
          type="button"
          onClick={handleLogout}
          className={cn(
            'flex w-full items-center rounded-[10px] py-2.5 font-sans text-sm font-medium text-slate-400 transition-colors duration-150 hover:bg-white/5 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]/40',
            collapsed ? 'justify-center px-2' : 'gap-3 px-3.5'
          )}
          aria-label="Sign out"
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut className="h-[18px] w-[18px]" />
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </aside>
  );
}