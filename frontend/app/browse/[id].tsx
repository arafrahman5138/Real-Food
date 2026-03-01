import React, { useEffect, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import LogoHeader from '../../components/LogoHeader';
import { nutritionApi, recipeApi, gameApi } from '../../services/api';
import { useSavedRecipesStore } from '../../stores/savedRecipesStore';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';
import { HEALTH_BENEFIT_OPTIONS } from '../../constants/Config';

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

const MACRO_COLORS = {
  protein: '#22C55E',
  carbs: '#3B82F6',
  fat: '#F59E0B',
  fiber: '#8B5CF6',
};

const INGREDIENT_CATEGORIES: Record<string, { label: string; icon: string; color: string; order: number }> = {
  protein: { label: 'Protein', icon: 'fish-outline', color: '#EF4444', order: 0 },
  produce: { label: 'Produce', icon: 'leaf-outline', color: '#22C55E', order: 1 },
  dairy:   { label: 'Dairy', icon: 'water-outline', color: '#3B82F6', order: 2 },
  grains:  { label: 'Grains', icon: 'nutrition-outline', color: '#F59E0B', order: 3 },
  fats:    { label: 'Fats & Oils', icon: 'flask-outline', color: '#A855F7', order: 4 },
  spices:  { label: 'Spices & Seasonings', icon: 'flame-outline', color: '#F97316', order: 5 },
  sweetener: { label: 'Sweeteners', icon: 'cafe-outline', color: '#EC4899', order: 6 },
  other:   { label: 'Other', icon: 'cube-outline', color: '#6B7280', order: 7 },
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [modifiedRecipe, setModifiedRecipe] = useState<RecipeDetail | null>(null);
  const [swaps, setSwaps] = useState<{ original: string; replacement: string; reason: string }[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [customizing, setCustomizing] = useState(false);
  const [useAllergies, setUseAllergies] = useState(true);
  const [useDislikes, setUseDislikes] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loggingMeal, setLoggingMeal] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const { isSaved, saveRecipe, removeRecipe } = useSavedRecipesStore();
  const saved = id ? isSaved(id) : false;

  useEffect(() => {
    if (id) {
      recipeApi
        .getDetail(id)
        .then((data) => {
          setRecipe(data);
          // Award XP for browsing a recipe detail (fire-and-forget)
          gameApi.awardXP(5, 'browse_recipe').catch(() => {});
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [id]);

  const toggleIngredient = (index: number, categoryKey: string, groupIndices: number[]) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      // Auto-collapse when all items in this category are checked
      const allChecked = groupIndices.every((i) => next.has(i));
      if (allChecked) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setCollapsedCategories((p) => new Set(p).add(categoryKey));
      }
      return next;
    });
  };

  const toggleCategory = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getBenefitInfo = (hbId: string) =>
    HEALTH_BENEFIT_OPTIONS.find((h) => h.id === hbId);

  const handleCustomizeIngredients = async () => {
    if (!id) return;
    setCustomizing(true);
    console.log('[Substitution] Starting LLM ingredient substitution for recipe:', id);
    try {
      setWarnings([]);
      const result = await recipeApi.substitute(id, {
        use_allergies: useAllergies,
        use_dislikes: useDislikes,
      });
      console.log('[Substitution] Result:', { 
        swaps: result?.swaps?.length || 0, 
        used_ai: result?.used_ai,
        warnings: result?.warnings 
      });
      setModifiedRecipe(result?.modified_recipe || null);
      setSwaps(result?.swaps || []);
      setWarnings(result?.warnings || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LLM substitution failed.';
      console.error('[Substitution] Error:', err);
      setWarnings([message]);
      setSwaps([]);
    } finally {
      setCustomizing(false);
    }
  };

  const handleLogMeal = async () => {
    const target = modifiedRecipe || recipe;
    if (!target?.id || loggingMeal) return;
    setLoggingMeal(true);
    try {
      await nutritionApi.createLog({
        source_type: 'recipe',
        source_id: target.id,
        meal_type: 'meal',
        servings: 1,
        quantity: 1,
      });
      setLogSuccess(true);
      setTimeout(() => setLogSuccess(false), 3000);
      Alert.alert(
        'Logged to Chronometer ✓',
        `"${target.title}" has been added to today's nutrition log.`,
        [
          { text: 'View Chronometer', onPress: () => router.push('/(tabs)/chronometer' as any) },
          { text: 'Stay Here', style: 'cancel' },
        ],
      );
    } catch (e) {
      console.error('Log meal failed', e);
      Alert.alert('Error', 'Failed to log meal. Please try again.');
    } finally {
      setLoggingMeal(false);
    }
  };

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

  const activeRecipe = modifiedRecipe || recipe;

  const nutrition = activeRecipe.nutrition_info || {};
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

  const goodForSummary = activeRecipe.health_benefits
    ?.slice(0, 4)
    .map((hb) => getBenefitInfo(hb)?.label || hb.replace('_', ' '))
    .join(', ');

  return (
    <>
      <Stack.Screen options={{
        headerTitle: () => <LogoHeader />,
        headerBackTitleVisible: false,
        headerLeft: () => (
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={28} color={theme.text} />
          </TouchableOpacity>
        ),
      }} />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.text, flex: 1 }]}>{activeRecipe.title}</Text>
            <TouchableOpacity
              onPress={handleLogMeal}
              activeOpacity={0.7}
              style={[styles.saveBtn, { backgroundColor: logSuccess ? theme.primaryMuted : theme.infoMuted }]}
            >
              <Ionicons
                name={loggingMeal ? 'time-outline' : logSuccess ? 'checkmark-circle' : 'add-circle-outline'}
                size={20}
                color={logSuccess ? theme.primary : theme.info}
              />
            </TouchableOpacity>
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
            {activeRecipe.description}
          </Text>

          <View style={styles.customizeRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setUseAllergies((v) => !v)}
              style={[styles.customizeChip, { backgroundColor: useAllergies ? theme.primaryMuted : theme.surfaceElevated }]}
            >
              <Text style={[styles.customizeChipText, { color: useAllergies ? theme.primary : theme.textSecondary }]}>Use allergies</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setUseDislikes((v) => !v)}
              style={[styles.customizeChip, { backgroundColor: useDislikes ? theme.primaryMuted : theme.surfaceElevated }]}
            >
              <Text style={[styles.customizeChipText, { color: useDislikes ? theme.primary : theme.textSecondary }]}>Use dislikes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleCustomizeIngredients}
              style={[styles.customizeBtn, { backgroundColor: theme.primary }]}
            >
              {customizing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={14} color="#fff" />
                  <Text style={styles.customizeBtnText}>Customize Ingredients</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {swaps.length > 0 && (
            <View style={[styles.swapBox, { backgroundColor: theme.surfaceElevated }]}> 
              <Text style={[styles.swapTitle, { color: theme.text }]}>Applied swaps</Text>
              {swaps.map((swap, idx) => (
                <Text key={`${swap.original}-${idx}`} style={[styles.swapItem, { color: theme.textSecondary }]}> 
                  {swap.original} → {swap.replacement}
                </Text>
              ))}
            </View>
          )}

          {warnings.length > 0 && (
            <View style={[styles.warningBox, { backgroundColor: theme.accentMuted }]}> 
              {warnings.map((w, idx) => (
                <Text key={idx} style={[styles.warningText, { color: theme.warning }]}>{w}</Text>
              ))}
            </View>
          )}

          {/* Meta Row */}
          <View style={styles.metaRow}>
            <View style={[styles.metaBox, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="time-outline" size={18} color={theme.primary} />
              <Text style={[styles.metaValue, { color: theme.text }]}>{activeRecipe.total_time_min}m</Text>
              <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>Total</Text>
            </View>
            <View style={[styles.metaBox, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="flame-outline" size={18} color={theme.accent} />
              <Text style={[styles.metaValue, { color: theme.text }]}>{nutrition.calories || '-'}</Text>
              <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>Calories</Text>
            </View>
            <View style={[styles.metaBox, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="people-outline" size={18} color={theme.info} />
              <Text style={[styles.metaValue, { color: theme.text }]}>{activeRecipe.servings}</Text>
              <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>Servings</Text>
            </View>
            <View style={[styles.metaBox, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="speedometer-outline" size={18} color={theme.accent} />
              <Text style={[styles.metaValue, { color: theme.text }]}>{activeRecipe.difficulty}</Text>
              <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>Level</Text>
            </View>
          </View>

          {/* Flavor & Dietary Tags */}
          {(activeRecipe.flavor_profile?.length > 0 || activeRecipe.dietary_tags?.length > 0) && (
            <View style={styles.tagRow}>
              {activeRecipe.flavor_profile?.map((f) => (
                <View key={f} style={[styles.tag, { backgroundColor: theme.accentMuted }]}>
                  <Text style={[styles.tagText, { color: theme.accent }]}>{f}</Text>
                </View>
              ))}
              {activeRecipe.dietary_tags?.map((d) => (
                <View key={d} style={[styles.tag, { backgroundColor: theme.infoMuted }]}>
                  <Text style={[styles.tagText, { color: theme.info }]}>{d}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Good For / Health Benefits */}
        {activeRecipe.health_benefits?.length > 0 && (
          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Good For</Text>
            {goodForSummary && (
              <Text style={[styles.goodForSummary, { color: theme.textSecondary }]}>
                This meal supports {goodForSummary}.
              </Text>
            )}
            <View style={styles.benefitGrid}>
              {activeRecipe.health_benefits.map((hb) => {
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
          <View style={styles.ingredientHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
              Ingredients
            </Text>
            <Text style={[styles.ingredientCounter, { color: theme.textTertiary }]}>
              {checkedIngredients.size}/{activeRecipe.ingredients.length}
            </Text>
          </View>

          {(() => {
            // Group ingredients by category
            const groups: Record<string, { ing: Ingredient; idx: number }[]> = {};
            activeRecipe.ingredients.forEach((ing, idx) => {
              const cat = ing.category && INGREDIENT_CATEGORIES[ing.category] ? ing.category : 'other';
              if (!groups[cat]) groups[cat] = [];
              groups[cat].push({ ing, idx });
            });
            const sortedKeys = Object.keys(groups).sort(
              (a, b) => (INGREDIENT_CATEGORIES[a]?.order ?? 99) - (INGREDIENT_CATEGORIES[b]?.order ?? 99)
            );

            return sortedKeys.map((catKey) => {
              const catInfo = INGREDIENT_CATEGORIES[catKey] || INGREDIENT_CATEGORIES.other;
              const items = groups[catKey];
              const groupIndices = items.map((i) => i.idx);
              const checkedCount = groupIndices.filter((i) => checkedIngredients.has(i)).length;
              const allDone = checkedCount === items.length;
              const isCollapsed = collapsedCategories.has(catKey);

              return (
                <View key={catKey} style={styles.ingredientGroup}>
                  <TouchableOpacity
                    style={styles.categoryHeader}
                    onPress={() => toggleCategory(catKey)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.categoryPill, { backgroundColor: catInfo.color + '18' }]}>
                      <Ionicons name={catInfo.icon as any} size={14} color={catInfo.color} />
                      <Text style={[styles.categoryLabel, { color: catInfo.color }]}>
                        {catInfo.label}
                      </Text>
                    </View>
                    <View style={styles.categoryRight}>
                      <Text
                        style={[
                          styles.categoryCount,
                          { color: allDone ? theme.primary : theme.textTertiary },
                        ]}
                      >
                        {checkedCount}/{items.length}
                      </Text>
                      {allDone && (
                        <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                      )}
                      <Ionicons
                        name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                        size={16}
                        color={theme.textTertiary}
                      />
                    </View>
                  </TouchableOpacity>

                  {!isCollapsed &&
                    items.map(({ ing, idx }) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.ingredientRow}
                        onPress={() => toggleIngredient(idx, catKey, groupIndices)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            {
                              borderColor: checkedIngredients.has(idx)
                                ? theme.primary
                                : theme.border,
                              backgroundColor: checkedIngredients.has(idx)
                                ? theme.primary
                                : 'transparent',
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
                              color: checkedIngredients.has(idx)
                                ? theme.textTertiary
                                : theme.text,
                              textDecorationLine: checkedIngredients.has(idx)
                                ? 'line-through'
                                : 'none',
                            },
                          ]}
                        >
                          {ing.quantity} {ing.unit} {ing.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              );
            });
          })()}
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
          {activeRecipe.steps.map((step, idx) => (
            <View key={idx} style={styles.stepRow}>
              <View style={[styles.stepNumber, { backgroundColor: theme.primaryMuted }]}>
                <Text style={[styles.stepNumberText, { color: theme.primary }]}>{idx + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: theme.text }]}>{step.replace(/^Step\s*\d+\s*:\s*/i, '')}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky Log to Chronometer bar */}
      <View style={[styles.logBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.logBarBtn,
            { backgroundColor: logSuccess ? theme.primaryMuted : theme.primary },
          ]}
          onPress={handleLogMeal}
          disabled={loggingMeal}
          activeOpacity={0.8}
        >
          {loggingMeal ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons
                name={logSuccess ? 'checkmark-circle' : 'nutrition-outline'}
                size={18}
                color={logSuccess ? theme.primary : '#fff'}
              />
              <Text style={[styles.logBarText, logSuccess && { color: theme.primary }]}>
                {logSuccess ? 'Logged to Chronometer ✓' : 'Log to Chronometer'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
  customizeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  customizeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  customizeChipText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  customizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  customizeBtnText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  swapBox: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 6,
  },
  swapTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  swapItem: {
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  warningBox: {
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 4,
  },
  warningText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
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
  ingredientHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  ingredientCounter: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  ingredientGroup: {
    marginBottom: Spacing.sm,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    marginBottom: 2,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  categoryLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryCount: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.sm,
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
  logBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
  },
  logBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: BorderRadius.md,
  },
  logBarText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
