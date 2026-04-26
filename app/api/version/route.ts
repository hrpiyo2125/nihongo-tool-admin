import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const buildId =
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_BUILD_ID ??
    "dev";
  return NextResponse.json({ buildId });
}
