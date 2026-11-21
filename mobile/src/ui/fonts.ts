// The app's typeface, loaded once before anything is drawn (the splash stays up meanwhile).
import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts } from "@expo-google-fonts/plus-jakarta-sans";

/** True once the faces are in, or could not be loaded: the app then draws in the system face rather than not at all. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  return loaded || error !== null;
}
