import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { BorderRadius, FontSize, Spacing } from '../constants/Colors';

export default function SettingsScreen() {
  const theme = useTheme();
  const { user, logout } = useAuthStore();
  const { mode, setMode } = useThemeStore();

  const themeOptions: { id: 'system' | 'light' | 'dark'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'system', label: 'System', icon: 'phone-portrait' },
    { id: 'light', label: 'Light', icon: 'sunny' },
    { id: 'dark', label: 'Dark', icon: 'moon' },
  ];

  return (
    <ScreenContainer safeArea={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ── Appearance ──────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Appearance</Text>
        <View style={[styles.themeRow, { backgroundColor: theme.surfaceElevated, borderRadius: BorderRadius.md }]}>
          {themeOptions.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              onPress={() => setMode(opt.id)}
              activeOpacity={0.7}
              style={[
                styles.themeOption,
                mode === opt.id && { backgroundColor: theme.primary },
              ]}
            >
              <Ionicons
                name={opt.icon}
                size={16}
                color={mode === opt.id ? '#FFFFFF' : theme.textSecondary}
              />
              <Text
                style={[
                  styles.themeOptionText,
                  { color: mode === opt.id ? '#FFFFFF' : theme.textSecondary },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Preferences ─────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.xxl }]}>
          Preferences
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          style={[styles.settingsRow, { borderBottomColor: theme.border }]}
          onPress={() => router.push('/saved')}
        >
          <View style={[styles.settingsIcon, { backgroundColor: theme.primaryMuted }]}>
            <Ionicons name="bookmark" size={18} color={theme.primary} />
          </View>
          <View style={styles.settingsInfo}>
            <Text style={[styles.settingsLabel, { color: theme.text }]}>Saved Recipes</Text>
            <Text style={[styles.settingsDesc, { color: theme.textTertiary }]} numberOfLines={1}>
              View all recipes you bookmarked
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>

        {[
          {
            icon: 'nutrition' as const,
            label: 'Dietary Preferences',
            desc: user?.dietary_preferences?.join(', ') || 'Not set',
            section: 'dietary',
          },
          {
            icon: 'flame' as const,
            label: 'Flavor Profile',
            desc: user?.flavor_preferences?.join(', ') || 'Not set',
            section: 'flavor',
          },
          {
            icon: 'alert-circle' as const,
            label: 'Allergies',
            desc: user?.allergies?.join(', ') || 'None',
            section: 'allergies',
          },
          {
            icon: 'close-circle' as const,
            label: 'Disliked Ingredients',
            desc: user?.disliked_ingredients?.join(', ') || 'None',
            section: 'disliked',
          },
          {
            icon: 'restaurant' as const,
            label: 'Liked Proteins',
            desc: user?.protein_preferences?.liked?.join(', ') || 'Not set',
            section: 'liked_proteins',
          },
          {
            icon: 'remove-circle' as const,
            label: 'Proteins to Avoid',
            desc: user?.protein_preferences?.disliked?.join(', ') || 'None',
            section: 'disliked_proteins',
          },
          {
            icon: 'people' as const,
            label: 'Household Size',
            desc: `${user?.household_size || 1} person(s)`,
            section: 'household',
          },
        ].map((item, index) => (
          <TouchableOpacity
            key={index}
            activeOpacity={0.7}
            style={[styles.settingsRow, { borderBottomColor: theme.border }]}
            onPress={() => router.push({ pathname: '/preferences', params: { section: item.section } })}
          >
            <View style={[styles.settingsIcon, { backgroundColor: theme.primaryMuted }]}>
              <Ionicons name={item.icon} size={18} color={theme.primary} />
            </View>
            <View style={styles.settingsInfo}>
              <Text style={[styles.settingsLabel, { color: theme.text }]}>{item.label}</Text>
              <Text style={[styles.settingsDesc, { color: theme.textTertiary }]} numberOfLines={1}>
                {item.desc}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        ))}

        {/* ── Sign Out ────────────────────────────────────────────── */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign Out',
                style: 'destructive',
                onPress: () => {
                  logout();
                  router.replace('/(auth)/login');
                },
              },
            ]);
          }}
          style={[styles.signOutBtn, { backgroundColor: theme.primaryMuted, borderColor: theme.primary + '25' }]}
        >
          <Ionicons name="log-out-outline" size={18} color={theme.primary} />
          <Text style={[styles.signOutText, { color: theme.primary }]}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.huge,
    paddingHorizontal: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  themeRow: {
    flexDirection: 'row',
    padding: 4,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.sm,
  },
  themeOptionText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.md,
  },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsInfo: {
    flex: 1,
  },
  settingsLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  settingsDesc: {
    fontSize: FontSize.sm,
    marginTop: 1,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xxl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  signOutText: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
