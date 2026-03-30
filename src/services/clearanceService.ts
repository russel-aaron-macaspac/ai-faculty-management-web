export const clearanceService = {
  async getFacultyUsers() {
    const res = await fetch('/api/users/faculty');
    if (!res.ok) {
      console.error('[clearanceService.getFacultyUsers]', await res.text());
      return [];
    }
    const { data } = await res.json();
    return data || [];
  },

  async getClearances(userId?: string) {
    const url = userId ? `/api/clearances?userId=${userId}` : '/api/clearances';
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[clearanceService.getClearances]', await res.text());
      return [];
    }
    const { data } = await res.json();
    return data;
  },

  async getCategories() {
    const res = await fetch('/api/clearances/categories');
    if (!res.ok) {
      console.error('[clearanceService.getCategories]', await res.text());
      return [];
    }
    const { data } = await res.json();
    return data;
  },

  async uploadDocument(employeeId: string, employeeName: string, officeName: string) {
    const res = await fetch('/api/clearances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, employeeName, officeName }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to upload document');
    }
    return res.json();
  },

  async updateStatus(id: string, status: string, rejectionReason?: string, reviewedBy?: string) {
    const res = await fetch(`/api/clearances/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, rejectionReason, reviewedBy }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to update clearance status');
    }
    return res.json();
  },

  async approveClearance(id: string, remarks: string, reviewedBy: string, reviewedByName: string, reviewedByRole: string) {
    const res = await fetch(`/api/clearances/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remarks, reviewedBy, reviewedByName, reviewedByRole }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to approve clearance');
    }
    return res.json();
  },

  async rejectClearance(id: string, rejectionReason: string, reviewedBy: string, reviewedByName: string, reviewedByRole: string) {
    const res = await fetch(`/api/clearances/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectionReason, reviewedBy, reviewedByName, reviewedByRole }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to reject clearance');
    }
    return res.json();
  },

  async addClearanceNote(clearanceId: string, content: string, authorId: string, authorName: string, noteType: 'remark' | 'followup' | 'validation' = 'remark') {
    const res = await fetch(`/api/clearances/${clearanceId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, authorId, authorName, noteType }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? 'Failed to add note');
    }
    return res.json();
  },

  async getClearanceNotes(clearanceId: string) {
    const res = await fetch(`/api/clearances/${clearanceId}/notes`);
    if (!res.ok) {
      console.error('[clearanceService.getClearanceNotes]', await res.text());
      return [];
    }
    const { notes } = await res.json();
    return notes || [];
  },

  async getNotifications(userId: string, unreadOnly: boolean = false) {
    const url = `/api/notifications?userId=${userId}&unreadOnly=${unreadOnly}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[clearanceService.getNotifications]', await res.text());
      return [];
    }
    const { notifications } = await res.json();
    return notifications || [];
  },

  async markNotificationAsRead(notificationId: string) {
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId, markAsRead: true }),
    });
    if (!res.ok) {
      console.error('[clearanceService.markNotificationAsRead]', await res.text());
      return null;
    }
    return res.json();
  },

  async markAllNotificationsAsRead(userId: string) {
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, markAsRead: true }),
    });
    if (!res.ok) {
      console.error('[clearanceService.markAllNotificationsAsRead]', await res.text());
      return null;
    }
    return res.json();
  },
};