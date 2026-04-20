import { Stack } from 'expo-router';
import { Colors } from '../../constants/theme';

// Auth stack layout — wraps all the login/signup/onboarding screens.
// No header bar shown on any of these screens (we style our own headers).
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />
  );
}
