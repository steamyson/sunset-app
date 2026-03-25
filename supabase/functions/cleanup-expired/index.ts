// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parsePhotoPath(publicUrl: string): string | null {
  const marker = "/storage/v1/object/public/photos/";
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowIso = new Date().toISOString();
  const legacyMessageCutoffIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: expiredPosts, error: postsErr } = await supabase
    .from("posts")
    .select("id,media_url")
    .lte("expires_at", nowIso);
  if (postsErr) return json({ error: postsErr.message }, 500);

  const postPaths = (expiredPosts ?? [])
    .map((p: { media_url: string | null }) => p.media_url)
    .filter((v: string | null): v is string => Boolean(v));

  let removedPostFiles = 0;
  if (postPaths.length > 0) {
    const { error: removePostMediaErr } = await supabase.storage.from("post-media").remove(postPaths);
    if (!removePostMediaErr) removedPostFiles = postPaths.length;
  }

  const { error: deletePostsErr } = await supabase
    .from("posts")
    .delete()
    .lte("expires_at", nowIso);
  if (deletePostsErr) return json({ error: deletePostsErr.message }, 500);

  // Supports both chat messages (`expires_at`) and legacy photo messages (`created_at` TTL).
  const { data: expiredMessages, error: messagesErr } = await supabase
    .from("messages")
    .select("id,photo_url")
    .or(`expires_at.lte.${nowIso},created_at.lte.${legacyMessageCutoffIso}`);
  if (messagesErr) return json({ error: messagesErr.message }, 500);

  const photoPaths = (expiredMessages ?? [])
    .map((m: { photo_url?: string | null }) => parsePhotoPath(m.photo_url ?? ""))
    .filter((v: string | null): v is string => Boolean(v));

  let removedPhotoFiles = 0;
  if (photoPaths.length > 0) {
    const { error: removePhotosErr } = await supabase.storage.from("photos").remove(photoPaths);
    if (!removePhotosErr) removedPhotoFiles = photoPaths.length;
  }

  const { error: deleteMessagesErr } = await supabase
    .from("messages")
    .delete()
    .or(`expires_at.lte.${nowIso},created_at.lte.${legacyMessageCutoffIso}`);
  if (deleteMessagesErr) return json({ error: deleteMessagesErr.message }, 500);

  return json({
    ok: true,
    deletedPosts: expiredPosts?.length ?? 0,
    deletedMessages: expiredMessages?.length ?? 0,
    removedPostFiles,
    removedPhotoFiles,
  });
});


