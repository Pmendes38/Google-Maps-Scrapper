import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type SafeServerClient = {
  supabase: ReturnType<typeof createServerClient> | null;
  error: string | null;
};

export function getServerSupabaseClient(): SafeServerClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    return {
      supabase: null,
      error: "Supabase environment variables are missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    };
  }

  try {
    const cookieStore = cookies();
    const supabase = createServerClient(url, key, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    });

    return { supabase, error: null };
  } catch (error) {
    return {
      supabase: null,
      error: `Failed to initialize Supabase server client: ${String(error)}`,
    };
  }
}

export function createServerSupabaseClient() {
  const { supabase, error } = getServerSupabaseClient();
  if (!supabase) {
    throw new Error(error ?? "Supabase server client unavailable.");
  }
  return supabase;
}
