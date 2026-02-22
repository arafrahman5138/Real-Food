import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/Button';
import { ChipSelector } from '../../components/ChipSelector';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';
import { authApi } from '../../services/api';
import { ALLERGY_OPTIONS, DIETARY_OPTIONS, FLAVOR_OPTIONS } from '../../constants/Config';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

type Step = 0 | 1 | 2;

export default function OnboardingScreen() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [step, setStep] = useState<Step>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [flavors, setFlavors] = useState<string[]>(user?.flavor_preferences || []);
  const [dietary, setDietary] = useState<string[]>(user?.dietary_preferences || []);
  const [allergies, setAllergies] = useState<string[]>(user?.allergies || []);

  const title = useMemo(() => {
    if (step === 0) return 'Let\'s tune your flavor profile';
    if (step === 1) return 'Any dietary goals or restrictions?';
    return 'Final check: allergies';
  }, [step]);

  const subtitle = useMemo(() => {
    if (step === 0) return 'Pick 2–4 flavors so meal plans feel personal.';
    if (step === 1) return 'Choose what applies now. You can edit later in Profile.';
    return 'We’ll use this to keep recommendations safe.';
  }, [step]);

  const toggle = (arr: string[], setter: (next: string[]) => void, id: string) => {
    setter(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };

  const canContinue =
    (step === 0 && flavors.length > 0) ||
    (step === 1 && dietary.length > 0) ||
    step === 2;

  const finishOnboarding = async () => {
    setLoading(true);
    setError('');
    try {
      await authApi.updatePreferences({
        flavor_preferences: flavors,
        dietary_preferences: dietary,
        allergies,
      });
      const profile = await authApi.getProfile();
      setUser(profile);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err?.message || 'Could not save preferences.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.badge, { backgroundColor: theme.primaryMuted }]}> 
          <Ionicons name="sparkles" size={14} color={theme.primary} />
          <Text style={[styles.badgeText, { color: theme.primary }]}>2-minute setup</Text>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>

        <View style={[styles.progressBg, { backgroundColor: theme.surfaceHighlight }]}> 
          <View
            style={[
              styles.progressFill,
              { backgroundColor: theme.primary, width: `${((step + 1) / 3) * 100}%` },
            ]}
          />
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.errorMuted }]}> 
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          </View>
        ) : null}

        {step === 0 && (
          <ChipSelector
            label="Flavor preferences"
            options={FLAVOR_OPTIONS}
            selected={flavors}
            onToggle={(id) => toggle(flavors, setFlavors, id)}
          />
        )}

        {step === 1 && (
          <ChipSelector
            label="Dietary preferences"
            options={DIETARY_OPTIONS}
            selected={dietary}
            onToggle={(id) => toggle(dietary, setDietary, id)}
          />
        )}

        {step === 2 && (
          <ChipSelector
            label="Allergies"
            options={ALLERGY_OPTIONS}
            selected={allergies}
            onToggle={(id) => toggle(allergies, setAllergies, id)}
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}> 
        <Button
          title="Back"
          variant="ghost"
          onPress={() => setStep((s) => (s === 0 ? 0 : ((s - 1) as Step)))}
          disabled={step === 0 || loading}
        />
        {step < 2 ? (
          <Button
            title="Continue"
            onPress={() => setStep((s) => (s === 2 ? 2 : ((s + 1) as Step)))}
            disabled={!canContinue || loading}
          />
        ) : (
          <Button title="Finish setup" onPress={finishOnboarding} loading={loading} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.xl,
    paddingTop: Spacing.huge,
    paddingBottom: Spacing.huge,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    lineHeight: 42,
  },
  subtitle: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  progressBg: {
    height: 6,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  errorBox: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
