import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  // auth.usersからユーザー取得
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const authUser = users.find((u) => u.email === email);

  const userId = authUser?.id ?? null;
  const registeredAt = authUser?.created_at ?? null;
  const lastSignIn = authUser?.last_sign_in_at ?? null;

  if (!userId) {
    return NextResponse.json({ error: "user not found", email, registeredAt: null, lastSignIn: null, profile: null, purchases: [], downloadCount: 0, chatCount: 0 });
  }

  const [profileRes, purchasesRes, downloadRes, chatRes] = await Promise.all([
    supabase.from("profiles").select("plan, plan_status, cancel_at_period_end, current_period_end, payment_failed_at, status, trial_end").eq("id", userId).single(),
    supabase.from("purchases").select("material_id, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("download_history").select("material_id, created_at", { count: "exact" }).eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("chat_sessions").select("id, created_at, status", { count: "exact" }).eq("user_email", email).order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    email,
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
