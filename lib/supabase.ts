import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// These values come from your .env file — never hardcode them here.
const supabaseUrl  = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Single Supabase client instance shared across the whole app.
// AsyncStorage keeps the user's login session saved on their device
// so they don't have to log in every time they open the app.
export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    storage:          AsyncStorage,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false,
  },
});
