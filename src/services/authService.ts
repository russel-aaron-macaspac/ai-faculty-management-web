export type UserRole = "admin" | "faculty" | "staff";
export type UserStatus = "active" | "inactive" | "on_leave" | "resigned";

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  full_name: string;
}

export interface LoginResponse {
  user: AuthUser;
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const text = await res.text();

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Unexpected server response: ${text.slice(0, 100)}`);
    }

    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }

    return data as LoginResponse;
  },

  logout(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem("user");
    }
  },

  getCachedUser(): AuthUser | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  },
};