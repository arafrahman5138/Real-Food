import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { recipeApi } from '../../services/api';
import { useSavedRecipesStore } from '../../stores/savedRecipesStore';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';
import { HEALTH_BENEFIT_OPTIONS, CUISINE_OPTIONS } from '../../constants/Config';

interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
  category?: string;
}

interface RecipeDetail {
  id: string;
  title: string;
  description: string;
  cuisine: string;
  ingredients: Ingredient[];
  steps: string[];
  prep_time_min: number;
  cook_time_min: number;
  total_time_min: number;
  servings: number;
  difficulty: string;
  nutrition_info: Record<string, number>;
  flavor_profile: string[];
  dietary_tags: string[];
  health_benefits: string[];
  tags: string[];
}

const CUISINE_EMOJI: Record<string, string> = {
  indian: '🇮🇳', thai: '🇹🇭', korean: '🇰🇷', mexican: '🇲🇽',
  ethiopian: '🇪🇹', middle_eastern: '🕌', west_african: '🌍',
  caribbean: '🏝️', japanese: '🇯🇵', chinese: '🇨🇳', vietnamese: '🇻🇳',
  moroccan: '🇲🇦', indonesian: '🇮🇩', peruvian: '🇵🇪',
  mediterranean: '🫒', turkish: '🇹🇷', american: '🇺🇸',
};

