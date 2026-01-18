// Authentication Manager
class AuthManager {
    constructor() {
        this.user = null;
        this.onAuthStateChange = null;
    }

    async init() {
        const client = window.getSupabase();
        if (!client) return;

        // Check current session
        const { data: { session } } = await client.auth.getSession();
        if (session) {
            this.user = session.user;
        }

        // Listen for auth changes
        client.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event);
            this.user = session?.user || null;
            
            if (this.onAuthStateChange) {
                this.onAuthStateChange(this.user);
            }
        });
    }

    async signInWithEmail(email) {
        const client = window.getSupabase();
        if (!client) throw new Error('Supabase not initialized');

        // Determine redirect URL:
        // 1. Use manual config if provided
        // 2. Otherwise use the current URL without query/hash
        const config = window.SUPABASE_CONFIG || {};
        const redirectUrl = config.redirectUrl || window.location.href.split('#')[0].split('?')[0];

        console.log('Using redirect link:', redirectUrl);

        const { data, error } = await client.auth.signInWithOtp({
            email: email,
            options: {
                emailRedirectTo: redirectUrl,
            }
        });

        if (error) throw error;
        return data;
    }

    async signOut() {
        const client = window.getSupabase();
        if (!client) return;

        const { error } = await client.auth.signOut();
        if (error) throw error;
        
        this.user = null;
    }

    isAuthenticated() {
        return this.user !== null;
    }

    getUserEmail() {
        return this.user?.email || '';
    }

    getUserId() {
        return this.user?.id || null;
    }

    getInitial() {
        const email = this.getUserEmail();
        return email ? email.charAt(0).toUpperCase() : '?';
    }
}

// Create global auth instance
window.authManager = new AuthManager();
