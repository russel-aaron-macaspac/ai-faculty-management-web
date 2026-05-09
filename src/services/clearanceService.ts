export const clearanceService = {
  isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  },

  async getClearances(userId?: string, officeId?: string) {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (officeId) params.set('officeId', officeId);

    const url = params.toString()
      ? `/api/clearances?${params.toString()}`
      : '/api/clearances';
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[clearanceService.getClearances]', await res.text());
      return [];
    }
    const { data } = await res.json();
    return data;
  },

  async getOffices() {
    const res = await fetch('/api/offices');
    if (!res.ok) {
      console.warn('[clearanceService.getOffices]', await res.text());
      return [];
    }
    const { data } = await res.json();
    return data;
  },

  async uploadDocument(
    userId: string,
    officeId: number,
    originalFilename?: string,
    filePath?: string
  ) {
    const res = await fetch('/api/clearances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        office_id: officeId,
        original_filename: originalFilename ?? null,
        file_path: filePath ?? null,
      }),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok) {
      throw new Error(json.error ?? 'Failed to upload document');
    }
    return json;
  },

  async getFileUrl(path: string): Promise<string> {
    const res = await fetch(`/api/clearances/file?path=${encodeURIComponent(path)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Failed to get file URL');
    return json.url;
  },

  async deleteDocument(id: string) {
    const res = await fetch(`/api/clearances/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      throw new Error(json.error ?? 'Failed to delete document');
    }
    return res.json();
  },

  async updateStatus(
    id: string,
    status: string,
    rejectionReason?: string,
    reviewedBy?: string
  ) {
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
    if (!clearanceService.isUuid(userId)) {
      return [];
    }

    const url = `/api/notifications?userId=${userId}&unreadOnly=${unreadOnly}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[clearanceService.getNotifications]', await res.text());
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
    if (!clearanceService.isUuid(userId)) {
      return null;
    }

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