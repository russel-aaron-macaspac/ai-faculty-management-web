export const scheduleService = {
 
  async getSchedules() {
    const res = await fetch("/api/schedules");

    if (!res.ok) {
      console.error("[scheduleService.getSchedules]", await res.text());
      return [];
    }

    const { data } = await res.json();
    return data;
  },

  async createSchedule(values: {
    employeeId: string;
    employeeName: string;
    type: "class" | "shift";
    subjectOrRole: string;
    room?: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
  }) {
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? "Failed to create schedule");
    }

    return res.json();
  },

  async updateSchedule(id: string, values: {
    type: "class" | "shift";
    subjectOrRole: string;
    room?: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
  }) {
    const res = await fetch(`/api/schedules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? "Failed to update schedule");
    }

    return res.json();
  },

  async deleteSchedule(id: string) {
    const res = await fetch(`/api/schedules/${id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? "Failed to delete schedule");
    }

    return res.json();
  },
};