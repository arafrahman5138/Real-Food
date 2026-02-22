import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { useThemeStore } from '../stores/themeStore';

export function useTheme() {
  const systemScheme = useColorScheme();
  const mode = useThemeStore((s) => s.mode);

  const effectiveScheme =
    mode === 'system' ? systemScheme || 'dark' : mode;

  return Colors[effectiveScheme === 'light' ? 'light' : 'dark'];
}
