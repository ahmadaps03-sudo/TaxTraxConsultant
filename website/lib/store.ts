import { addSiteContent, countActiveSiteClients, deleteSiteRecordForAdmin, listSiteRecordsForAdmin, updateSiteRecordForAdmin, type SiteCollection, type SiteRow } from "./site-persistence/client";

export type Collection = SiteCollection;
export type Row = SiteRow;

export const add = (col: "posts" | "videos", data: Record<string, unknown>) => addSiteContent(col, data);
export const list = (col: Collection) => listSiteRecordsForAdmin(col);
export const update = (col: Collection, id: string, patch: Record<string, unknown>) => updateSiteRecordForAdmin(col, id, patch);
export const remove = (col: Collection, id: string) => deleteSiteRecordForAdmin(col, id);
export async function summary() {
  const [messages, bookings, leads, posts, videos, clients] = await Promise.all([
    list("messages"), list("bookings"), list("leads"), list("posts"), list("videos"), countActiveSiteClients(),
  ]);
  return {
    unreadMessages: messages.filter((m) => !m.read).length,
    pendingBookings: bookings.filter((b) => b.status === "pending").length,
    leads: leads.length, totalMessages: messages.length, totalBookings: bookings.length,
    posts: posts.length, videos: videos.length,
    clients,
  };
}
