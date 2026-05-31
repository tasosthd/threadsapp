const SUPABASE_URL = "https://rbmjbwvojakxvxeodkmp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJibWpid3ZvamFreHZ4ZW9ka21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Nzc3NzYsImV4cCI6MjA5NDE1Mzc3Nn0.f6Pl1FJIH9L4rf-asu2ARlLXUXpncXuyO3v_VZ5n5aQ";

// Guard against the Supabase CDN script failing to load. Without this guard a
// missing `supabase` global throws here and aborts config.js, which silently
// breaks every page that depends on supabaseClient (composer included).
let supabaseClient = null;

if (typeof supabase !== "undefined" && supabase.createClient) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
} else {
  console.error(
    "Supabase failed to load. Check the CDN <script> tag / network connection."
  );
}
