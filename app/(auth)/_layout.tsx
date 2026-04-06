import { Stack } from 'expo-router';

// Auth stack layout — wraps all the login/signup/onboarding screens.
// No header bar shown on any of these screens (we style our own headers).
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }} />
  );
}
