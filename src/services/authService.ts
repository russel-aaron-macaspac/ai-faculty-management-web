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

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Unexpected server response: ${text.slice(0, 100)}`);
    }

    if (!res.ok) {
      const errorMessage =
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as { error?: unknown }).error === "string"
          ? (data as { error: string }).error
          : "Login failed";

      throw new Error(errorMessage);
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