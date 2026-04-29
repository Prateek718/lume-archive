// Normalises whatever a `catch (e)` block sees into a string suitable for UI.
//
// Why this exists: Supabase's PostgrestError is a plain object with `message`,
// `code`, `details`, `hint` — NOT an Error instance. The common pattern
// `e instanceof Error ? e.message : String(e)` falls through to `String({...})`
// which renders "[object Object]" in user-facing fallbacks.

export function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (
    e &&
    typeof e === 'object' &&
    'message' in e &&
    typeof (e as { message: unknown }).message === 'string'
  ) {
    return (e as { message: string }).message;
  }
  return 'Something went wrong';
}
