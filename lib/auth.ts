export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem("admin_auth") === "ok";
}

export function login(password: string): boolean {
  if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
    sessionStorage.setItem("admin_auth", "ok");
    return true;
  }
  return false;
}

export function logout() {
  sessionStorage.removeItem("admin_auth");
}
