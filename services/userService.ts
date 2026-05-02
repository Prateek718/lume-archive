import { supabase } from '../lib/supabase';

export async function deleteUserAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_user');
  if (error) {
    console.error('[userService.deleteUserAccount]', error);
    throw error;
  }
  // Auth session is now invalid (user row gone). Sign out cleans up local state.
  await supabase.auth.signOut();
}
