import { cache } from "react";
import { ApiError } from "@/lib/api/errors";
import { apiServer } from "@/lib/api/server";
import type {
  AdminArticleListPayload,
  AdminArticlePayload,
  AdminAuditPayload,
  AdminCommentListPayload,
  AdminEventDetailPayload,
  AdminOverviewPayload,
  AdminSession,
  AdminUser,
  Event,
  SiteSettings,
} from "@/lib/api/types";

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const getAdminSession = cache(async (): Promise<AdminSession> => {
  try {
    return await apiServer<AdminSession>("/admin/session");
  } catch {
    return { authenticated: false, credentialsConfigured: false };
  }
});

export async function getAdminOverview(): Promise<AdminOverviewPayload> {
  return apiServer<AdminOverviewPayload>("/admin/overview");
}

export async function getAdminArticleList(params: {
  q?: string;
  eventId?: number;
  page?: number;
}): Promise<AdminArticleListPayload> {
  return apiServer<AdminArticleListPayload>(
    `/admin/articles${queryString({
      q: params.q,
      event: params.eventId,
      page: params.page,
    })}`,
  );
}

export async function getAdminArticle(id: number): Promise<AdminArticlePayload | undefined> {
  try {
    return await apiServer<AdminArticlePayload>(`/admin/articles/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

export async function getAdminEventOptions(): Promise<{ id: number; title: string }[]> {
  return (await apiServer<{ items: { id: number; title: string }[] }>("/admin/event-options"))
    .items;
}

export async function getAdminEvents(): Promise<Event[]> {
  return (await apiServer<{ items: Event[] }>("/admin/events")).items;
}

export async function getAdminEventDetail(
  id: number,
): Promise<AdminEventDetailPayload | undefined> {
  try {
    return await apiServer<AdminEventDetailPayload>(`/admin/events/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

export async function getAdminComments(params: {
  q?: string;
  status?: string;
  article?: string;
  user?: string;
  from?: string;
  to?: string;
  page?: number;
}): Promise<AdminCommentListPayload> {
  return apiServer<AdminCommentListPayload>(`/admin/comments${queryString(params)}`);
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  return (await apiServer<{ items: AdminUser[] }>("/admin/users")).items;
}

export async function getAdminAudit(): Promise<AdminAuditPayload> {
  return apiServer<AdminAuditPayload>("/admin/audit");
}

export async function getAdminSettings(): Promise<SiteSettings> {
  return (await apiServer<{ settings: SiteSettings }>("/admin/settings")).settings;
}
