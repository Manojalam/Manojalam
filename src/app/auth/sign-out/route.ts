import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(`${origin}/auth/sign-in`, { status: 303 });
}

export async function GET(request: Request) {
  return signOut(request);
}

export async function POST(request: Request) {
  return signOut(request);
}
