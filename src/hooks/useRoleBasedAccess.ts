'use client';

import { useEffect, useState } from 'react';
import { AuthUser } from '@/services/authService';

export const useRoleBasedAccess = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUser = () => {
      if (typeof window === 'undefined') return null;
      const raw = localStorage.getItem('user');
      if (!raw) return null;

      try {
        return JSON.parse(raw) as AuthUser;
      } catch (error) {
        console.error('Failed to parse user from localStorage', error);
        return null;
      }
    };

    const currentUser = getUser();
    setUser(currentUser);
    setLoading(false);
  }, []);

  const hasAccess = (requiredRoles: string[]) => {
    if (!user) return false;
    return requiredRoles.includes(user.role);
  };

  return { user, hasAccess, loading };
};
