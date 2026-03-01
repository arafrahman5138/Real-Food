import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../hooks/useTheme';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { useGamificationStore } from '../stores/gamificationStore';
import LogoHeader from '../components/LogoHeader';

export default function RootLayout() {
  const theme = useTheme();
  const mode = useThemeStore((s) => s.mode);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    useThemeStore.getState().loadSaved();
    useAuthStore.getState().loadAuth();
    // Sync streak on initial launch
    useGamificationStore.getState().syncStreak();
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        // App came to foreground — sync streak
        const token = useAuthStore.getState().token;
        if (token) {
          useGamificationStore.getState().syncStreak();
        }
      }
      appState.current = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  return (
    <>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          headerBackTitleVisible: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, headerTitle: '' }} />
        <Stack.Screen
          name="cook/[id]"
          options={{
            headerShown: true,
            headerTitle: 'Cook Mode',
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="food/[id]"
          options={{
            headerShown: true,
            headerTitle: 'Food Details',
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="food/meals"
          options={{
            headerShown: true,
            headerTitle: "Today's Meals",
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="browse/index"
          options={{
            headerShown: true,
            headerTitle: 'Browse Recipes',
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="browse/[id]"
          options={{
            headerShown: true,
            headerTitle: () => <LogoHeader />,
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="saved/index"
          options={{
            headerShown: true,
            headerTitle: 'Saved Recipes',
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: true,
            headerTitle: 'Settings',
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="preferences"
          options={{
            headerShown: true,
            headerTitle: 'Preferences',
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
          }}
        />
      </Stack>
    </>
  );
}
