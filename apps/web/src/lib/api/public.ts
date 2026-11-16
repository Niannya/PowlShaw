import { cache } from "react";
import { ApiError } from "@/lib/api/errors";
import { apiServer } from "@/lib/api/server";
import type {
  ArchiveYear,
  ArticleDetailPayload,
  ArticleListResult,
  ArticleListItem,
  Event,
  EventPayload,
  MePayload,
  NotificationItem,
  PublicUser,
  SitePayload,
  SiteSettings,
  SlugKind,
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

/* ------------------------------------------------------------- site chrome */

export const getSiteData = cache(async (): Promise<SitePayload> => apiServer<SitePayload>("/site"));

export const getMe = cache(async (): Promise<MePayload> => apiServer<MePayload>("/me"));

export async function getSiteSettings(): Promise<SiteSettings> {
  return (await getSiteData()).settings;
}

export async function getArchiveYears(): Promise<ArchiveYear[]> {
  return (await getSiteData()).archiveYears;
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  return (await getMe()).user;
}

export async function getUnreadNotificationCount(): Promise<number> {
  return (await getMe()).unreadNotifications;
}

export async function getNotifications(): Promise<NotificationItem[]> {
  return (await apiServer<{ items: NotificationItem[] }>("/me/notifications")).items;
}

/* ----------------------------------------------------------------- content */

export async function getArticleList(params: {
  page?: number;
  perPage?: number;
  limit?: number;
  q?: string;
  year?: string;
}): Promise<ArticleListResult> {
  return apiServer<ArticleListResult>(`/articles${queryString(params)}`);
}

export async function getRecentArticles(limit = 12): Promise<ArticleListItem[]> {
  return (await getArticleList({ limit })).items;
}

export async function getArticles(page = 1, perPage = 30): Promise<ArticleListResult> {
  return getArticleList({ page, perPage });
}

export async function searchArticles(
  q: string,
  page = 1,
  perPage = 30,
): Promise<ArticleListResult> {
  return getArticleList({ q, page, perPage });
}

export async function getArticlesByYear(
  year: string,
  page = 1,
  perPage = 30,
): Promise<ArticleListResult> {
  return getArticleList({ year, page, perPage });
}

export const getArticleDetail = cache(
  async (
    slug: string,
    commentPage: number,
    commentSort: "oldest" | "newest",
    commentId: number,
  ): Promise<ArticleDetailPayload | undefined> => {
    try {
      return await apiServer<ArticleDetailPayload>(
        `/articles/${encodeURIComponent(slug)}${queryString({
          commentPage,
          commentSort,
          commentId: commentId || undefined,
        })}`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return undefined;
      throw error;
    }
  },
);

export async function getArticle(slug: string) {
  return (await getArticleDetail(slug, 1, "oldest", 0))?.article;
}

export async function getEvents(): Promise<Event[]> {
  return (await apiServer<{ items: Event[] }>("/events")).items;
}

export async function getFeaturedEvent(): Promise<Event | undefined> {
  return (await getEvents()).find((event) => event.is_featured);
}

export const getEventDetail = cache(async (slug: string): Promise<EventPayload | undefined> => {
  try {
    return await apiServer<EventPayload>(`/events/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
});

export async function getSlugRedirect(
  kind: SlugKind,
  oldSlug: string,
): Promise<string | undefined> {
  const payload = await apiServer<{ target: string | null }>(
    `/redirects${queryString({ kind, slug: oldSlug })}`,
  );
  return payload.target ?? undefined;
}

export async function getRandomArticleSlug(): Promise<string | null> {
  return (await apiServer<{ slug: string | null }>("/articles/random")).slug;
}
