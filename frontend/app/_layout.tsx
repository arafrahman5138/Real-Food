import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../hooks/useTheme';
import { useThemeStore } from '../stores/themeStore';

export default function RootLayout() {
  const theme = useTheme();
  const mode = useThemeStore((s) => s.mode);

  useEffect(() => {
    useThemeStore.getState().loadSaved();
  }, []);

  return (
    <>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
            headerTitle: 'Recipe',
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
          }}
        />
      </Stack>
    </>
  );
}
