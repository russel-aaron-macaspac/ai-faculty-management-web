import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';

interface RouteGuardProps {
  children: React.ReactNode;
  requiredRoles?: string[];
  fallbackPath?: string;
}

export function RouteGuard({ children, requiredRoles, fallbackPath }: RouteGuardProps) {
  const router = useRouter();
  const { user, hasAccess, loading } = useRoleBasedAccess();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    if (requiredRoles && !hasAccess(requiredRoles)) {
      const redirectPath = fallbackPath || (user.role === 'admin' ? '/dashboard/admin' : '/dashboard/faculty');
      router.push(redirectPath);
      return;
    }
  }, [user, hasAccess, loading, requiredRoles, fallbackPath, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  if (requiredRoles && !hasAccess(requiredRoles)) {
    return null; // Will redirect in useEffect
  }

  return <>{children}</>;
}