const MACRO_COLORS = {
  protein: '#22C55E',
  carbs: '#3B82F6',
  fat: '#F59E0B',
  fiber: '#8B5CF6',
};

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const { isSaved, saveRecipe, removeRecipe } = useSavedRecipesStore();
  const saved = id ? isSaved(id) : false;

  useEffect(() => {
    if (id) {
      recipeApi
        .getDetail(id)
        .then(setRecipe)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [id]);

  const toggleIngredient = (index: number) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const getBenefitInfo = (hbId: string) =>
    HEALTH_BENEFIT_OPTIONS.find((h) => h.id === hbId);

  const getCuisineLabel = (cId: string) =>
    CUISINE_OPTIONS.find((c) => c.id === cId)?.label || cId.replace('_', ' ');

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.textTertiary} />
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>Recipe not found</Text>
      </View>
    );
  }

  const nutrition = recipe.nutrition_info || {};
  const macros = [
    { label: 'Protein', value: nutrition.protein, unit: 'g', color: MACRO_COLORS.protein },
    { label: 'Carbs', value: nutrition.carbs, unit: 'g', color: MACRO_COLORS.carbs },
    { label: 'Fat', value: nutrition.fat, unit: 'g', color: MACRO_COLORS.fat },
    { label: 'Fiber', value: nutrition.fiber, unit: 'g', color: MACRO_COLORS.fiber },
  ].filter((m) => m.value !== undefined);

  const micronutrients = Object.entries(nutrition)
    .filter(([key]) => key.endsWith('_pct') || key.endsWith('_mg'))
    .map(([key, value]) => {
      const name = key
        .replace('_pct', '')
        .replace('_mg', '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const unit = key.endsWith('_mg') ? 'mg' : '% DV';
      return { name, value, unit };
    })
    .filter((m) => m.value > 0);

  const goodForSummary = recipe.health_benefits
    ?.slice(0, 4)
    .map((hb) => getBenefitInfo(hb)?.label || hb.replace('_', ' '))
    .join(', ');

  return (
    <>
      <Stack.Screen options={{ headerTitle: recipe.title.length > 24 ? recipe.title.slice(0, 24) + '...' : recipe.title }} />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.cuisineBadge, { backgroundColor: theme.primaryMuted }]}>
            <Text style={styles.cuisineEmoji}>{CUISINE_EMOJI[recipe.cuisine] || '🍽️'}</Text>
            <Text style={[styles.cuisineText, { color: theme.primary }]}>
              {getCuisineLabel(recipe.cuisine)}
            </Text>
          </View>

          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.text, flex: 1 }]}>{recipe.title}</Text>
            <TouchableOpacity
              onPress={() => (saved ? removeRecipe(id!) : saveRecipe(id!))}
              activeOpacity={0.7}
              style={[styles.saveBtn, { backgroundColor: saved ? theme.primaryMuted : theme.surfaceElevated }]}
            >
              <Ionicons
                name={saved ? 'bookmark' : 'bookmark-outline'}
                size={22}
                color={saved ? theme.primary : theme.textSecondary}
              />
            </TouchableOpacity>
          </View>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {recipe.description}
          </Text>

          {/* Meta Row */}
          <View style={styles.metaRow}>
            <View style={[styles.metaBox, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="time-outline" size={18} color={theme.primary} />
              <Text style={[styles.metaValue, { color: theme.text }]}>{recipe.total_time_min}m</Text>
              <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>Total</Text>
            </View>
            <View style={[styles.metaBox, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="flame-outline" size={18} color={theme.accent} />
              <Text style={[styles.metaValue, { color: theme.text }]}>{nutrition.calories || '-'}</Text>
              <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>Calories</Text>
            </View>
            <View style={[styles.metaBox, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="people-outline" size={18} color={theme.info} />
              <Text style={[styles.metaValue, { color: theme.text }]}>{recipe.servings}</Text>
              <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>Servings</Text>
            </View>
            <View style={[styles.metaBox, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="speedometer-outline" size={18} color={theme.warning} />
              <Text style={[styles.metaValue, { color: theme.text }]}>{recipe.difficulty}</Text>
              <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>Level</Text>
            </View>
          </View>

          {/* Flavor & Dietary Tags */}
          {(recipe.flavor_profile?.length > 0 || recipe.dietary_tags?.length > 0) && (
            <View style={styles.tagRow}>
              {recipe.flavor_profile?.map((f) => (
                <View key={f} style={[styles.tag, { backgroundColor: theme.accentMuted }]}>
                  <Text style={[styles.tagText, { color: theme.accent }]}>{f}</Text>
                </View>
              ))}
              {recipe.dietary_tags?.map((d) => (
                <View key={d} style={[styles.tag, { backgroundColor: theme.infoMuted }]}>
                  <Text style={[styles.tagText, { color: theme.info }]}>{d}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Good For / Health Benefits */}
        {recipe.health_benefits?.length > 0 && (
          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Good For</Text>
            {goodForSummary && (
              <Text style={[styles.goodForSummary, { color: theme.textSecondary }]}>
                This meal supports {goodForSummary}.
              </Text>
            )}
            <View style={styles.benefitGrid}>
              {recipe.health_benefits.map((hb) => {
                const info = getBenefitInfo(hb);
                return (
                  <View
                    key={hb}
                    style={[styles.benefitCard, { backgroundColor: (info?.color || '#666') + '14' }]}
                  >
                    <Ionicons
                      name={(info?.icon as any) || 'leaf'}
                      size={20}
                      color={info?.color || '#666'}
                    />
                    <Text style={[styles.benefitLabel, { color: info?.color || '#666' }]}>
                      {info?.label || hb}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Nutrition Breakdown */}
        {(macros.length > 0 || micronutrients.length > 0) && (
          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Nutrition</Text>

            {/* Macros */}
            {macros.length > 0 && (
              <View style={styles.macroRow}>
                {macros.map((m) => (
                  <View key={m.label} style={styles.macroItem}>
                    <View style={[styles.macroCircle, { borderColor: m.color }]}>
                      <Text style={[styles.macroValue, { color: m.color }]}>{m.value}</Text>
                      <Text style={[styles.macroUnit, { color: m.color }]}>{m.unit}</Text>
                    </View>
                    <Text style={[styles.macroLabel, { color: theme.textSecondary }]}>{m.label}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Micronutrients */}
            {micronutrients.length > 0 && (
              <View style={styles.microSection}>
                <Text style={[styles.microTitle, { color: theme.textSecondary }]}>
                  Vitamins & Minerals
                </Text>
                {micronutrients.map((m) => (
                  <View key={m.name} style={styles.microRow}>
                    <Text style={[styles.microName, { color: theme.text }]}>{m.name}</Text>
                    <View style={styles.microBarContainer}>
                      <View
                        style={[
                          styles.microBar,
                          {
                            backgroundColor: theme.primary,
                            width: `${Math.min(m.value, 100)}%`,
                          },
                        ]}
                      />
                      <View style={[styles.microBarBg, { backgroundColor: theme.surfaceHighlight }]} />
                    </View>
                    <Text style={[styles.microValue, { color: theme.textSecondary }]}>
                      {m.value}{m.unit}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Ingredients */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Ingredients ({recipe.ingredients.length})
          </Text>
          {recipe.ingredients.map((ing, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.ingredientRow}
              onPress={() => toggleIngredient(idx)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: checkedIngredients.has(idx) ? theme.primary : theme.border,
                    backgroundColor: checkedIngredients.has(idx) ? theme.primary : 'transparent',
                  },
                ]}
              >
                {checkedIngredients.has(idx) && (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                )}
              </View>
              <Text
                style={[
                  styles.ingredientText,
                  {
                    color: checkedIngredients.has(idx) ? theme.textTertiary : theme.text,
                    textDecorationLine: checkedIngredients.has(idx) ? 'line-through' : 'none',
                  },
                ]}
              >
                {ing.quantity} {ing.unit} {ing.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Steps */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          <View style={styles.stepHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Steps</Text>
            <TouchableOpacity
              style={[styles.cookModeBtn, { backgroundColor: theme.primaryMuted }]}
              onPress={() => router.push(`/cook/${recipe.id}`)}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles" size={13} color={theme.primary} />
              <Text style={[styles.cookModeBtnText, { color: theme.primary }]}>Open Cook Mode</Text>
            </TouchableOpacity>
          </View>
          {recipe.steps.map((step, idx) => (
            <View key={idx} style={styles.stepRow}>
              <View style={[styles.stepNumber, { backgroundColor: theme.primaryMuted }]}>
                <Text style={[styles.stepNumberText, { color: theme.primary }]}>{idx + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: theme.text }]}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: Spacing.huge }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.huge,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.md,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  cuisineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  cuisineEmoji: {
    fontSize: 16,
  },
  cuisineText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    lineHeight: 30,
  },
  saveBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  description: {
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  metaBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  metaValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  metaLabel: {
    fontSize: FontSize.xs,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  tag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  tagText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  section: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    marginBottom: Spacing.md,
  },
  goodForSummary: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  benefitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  benefitLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.lg,
  },
  macroItem: {
    alignItems: 'center',
    gap: 6,
  },
  macroCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroValue: {
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  macroUnit: {
    fontSize: 9,
    fontWeight: '600',
  },
  macroLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  microSection: {
    gap: Spacing.sm,
  },
  microTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  microRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  microName: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    width: 80,
  },
  microBarContainer: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  microBarBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  microBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 3,
    zIndex: 1,
  },
  microValue: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    width: 55,
    textAlign: 'right',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingredientText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  cookModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  cookModeBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  stepRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumberText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: 22,
  },
});
