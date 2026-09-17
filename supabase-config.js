const SUPABASE_URL =
  "https://qidaaofhfqliwtnqipkp.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_eHYYDHSkRHyE7dGkMyVX7Q_FADlbe5C";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);