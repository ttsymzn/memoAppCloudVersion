// Supabase client initialization
const { createClient } = supabase;

let supabaseInstance = null;

function initSupabase() {
    const config = window.SUPABASE_CONFIG;
    if (!config.url || !config.key) {
        console.warn("Supabase configuration missing. Please provide URL and Key.");
        return null;
    }
    
    if (!supabaseInstance) {
        supabaseInstance = createClient(config.url, config.key);
    }
    return supabaseInstance;
}

// Global accessor
window.getSupabase = initSupabase;
