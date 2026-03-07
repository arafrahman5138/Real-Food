import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
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
        screenOptions={({ navigation }) => ({
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'slide_from_right',
          headerLeft: ({ canGoBack, tintColor }) =>
            canGoBack ? (
              <TouchableOpacity onPress={navigation.goBack} hitSlop={8}>
                <Ionicons
                  name="chevron-back"
                  size={28}
                  color={tintColor || theme.text}
                  style={{ transform: [{ translateX: 1 }] }}
                />
              </TouchableOpacity>
            ) : null,
        })}
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
            headerTitle: () => (
              <View style={[styles.headerCapsule, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <View style={[styles.headerDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.headerTitle, { color: theme.text }]}>Food Details</Text>
              </View>
            ),
            headerTitleAlign: 'center',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
            headerLeft: () => (
              <TouchableOpacity
                style={[styles.backBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={24} color={theme.primary} />
              </TouchableOpacity>
            ),
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="food/meals"
          options={{
            headerShown: true,
            headerTitle: '',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
            headerLeft: () => (
              <TouchableOpacity
                style={[styles.backBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={24} color={theme.primary} />
              </TouchableOpacity>
            ),
            headerRight: () => (
              <View style={[styles.headerCapsule, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <View style={[styles.headerDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.headerTitle, { color: theme.text }]}>Today's Meals</Text>
              </View>
            ),
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="food/search"
          options={{
            headerShown: true,
            headerTitle: () => (
              <View style={[styles.headerCapsule, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <View style={[styles.headerDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.headerTitle, { color: theme.text }]}>Food Search</Text>
              </View>
            ),
            headerTitleAlign: 'center',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
            headerLeft: () => (
              <TouchableOpacity
                style={[styles.backBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={24} color={theme.primary} />
              </TouchableOpacity>
            ),
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="food/metabolic-coach"
          options={{
            headerShown: true,
            headerTitle: () => (
              <View style={[styles.headerCapsule, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <View style={[styles.headerDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.headerTitle, { color: theme.text }]}>Metabolic Coach</Text>
              </View>
            ),
            headerTitleAlign: 'center',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
            headerLeft: () => (
              <TouchableOpacity
                style={[styles.backBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={24} color={theme.primary} />
              </TouchableOpacity>
            ),
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="food/mes-breakdown"
          options={{
            headerShown: true,
            headerTitle: () => (
              <View style={[styles.headerCapsule, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <View style={[styles.headerDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.headerTitle, { color: theme.text }]}>MES Breakdown</Text>
              </View>
            ),
            headerTitleAlign: 'center',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
            headerLeft: () => (
              <TouchableOpacity
                style={[styles.backBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={24} color={theme.primary} />
              </TouchableOpacity>
            ),
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="scan/index"
          options={{
            headerShown: true,
            headerTitle: () => (
              <View style={[styles.headerCapsule, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <View style={[styles.headerDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.headerTitle, { color: theme.text }]}>Whole Food Scan</Text>
              </View>
            ),
            headerTitleAlign: 'center',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
            headerLeft: () => (
              <TouchableOpacity
                style={[styles.backBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={24} color={theme.primary} />
              </TouchableOpacity>
            ),
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
        <Stack.Screen
          name="meal-plan-builder"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 42,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    fontSize: 28 / 1.75,
    fontWeight: '700',
  },
});
