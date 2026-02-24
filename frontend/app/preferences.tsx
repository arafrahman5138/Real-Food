import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { ChipSelector } from '../components/ChipSelector';
import { Button } from '../components/Button';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../services/api';
import {
  ALLERGY_OPTIONS,
  DIETARY_OPTIONS,
  DISLIKED_INGREDIENT_OPTIONS,
  FLAVOR_OPTIONS,
  PROTEIN_OPTIONS,
} from '../constants/Config';
import { BorderRadius, FontSize, Spacing } from '../constants/Colors';

type SectionKey =
  | 'dietary'
  | 'flavor'
  | 'allergies'
  | 'disliked'
  | 'liked_proteins'
  | 'disliked_proteins'
  | 'household';

function normalizeSection(value: string | string[] | undefined): SectionKey | null {
  const val = Array.isArray(value) ? value[0] : value;
  if (!val) return null;
  const allowed: SectionKey[] = [
    'dietary',
    'flavor',
    'allergies',
    'disliked',
    'liked_proteins',
    'disliked_proteins',
    'household',
  ];
  return allowed.includes(val as SectionKey) ? (val as SectionKey) : null;
}

export default function PreferencesScreen() {
  const theme = useTheme();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const activeSection = normalizeSection(section);

  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [dietary, setDietary] = useState<string[]>(user?.dietary_preferences || []);
  const [flavor, setFlavor] = useState<string[]>(user?.flavor_preferences || []);
  const [allergies, setAllergies] = useState<string[]>(user?.allergies || []);
  const [disliked, setDisliked] = useState<string[]>(user?.disliked_ingredients || []);
  const [likedProteins, setLikedProteins] = useState<string[]>(user?.protein_preferences?.liked || []);
  const [dislikedProteins, setDislikedProteins] = useState<string[]>(user?.protein_preferences?.disliked || []);
  const [householdSize, setHouseholdSize] = useState<number>(Math.max(1, user?.household_size || 1));
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => {
    const map: Record<SectionKey, string> = {
      dietary: 'Dietary Preferences',
      flavor: 'Flavor Profile',
      allergies: 'Allergies',
      disliked: 'Disliked Ingredients',
      liked_proteins: 'Liked Proteins',
      disliked_proteins: 'Proteins to Avoid',
      household: 'Household Size',
    };
    return activeSection ? map[activeSection] : 'Edit Preferences';
  }, [activeSection]);

  const toggle = (arr: string[], setter: (next: string[]) => void, id: string) => {
    setter(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };

  const toggleProtein = (
    arr: string[],
    setter: (next: string[]) => void,
    otherArr: string[],
    otherSetter: (next: string[]) => void,
    id: string
  ) => {
    if (arr.includes(id)) {
      setter(arr.filter((x) => x !== id));
      return;
    }
    setter([...arr, id]);
    if (otherArr.includes(id)) {
      otherSetter(otherArr.filter((x) => x !== id));
    }
  };

  const saveChanges = async () => {
    setLoading(true);
    try {
      const payload: any = {};
      switch (activeSection) {
        case 'dietary':
          payload.dietary_preferences = dietary;
          break;
        case 'flavor':
          payload.flavor_preferences = flavor;
          break;
        case 'allergies':
          payload.allergies = allergies;
          break;
        case 'disliked':
          payload.disliked_ingredients = disliked;
          break;
        case 'liked_proteins':
        case 'disliked_proteins':
          payload.protein_preferences = { liked: likedProteins, disliked: dislikedProteins };
          break;
        case 'household':
          payload.household_size = Math.max(1, householdSize);
          break;
        default:
          payload.dietary_preferences = dietary;
          payload.flavor_preferences = flavor;
          payload.allergies = allergies;
          payload.disliked_ingredients = disliked;
          payload.protein_preferences = { liked: likedProteins, disliked: dislikedProteins };
          payload.household_size = Math.max(1, householdSize);
      }

      await authApi.updatePreferences(payload);
      const profile = await authApi.getProfile();
      setUser(profile);
      router.back();
    } catch (err: any) {
      Alert.alert('Update failed', err?.message || 'Could not save preferences.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Update your settings and save.</Text>

        {(!activeSection || activeSection === 'dietary') && (
          <ChipSelector
            label="Dietary preferences"
            options={DIETARY_OPTIONS}
            selected={dietary}
            onToggle={(id) => toggle(dietary, setDietary, id)}
          />
        )}

        {(!activeSection || activeSection === 'flavor') && (
          <ChipSelector
            label="Flavor profile"
            options={FLAVOR_OPTIONS}
            selected={flavor}
            onToggle={(id) => toggle(flavor, setFlavor, id)}
          />
        )}

        {(!activeSection || activeSection === 'allergies') && (
          <ChipSelector
            label="Allergies"
            options={ALLERGY_OPTIONS}
            selected={allergies}
            onToggle={(id) => toggle(allergies, setAllergies, id)}
          />
        )}

        {(!activeSection || activeSection === 'disliked') && (
          <ChipSelector
            label="Disliked ingredients"
            options={DISLIKED_INGREDIENT_OPTIONS}
            selected={disliked}
            onToggle={(id) => toggle(disliked, setDisliked, id)}
          />
        )}

        {(!activeSection || activeSection === 'liked_proteins' || activeSection === 'disliked_proteins') && (
          <>
            <ChipSelector
              label="Proteins you like"
              options={PROTEIN_OPTIONS}
              selected={likedProteins}
              onToggle={(id) =>
                toggleProtein(likedProteins, setLikedProteins, dislikedProteins, setDislikedProteins, id)
              }
            />
            <ChipSelector
              label="Proteins to avoid"
              options={PROTEIN_OPTIONS}
              selected={dislikedProteins}
              onToggle={(id) =>
                toggleProtein(dislikedProteins, setDislikedProteins, likedProteins, setLikedProteins, id)
              }
            />
          </>
        )}

        {(!activeSection || activeSection === 'household') && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.text }]}>Household size</Text>
            <View style={[styles.stepper, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setHouseholdSize((n) => Math.max(1, n - 1))}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={18} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.stepValue, { color: theme.text }]}>{householdSize}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setHouseholdSize((n) => Math.min(20, n + 1))}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={() => router.back()} disabled={loading} />
          <Button title="Save" onPress={saveChanges} loading={loading} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxl,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
    fontSize: FontSize.sm,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  stepper: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    width: 170,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
  actions: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
