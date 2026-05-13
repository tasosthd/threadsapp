const SUPABASE_URL = "https://rbmjbwvojakxvxeodkmp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJibWpid3ZvamFreHZ4ZW9ka21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Nzc3NzYsImV4cCI6MjA5NDE1Mzc3Nn0.f6Pl1FJIH9L4rf-asu2ARlLXUXpncXuyO3v_VZ5n5aQ";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
