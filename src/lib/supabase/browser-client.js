"use client";

import { createClient } from "@supabase/supabase-js";

let client = null;

export function getSupabaseBrowserClient() {
  if (client) {
    return client;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePubKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

  if (!supabaseUrl || !supabasePubKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"
    );
  }

  client = createClient(supabaseUrl, supabasePubKey);
  return client;
}