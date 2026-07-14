export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export const LOCAL_STORAGE_KEYS = {
  boards: "vidyamap.boards",
  settings: "vidyamap.settings",
  demoUser: "vidyamap.demo-user",
} as const;

export const APP_NAME = "Manojalam";
export const APP_NAME_DEVANAGARI = "मनोजालम्";
export const APP_TAGLINE =
  "A visual knowledge canvas for study, Sanskrit, and structured thinking.";

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005";

export const BOARD_CONTENT_VERSION = 3;
export const HISTORY_LIMIT = 100;
export const AUTOSAVE_DELAY_MS = 1200;
