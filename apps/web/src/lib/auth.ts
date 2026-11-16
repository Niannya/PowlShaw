import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/api/admin";

export type { AdminSession } from "@/lib/api/types";
export { getAdminSession };

export async function isAdmin() {
  return (await getAdminSession()).authenticated;
}

/** UX-only gate: the API remains the real authorization boundary. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

export async function getAdminUsername() {
  return (await getAdminSession()).username || "admin";
}

export async function adminCredentialsAreConfigured() {
  return (await getAdminSession()).credentialsConfigured;
}
