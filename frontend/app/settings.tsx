import React, { useEffect, useState } from 'react';
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
import { useMetabolicBudgetStore } from '../stores/metabolicBudgetStore';
import type { MetabolicProfile } from '../stores/metabolicBudgetStore';
import { BorderRadius, FontSize, Spacing } from '../constants/Colors';

export default function SettingsScreen() {
  const theme = useTheme();
  const { user, logout } = useAuthStore();
  const { mode, setMode } = useThemeStore();
  const budget = useMetabolicBudgetStore((s) => s.budget);
  const fetchBudget = useMetabolicBudgetStore((s) => s.fetchBudget);
  const updateBudget = useMetabolicBudgetStore((s) => s.updateBudget);
  const profile = useMetabolicBudgetStore((s) => s.profile);
  const fetchProfile = useMetabolicBudgetStore((s) => s.fetchProfile);
  const [showBudgetEditor, setShowBudgetEditor] = useState(false);
  const [proteinW, setProteinW] = useState(0.4);
  const [fiberW, setFiberW] = useState(0.3);
  const [sugarW, setSugarW] = useState(0.3);

  useEffect(() => {
    fetchBudget();
    fetchProfile();
  }, []);

  useEffect(() => {
    if (budget) {
      setProteinW(budget.weight_protein);
      setFiberW(budget.weight_fiber);
      setSugarW(budget.weight_sugar);
    }
  }, [budget]);

  const saveBudgetWeights = async () => {
    // Normalize to sum to 1.0
    const total = proteinW + fiberW + sugarW;
    const pw = proteinW / total;
    const fw = fiberW / total;
    const sw = sugarW / total;
    await updateBudget({
      weight_protein: Math.round(pw * 100) / 100,
      weight_fiber: Math.round(fw * 100) / 100,
      weight_sugar: Math.round(sw * 100) / 100,
    });
    setShowBudgetEditor(false);
  };

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

        {/* ── Energy Budget ─────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.xxl }]}>
          Energy Budget
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          style={[styles.settingsRow, { borderBottomColor: theme.border }]}
          onPress={() => setShowBudgetEditor(!showBudgetEditor)}
        >
          <View style={[styles.settingsIcon, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
            <Ionicons name="flash" size={18} color="#F59E0B" />
          </View>
          <View style={styles.settingsInfo}>
            <Text style={[styles.settingsLabel, { color: theme.text }]}>Guardrail Weights</Text>
            <Text style={[styles.settingsDesc, { color: theme.textTertiary }]} numberOfLines={1}>
              Customize how your MES is calculated
            </Text>
          </View>
          <Ionicons name={showBudgetEditor ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textTertiary} />
        </TouchableOpacity>

        {showBudgetEditor && (
          <View style={[styles.budgetEditor, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            {[
              { label: 'Protein', color: '#22C55E', value: proteinW, set: setProteinW },
              { label: 'Fiber', color: '#3B82F6', value: fiberW, set: setFiberW },
              { label: 'Sugar (penalty)', color: '#F59E0B', value: sugarW, set: setSugarW },
            ].map((item) => (
              <View key={item.label}>
                <View style={styles.sliderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
                    <Text style={[styles.sliderLabel, { color: theme.text }]}>{item.label}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => item.set(Math.max(0.1, Math.round((item.value - 0.05) * 100) / 100))}
                      style={[styles.stepperBtn, { backgroundColor: theme.surfaceHighlight }]}
                    >
                      <Ionicons name="remove" size={16} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.sliderValue, { color: item.color, minWidth: 36, textAlign: 'center' }]}>{Math.round(item.value * 100)}%</Text>
                    <TouchableOpacity
                      onPress={() => item.set(Math.min(0.8, Math.round((item.value + 0.05) * 100) / 100))}
                      style={[styles.stepperBtn, { backgroundColor: theme.surfaceHighlight }]}
                    >
                      <Ionicons name="add" size={16} color={theme.text} />
                    </TouchableOpacity>
                  </View>
                </View>
                {/* Visual bar */}
                <View style={{ height: 4, backgroundColor: theme.surfaceHighlight, borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${Math.round(item.value * 100)}%`, backgroundColor: item.color, borderRadius: 2 }} />
                </View>
              </View>
            ))}

            <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, marginTop: Spacing.md, textAlign: 'center' }}>
              Weights auto-normalize to 100%. Higher weight = more impact on your score.
            </Text>

            <TouchableOpacity
              onPress={saveBudgetWeights}
              style={{ backgroundColor: theme.primary, paddingVertical: Spacing.sm + 2, borderRadius: BorderRadius.full, marginTop: Spacing.md, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: FontSize.sm, fontWeight: '700' }}>Save Weights</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Metabolic Profile ────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.xxl }]}>
          Metabolic Profile
        </Text>

        {!profile?.onboarding_step_completed ? (
          <TouchableOpacity
            activeOpacity={0.75}
            style={[styles.settingsRow, { borderBottomColor: theme.border }]}
            onPress={() => router.push('/metabolic-onboarding')}
          >
            <View style={[styles.settingsIcon, { backgroundColor: 'rgba(139,92,246,0.12)' }]}>
              <Ionicons name="person-add" size={18} color="#8B5CF6" />
            </View>
            <View style={styles.settingsInfo}>
              <Text style={[styles.settingsLabel, { color: theme.text }]}>Set Up Profile</Text>
              <Text style={[styles.settingsDesc, { color: theme.textTertiary }]} numberOfLines={1}>
                Personalize your metabolic scoring
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        ) : (
          <>
            {/* Body & Activity summary */}
            <TouchableOpacity
              activeOpacity={0.75}
              style={[styles.settingsRow, { borderBottomColor: theme.border }]}
              onPress={() => router.push('/metabolic-onboarding')}
            >
              <View style={[styles.settingsIcon, { backgroundColor: 'rgba(139,92,246,0.12)' }]}>
                <Ionicons name="body" size={18} color="#8B5CF6" />
              </View>
              <View style={styles.settingsInfo}>
                <Text style={[styles.settingsLabel, { color: theme.text }]}>Body & Activity</Text>
                <Text style={[styles.settingsDesc, { color: theme.textTertiary }]} numberOfLines={1}>
                  {profile.weight_lb ? `${profile.weight_lb} lbs` : ''}
                  {profile.height_ft ? ` · ${profile.height_ft}′${profile.height_in ?? 0}″` : ''}
                  {profile.activity_level ? ` · ${profile.activity_level}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </TouchableOpacity>

            {/* Body Composition */}
            <TouchableOpacity
              activeOpacity={0.75}
              style={[styles.settingsRow, { borderBottomColor: theme.border }]}
              onPress={() => router.push('/metabolic-onboarding')}
            >
              <View style={[styles.settingsIcon, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
                <Ionicons name="fitness" size={18} color="#22C55E" />
              </View>
              <View style={styles.settingsInfo}>
                <Text style={[styles.settingsLabel, { color: theme.text }]}>Body Composition</Text>
                <Text style={[styles.settingsDesc, { color: theme.textTertiary }]} numberOfLines={1}>
                  {profile.body_fat_pct ? `${profile.body_fat_pct}% body fat` : 'Not set — default ISM'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </TouchableOpacity>

            {/* Health Profile */}
            <TouchableOpacity
              activeOpacity={0.75}
              style={[styles.settingsRow, { borderBottomColor: theme.border }]}
              onPress={() => router.push('/metabolic-onboarding')}
            >
              <View style={[styles.settingsIcon, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                <Ionicons name="heart" size={18} color="#EF4444" />
              </View>
              <View style={styles.settingsInfo}>
                <Text style={[styles.settingsLabel, { color: theme.text }]}>Health Context</Text>
                <Text style={[styles.settingsDesc, { color: theme.textTertiary }]} numberOfLines={1}>
                  {[
                    profile.insulin_resistant && 'IR',
                    profile.prediabetes && 'Prediabetes',
                    profile.type_2_diabetes && 'T2D',
                  ].filter(Boolean).join(', ') || 'No conditions set'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </TouchableOpacity>
          </>
        )}

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
  budgetEditor: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  sliderLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  sliderValue: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
