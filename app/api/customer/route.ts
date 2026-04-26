import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  const userId = req.nextUrl.searchParams.get("userId");

  if (!email && !userId) return NextResponse.json({ error: "email or userId required" }, { status: 400 });

  let authUserId = userId;
  let resolvedEmail = email;
  let registeredAt: string | null = null;
  let lastSignIn: string | null = null;

  if (userId) {
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);
    authUserId = user?.id ?? null;
    resolvedEmail = user?.email ?? email;
    registeredAt = user?.created_at ?? null;
    lastSignIn = user?.last_sign_in_at ?? null;
  } else if (email) {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const authUser = users.find((u) => u.email === email);
    authUserId = authUser?.id ?? null;
    registeredAt = authUser?.created_at ?? null;
    lastSignIn = authUser?.last_sign_in_at ?? null;
  }

  if (!authUserId) {
    return NextResponse.json({ error: "user not found", email: resolvedEmail, registeredAt: null, lastSignIn: null, profile: null, purchases: [], downloadCount: 0, pastChats: [], chatCount: 0 });
  }

  // chat_sessionsはuser_idで検索、なければemailで検索
  const chatQuery = supabase.from("chat_sessions").select("id, created_at, status", { count: "exact" }).order("created_at", { ascending: false });
  const chatRes = await chatQuery.eq("user_id", authUserId);

  const [profileRes, purchasesRes, downloadRes] = await Promise.all([
    supabase.from("profiles").select("plan, plan_status, cancel_at_period_end, current_period_end, payment_failed_at, status, trial_end").eq("id", authUserId).single(),
    supabase.from("purchases").select("material_id, created_at").eq("user_id", authUserId).order("created_at", { ascending: false }),
    supabase.from("download_history").select("material_id, created_at", { count: "exact" }).eq("user_id", authUserId).order("created_at", { ascending: false }).limit(5),
  ]);

  return NextResponse.json({
    email: resolvedEmail,
    registeredAt,
    lastSignIn,
    profile: profileRes.data ?? null,
    purchases: purchasesRes.data ?? [],
    recentDownloads: downloadRes.data ?? [],
    downloadCount: downloadRes.count ?? 0,
    pastChats: chatRes.data ?? [],
    chatCount: chatRes.count ?? 0,
  });
}
