import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Card } from '../../components/GradientCard';
import { MetabolicRing } from '../../components/MetabolicRing';
import { EnergyBudgetCard } from '../../components/EnergyBudgetCard';
import { MealMESBadge } from '../../components/MealMESBadge';
import { MealScoreSheet } from '../../components/MealScoreSheet';
import { SingleMealRow } from '../../components/CompositeMealCard';
import { EnergyHistoryChart } from '../../components/EnergyHistoryChart';
import { MetabolicStreakBadge } from '../../components/MetabolicStreakBadge';
import { MetabolicCoach } from '../../components/MetabolicCoach';
import { NutriScoreHeroCard } from '../../components/NutriScoreHeroCard';
import { useTheme } from '../../hooks/useTheme';
import { nutritionApi, metabolicApi, recipeApi } from '../../services/api';
import type { MealSuggestion } from '../../components/MetabolicCoach';
import { useGamificationStore, type ScoreHistoryEntry } from '../../stores/gamificationStore';
import { useMetabolicBudgetStore, getTierConfig } from '../../stores/metabolicBudgetStore';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';
import { NUTRITION_TIERS } from '../../constants/Config';

// ── Types ──────────────────────────────────────────────────────────────

interface NutrientComparison {
  consumed: number;
  target: number;
  pct: number;
}

interface DailyLog {
  id: string;
  title: string;
  meal_type?: string;
  source_type?: string;
  source_id?: string | null;
  group_id?: string | null;
  group_mes_score?: number | null;
  group_mes_tier?: string | null;
  nutrition?: Record<string, number>;
  nutrition_snapshot?: Record<string, number>;
  [key: string]: unknown;
}

interface DailySummary {
  daily_score: number;
  comparison: Record<string, NutrientComparison>;
  logs: DailyLog[];
}

interface RecommendedFood {
  food_id?: string;
  name: string;
  for: string;
  nutrition_info?: Record<string, number>;
}

interface RecommendedMeal {
  recipe_id?: string;
  title: string;
  for: string;
}

interface LowNutrient {
  key: string;
  pct: number;
}

interface NutritionGaps {
  recommended_foods: RecommendedFood[];
  recommended_meals: RecommendedMeal[];
  low_nutrients: LowNutrient[];
}

interface SelectedNutrient {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  pct: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const MACROS = [
  { key: 'protein', label: 'Protein', unit: 'g', icon: 'barbell-outline' as const },
  { key: 'carbs', label: 'Carbs', unit: 'g', icon: 'flash-outline' as const },
  { key: 'fat', label: 'Fat', unit: 'g', icon: 'water-outline' as const },
  { key: 'fiber', label: 'Fiber', unit: 'g', icon: 'leaf-outline' as const },
];

const microIcon = (name: string) => {
  const key = name.toLowerCase();
  if (key.includes('vitamin d') || key.includes('calcium')) return 'body-outline';
  if (key.includes('omega') || key.includes('potassium')) return 'heart-outline';
  if (key.includes('vitamin b') || key.includes('magnesium')) return 'sparkles-outline';
  if (key.includes('vitamin c') || key.includes('zinc')) return 'shield-checkmark-outline';
  return 'ellipse-outline';
};

const formatMicronutrientLabel = (key: string) =>
  key
    .replace(/_(mg|mcg|g)$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (s: string) => s.toUpperCase());

const micronutrientUnit = (key: string) => {
  if (key.endsWith('_mg')) return 'mg';
  if (key.endsWith('_mcg')) return 'mcg';
  if (key.endsWith('_g')) return 'g';
  return '';
};

function NutritionRing({ score, size = 140, strokeWidth = 8 }: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const theme = useTheme();
  const clampedScore = Math.min(100, Math.max(0, score));
  const displayScore = clampedScore % 1 === 0 ? clampedScore.toFixed(0) : clampedScore.toFixed(1);
  const ringSize = size;
  const scoreFontSize = Math.round(ringSize * 0.26);
  const trackColor = theme.text === '#FFFFFF' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const arcColor = clampedScore >= 60 ? '#22C55E' : clampedScore >= 30 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ width: ringSize, height: ringSize }}>
      {/* Track */}
      <View
        style={{
          position: 'absolute',
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: strokeWidth,
          borderColor: trackColor,
        }}
      />
      {/* Progress arc */}
      {clampedScore > 0 && (
        <View
          style={{
            position: 'absolute',
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderWidth: strokeWidth,
            borderColor: 'transparent',
            borderTopColor: arcColor,
            borderRightColor: clampedScore > 25 ? arcColor : 'transparent',
            borderBottomColor: clampedScore > 50 ? arcColor : 'transparent',
            borderLeftColor: clampedScore > 75 ? arcColor : 'transparent',
            transform: [{ rotate: '-45deg' }],
          }}
        />
      )}
      {/* Centered score — absolute fill guarantees perfect centering */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontSize: scoreFontSize,
            fontWeight: '800',
            color: theme.text,
            textAlign: 'center',
            fontVariant: ['tabular-nums'],
            includeFontPadding: false,
            letterSpacing: -0.3,
          }}
        >
          {displayScore}
        </Text>
      </View>
    </View>
  );
}

export default function ChronometerScreen() {
  const theme = useTheme();
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [gaps, setGaps] = useState<NutritionGaps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNutrient, setSelectedNutrient] = useState<SelectedNutrient | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [viewMode, setViewMode] = useState<'metabolic' | 'nutrient'>('metabolic');
  const [mesSuggestions, setMesSuggestions] = useState<MealSuggestion[]>([]);
  const [scoreSheetMeal, setScoreSheetMeal] = useState<{ title: string; score: any } | null>(null);
  const [currentRecipeMesMap, setCurrentRecipeMesMap] = useState<Record<string, { score: number; tier: string }>>({});

  // Metabolic Energy Score state
  const dailyMES = useMetabolicBudgetStore((s) => s.dailyScore);
  const mesBudget = useMetabolicBudgetStore((s) => s.budget);
  const mealScores = useMetabolicBudgetStore((s) => s.mealScores);
  const fetchCompositeMES = useMetabolicBudgetStore((s) => s.fetchCompositeMES);
  const remainingBudget = useMetabolicBudgetStore((s) => s.remainingBudget);
  const mesHistory = useMetabolicBudgetStore((s) => s.scoreHistory);
  const metabolicStreak = useMetabolicBudgetStore((s) => s.streak);
  const metabolicProfile = useMetabolicBudgetStore((s) => s.profile);
  const fetchProfile = useMetabolicBudgetStore((s) => s.fetchProfile);
  const fetchMetabolic = useMetabolicBudgetStore((s) => s.fetchAll);
  const hasCoreProfileSetup = !!(
    metabolicProfile
    && metabolicProfile.sex
    && metabolicProfile.goal
    && metabolicProfile.activity_level
    && metabolicProfile.weight_lb != null
    && (
      metabolicProfile.height_cm != null
      || metabolicProfile.height_ft != null
    )
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, gapData, , mesSuggestionsData] = await Promise.all([
        nutritionApi.getDaily(),
        nutritionApi.getGaps(),
        fetchMetabolic(),
        metabolicApi.getMealSuggestions(undefined, 4).catch(() => [] as MealSuggestion[]),
        fetchProfile(),
      ]);
      setDaily(data);
      setGaps(gapData);
      setMesSuggestions(mesSuggestionsData || []);
      // Also refresh nutrition streak + score history
      fetchNutritionStreak();
      fetchScoreHistory();
    } catch (e: any) {
      setError(e?.message || 'Unable to load nutrition data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const score = daily?.daily_score ?? 0;

  // Nutrition streaks & score history from gamification store
  const nutritionStreak = useGamificationStore((s) => s.nutritionStreak);
  const nutritionLongestStreak = useGamificationStore((s) => s.nutritionLongestStreak);
  const scoreHistory = useGamificationStore((s) => s.scoreHistory);
  const fetchNutritionStreak = useGamificationStore((s) => s.fetchNutritionStreak);
  const fetchScoreHistory = useGamificationStore((s) => s.fetchScoreHistory);

  // Determine today's tier
  const todayTier = score >= NUTRITION_TIERS.GOLD.min ? NUTRITION_TIERS.GOLD
    : score >= NUTRITION_TIERS.SILVER.min ? NUTRITION_TIERS.SILVER
    : score >= NUTRITION_TIERS.BRONZE.min ? NUTRITION_TIERS.BRONZE
    : null;

  const macros = useMemo(() => {
    const c = daily?.comparison || {};
    return MACROS.map((m) => ({
      ...m,
      consumed: Number(c[m.key]?.consumed || 0),
      target: Number(c[m.key]?.target || 0),
      pct: Math.min(100, Number(c[m.key]?.pct || 0)),
    }));
  }, [daily]);

  const calories = useMemo(() => {
    const c = daily?.comparison?.calories;
    return { consumed: Number(c?.consumed || 0), target: Number(c?.target || 0) };
  }, [daily]);
  const fatMacroTarget = useMemo(() => {
    const target = Number(daily?.comparison?.fat?.target || 0);
    return target > 0 ? target : null;
  }, [daily]);
  const fatMacroConsumed = useMemo(() => {
    const consumed = Number(daily?.comparison?.fat?.consumed || 0);
    return consumed >= 0 ? consumed : null;
  }, [daily]);

  const pctColor = (pct: number) =>
    pct >= 80 ? theme.success : pct >= 40 ? theme.warning : theme.error;

  const allMicroRows = useMemo(() => {
    const c = daily?.comparison || {};
    return Object.entries(c)
      .filter(([k]) => !['calories', 'protein', 'carbs', 'fat', 'fiber'].includes(k))
      .map(([k, v]: [string, NutrientComparison]) => ({
        key: k,
        label: formatMicronutrientLabel(k),
        unit: micronutrientUnit(k),
        pct: Math.min(100, Number(v?.pct || 0)),
        consumed: Number(v?.consumed || 0),
        target: Number(v?.target || 0),
      }));
  }, [daily]);
  const [showAllMicros, setShowAllMicros] = useState(false);
  const microRows = showAllMicros ? allMicroRows : allMicroRows.slice(0, 10);

  const handleAddFoodFromCoach = async (food: RecommendedFood) => {
    try {
      await nutritionApi.createLog({
        source_type: 'manual',
        title: food?.name || 'Coach Food',
        meal_type: 'meal',
        servings: 1,
        quantity: 1,
        nutrition: food?.nutrition_info || {},
      });
      await refresh();
    } catch (e) {
      Alert.alert('Error', 'Failed to add food. Please try again.');
    }
  };

  const logs = useMemo(() => daily?.logs ?? [], [daily?.logs]);

  // ── Backfill group MES scores for logs created before score storage ──
  const [backfilledScores, setBackfilledScores] = useState<Record<string, { score: number; tier: string }>>({});
  useEffect(() => {
    let cancelled = false;
    // Find grouped logs missing stored group_mes_score
    const groupMap = new Map<string, DailyLog[]>();
    for (const log of logs) {
      if (!log.group_id) continue;
      const list = groupMap.get(log.group_id) || [];
      list.push(log);
      groupMap.set(log.group_id, list);
    }

    const needsBackfill = Array.from(groupMap.entries()).filter(([, groupLogs]) => {
      if (groupLogs.length < 2) return false;
      // Only backfill if no stored score exists
      return !groupLogs.some((l) => l.group_mes_score != null);
    });

    if (needsBackfill.length === 0) return;

    (async () => {
      const resolved = await Promise.all(
        needsBackfill.map(async ([groupId, groupLogs]) => {
          try {
            const recipeLogs = groupLogs.filter((x) => x.source_type === 'recipe' && x.source_id);
            if (recipeLogs.length < 2) return null;
            const mainRecipeId = String(recipeLogs[0].source_id);
            const sideRecipeId = String(recipeLogs[1].source_id);

            const [mainRecipe, pairings] = await Promise.all([
              recipeApi.getDetail(mainRecipeId).catch(() => null as any),
              recipeApi.getPairingSuggestions(mainRecipeId, 50).catch(() => [] as any[]),
            ]);
            const matchedPair = pairings.find((p: any) => String(p.recipe_id) === sideRecipeId);
            if (!matchedPair) return null;

            // Use same formula as detail page: min(100, storedRawMes + mes_delta)
            const storedRawMes = Number(mainRecipe?.nutrition_info?.mes_score ?? 0);
            const hasStoredRawMes = Number.isFinite(storedRawMes) && storedRawMes > 0;
            const score = hasStoredRawMes
              ? Math.min(100, Number((storedRawMes + (matchedPair.mes_delta ?? 0)).toFixed(1)))
              : Number(matchedPair.combined_display_score ?? matchedPair.combined_mes_score ?? 0);
            if (!(score > 0)) return null;
            const tier = score >= 80 ? 'optimal' : score >= 60 ? 'stable' : score >= 40 ? 'shaky' : 'crash_risk';
            return { groupId, groupLogs, score, tier };
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;

      const updates: Record<string, { score: number; tier: string }> = {};
      for (const item of resolved) {
        if (!item) continue;
        updates[item.groupId] = { score: item.score, tier: item.tier };
        // Persist to DB so this lookup is one-time.
        for (const log of item.groupLogs) {
          nutritionApi.updateLog(log.id, { group_mes_score: item.score, group_mes_tier: item.tier }).catch(() => {});
        }
      }
      if (Object.keys(updates).length > 0) {
        setBackfilledScores((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => { cancelled = true; };
  }, [logs]);

  useEffect(() => {
    let cancelled = false;
    const recipeIds = Array.from(
      new Set(
        logs
          .filter((log) => log.source_type === 'recipe' && !!log.source_id)
          .map((log) => String(log.source_id))
      )
    );

    if (recipeIds.length === 0) {
      setCurrentRecipeMesMap({});
      return;
    }

    (async () => {
      const resolved = await Promise.all(
        recipeIds.map(async (recipeId) => {
          try {
            const recipe = await recipeApi.getDetail(recipeId);
            const nutrition = recipe?.nutrition_info || {};
            const score = Number(nutrition.mes_display_score ?? nutrition.mes_score ?? 0);
            const tier = typeof nutrition.mes_display_tier === 'string' ? nutrition.mes_display_tier : 'critical';
            if (!(score > 0)) return null;
            return { recipeId, score, tier };
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;
      const nextMap: Record<string, { score: number; tier: string }> = {};
      for (const item of resolved) {
        if (!item) continue;
        nextMap[item.recipeId] = { score: item.score, tier: item.tier };
      }
      setCurrentRecipeMesMap(nextMap);
    })();

    return () => {
      cancelled = true;
    };
  }, [logs]);

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <View style={styles.titleRow}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Chronometer</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Track macros, essential micronutrients, and daily score.</Text>
          </View>
          <View>
            <TouchableOpacity
              style={[styles.addIconBtn, { backgroundColor: theme.primaryMuted }]}
              onPress={() => setShowAddMenu(!showAddMenu)}
            >
              <Ionicons name="add" size={22} color={theme.primary} />
            </TouchableOpacity>

            {/* ── Add Menu Popover ── */}
            {showAddMenu && (
              <>
                <Pressable
                  style={{ position: 'absolute', top: -1000, left: -1000, right: -1000, bottom: -1000, width: 9999, height: 9999 }}
                  onPress={() => setShowAddMenu(false)}
                />
                <View style={[styles.addMenu, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.text }]}>
                  {[
                    { icon: 'restaurant-outline' as const, label: 'Log Meal', sub: 'From recipes', onPress: () => { setShowAddMenu(false); router.push('/(tabs)/meals?tab=browse' as any); } },
                    { icon: 'nutrition-outline' as const, label: 'Log Food', sub: 'Search database', onPress: () => { setShowAddMenu(false); router.push('/food/search' as any); } },
                    { icon: 'camera-outline' as const, label: 'Scan Photo', sub: 'Coming soon', onPress: () => { setShowAddMenu(false); Alert.alert('Coming Soon', 'Photo scanning will be available in a future update.'); } },
                  ].map((item, idx) => (
                    <TouchableOpacity
                      key={item.label}
                      onPress={item.onPress}
                      style={[
                        styles.addMenuItem,
                        idx < 2 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                      ]}
                    >
                      <View style={[styles.addMenuIcon, { backgroundColor: theme.primaryMuted }]}>
                        <Ionicons name={item.icon} size={18} color={theme.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.addMenuLabel, { color: theme.text }]}>{item.label}</Text>
                        <Text style={[styles.addMenuSub, { color: theme.textTertiary }]}>{item.sub}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>

        {/* ── View Toggle ── */}
        <View style={[styles.toggleContainer, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
          {(['metabolic', 'nutrient'] as const).map((mode) => {
            const active = viewMode === mode;
            const label = mode === 'metabolic' ? 'Metabolic' : 'Nutrients';
            const icon = mode === 'metabolic' ? 'flash' : 'nutrition';
            return (
              <TouchableOpacity
                key={mode}
                activeOpacity={0.8}
                onPress={() => setViewMode(mode)}
                style={[styles.toggleBtn, active && styles.toggleBtnActive]}
              >
                {active ? (
                  <LinearGradient
                    colors={mode === 'metabolic' ? ['#22C55E', '#16A34A'] : [theme.primary, theme.primary + 'DD'] as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.toggleGradient}
                  >
                    <Ionicons name={icon as any} size={14} color="#fff" />
                    <Text style={styles.toggleTextActive}>{label}</Text>
                  </LinearGradient>
                ) : (
                  <View style={styles.toggleInner}>
                    <Ionicons name={`${icon}-outline` as any} size={14} color={theme.textTertiary} />
                    <Text style={[styles.toggleText, { color: theme.textTertiary }]}>{label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : error ? (
          <Card style={{ marginTop: Spacing.xl }}>
            <View style={{ alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg }}>
              <Ionicons name="cloud-offline-outline" size={36} color={theme.textTertiary} />
              <Text style={{ color: theme.text, fontSize: FontSize.md, fontWeight: '700' }}>Something went wrong</Text>
              <Text style={{ color: theme.textSecondary, fontSize: FontSize.sm, textAlign: 'center' }}>{error}</Text>
              <TouchableOpacity
                onPress={refresh}
                style={{ backgroundColor: theme.primaryMuted, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, marginTop: Spacing.xs }}
              >
                <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '700' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ) : (
          <>
            {/* ════════════════════════════════════════════
                 METABOLIC VIEW
               ════════════════════════════════════════════ */}
            {viewMode === 'metabolic' && (
              <>
            {/* ── Profile Prompt (no profile yet) ── */}
            {metabolicProfile !== null && !hasCoreProfileSetup && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push('/metabolic-onboarding')}
                style={{
                  backgroundColor: theme.primary + '12',
                  borderColor: theme.primary + '30',
                  borderWidth: 1,
                  borderRadius: BorderRadius.lg,
                  padding: Spacing.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Spacing.sm,
                  marginBottom: Spacing.md,
                }}
              >
                <Ionicons name="person-add-outline" size={22} color={theme.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: '700' }}>
                    Personalize Your Scoring
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: FontSize.xs, fontWeight: '500', marginTop: 2 }}>
                    Set up your metabolic profile for personalized MES thresholds
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </TouchableOpacity>
            )}

            {/* ── Energy Budget Hero ── */}
            {dailyMES?.score && mesBudget && (
              <EnergyBudgetCard
                score={dailyMES.score}
                budget={mesBudget}
                remaining={remainingBudget}
                mea={dailyMES.mea}
                fatTargetOverride={fatMacroTarget}
                fatConsumedOverride={fatMacroConsumed}
              />
            )}
              </>
            )}

            {viewMode === 'nutrient' && (
              <>
            {/* ── NutriScore Hero Card ── */}
            <NutriScoreHeroCard
              score={score}
              calories={calories}
              macros={macros}
            />
              </>
            )}

            {/* ── Today's Meals (shared between views) ── */}
            {(() => {
              const totalKcal = logs.reduce(
                (sum: number, l: DailyLog) => sum + Number(l.nutrition_snapshot?.calories || 0),
                0
              );

              // Group logs by group_id — grouped logs become a single visual row
              const groupedLogIds = new Set<string>();
              const mealGroups: { main: DailyLog; side: DailyLog | null }[] = [];
              const ungrouped: DailyLog[] = [];

              // Build map of group_id -> logs
              const groupMap = new Map<string, DailyLog[]>();
              for (const log of logs) {
                if (log.group_id) {
                  const list = groupMap.get(log.group_id) || [];
                  list.push(log);
                  groupMap.set(log.group_id, list);
                  groupedLogIds.add(log.id);
                }
              }

              // Turn grouped logs into main + side pairs
              for (const [, groupLogs] of groupMap) {
                if (groupLogs.length >= 2) {
                  // First logged = main, second = side
                  mealGroups.push({ main: groupLogs[0], side: groupLogs[1] });
                } else {
                  // Single item in group — treat as ungrouped
                  ungrouped.push(groupLogs[0]);
                }
              }

              // Collect ungrouped logs
              for (const log of logs) {
                if (!groupedLogIds.has(log.id)) {
                  ungrouped.push(log);
                }
              }

              // Interleave in original order (by first appearance)
              type DisplayItem = { type: 'group'; main: DailyLog; side: DailyLog } | { type: 'single'; log: DailyLog };
              const displayItems: DisplayItem[] = [];
              const usedIds = new Set<string>();

              for (const log of logs) {
                if (usedIds.has(log.id)) continue;
                if (log.group_id && groupMap.has(log.group_id)) {
                  const groupLogs = groupMap.get(log.group_id)!;
                  if (groupLogs.length >= 2) {
                    displayItems.push({ type: 'group', main: groupLogs[0], side: groupLogs[1] });
                    groupLogs.forEach((l) => usedIds.add(l.id));
                    continue;
                  }
                }
                displayItems.push({ type: 'single', log });
                usedIds.add(log.id);
              }

              // Count distinct meals (grouped = 1, single = 1)
              const mealCount = displayItems.length;

              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push('/food/meals' as any)}
                >
                  <Card
                    style={{
                      marginTop:
                        (viewMode === 'metabolic' && dailyMES?.score && mesBudget) || viewMode === 'nutrient'
                          ? Spacing.sm
                          : 0,
                      marginBottom: Spacing.md,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <LinearGradient
                          colors={[theme.primary, theme.primary + 'CC'] as any}
                          style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Ionicons name="restaurant" size={16} color="#fff" />
                        </LinearGradient>
                        <View>
                          <Text style={{ color: theme.text, fontSize: FontSize.md, fontWeight: '700' }}>Today's Meals</Text>
                          <Text style={{ color: theme.textTertiary, fontSize: 11, fontWeight: '500', marginTop: 1 }}>
                            {mealCount === 0 ? 'No meals logged' : `${mealCount} meal${mealCount > 1 ? 's' : ''} logged`}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {logs.length > 0 && (
                          <View style={{ backgroundColor: theme.primary + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full }}>
                            <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '800' }}>
                              {totalKcal.toFixed(0)} calories
                            </Text>
                          </View>
                        )}
                        <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                      </View>
                    </View>

                    {mealCount === 0 ? (
                      <View style={{ alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm }}>
                        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: theme.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="fast-food-outline" size={24} color={theme.primary} />
                        </View>
                        <Text style={{ color: theme.textSecondary, fontSize: FontSize.sm, fontWeight: '600' }}>No meals logged yet today</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.full, marginTop: Spacing.xs }}>
                          <Ionicons name="add" size={14} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: '700' }}>Log a Meal</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={{ gap: Spacing.sm }}>
                        {displayItems.map((item, idx) => {
                          const isLast = idx === displayItems.length - 1;

                          if (item.type === 'group') {
                            // Combined nutrition
                            const mainSnap = item.main.nutrition_snapshot || {};
                            const sideSnap = item.side.nutrition_snapshot || {};
                            const combinedCal = Number(mainSnap.calories || 0) + Number(sideSnap.calories || 0);
                            const combinedPro = Number(mainSnap.protein || mainSnap.protein_g || 0) + Number(sideSnap.protein || sideSnap.protein_g || 0);
                            const combinedCarb = Number(mainSnap.carbs || mainSnap.carbs_g || 0) + Number(sideSnap.carbs || sideSnap.carbs_g || 0);
                            const combinedFat = Number(mainSnap.fat || mainSnap.fat_g || 0) + Number(sideSnap.fat || sideSnap.fat_g || 0);

                            // Composite MES for this grouped meal — stored at log time or backfilled
                            const storedScore = item.main.group_mes_score ?? item.side.group_mes_score ?? null;
                            const storedTier = item.main.group_mes_tier ?? item.side.group_mes_tier ?? null;
                            const backfill = item.main.group_id ? backfilledScores[item.main.group_id] : undefined;
                            const mainMes = mealScores.find((m) => m.food_log_id === item.main.id);
                            const fallbackMainScore = mainMes?.score?.display_score ?? mainMes?.score?.total_score ?? null;
                            const fallbackMainTier = mainMes?.score?.display_tier ?? mainMes?.score?.tier ?? null;
                            const displayMesScore = storedScore ?? backfill?.score ?? fallbackMainScore;
                            const displayMesTier = storedTier ?? backfill?.tier ?? fallbackMainTier;
                            const displayTierConfig = displayMesTier ? getTierConfig(displayMesTier) : null;

                            return (
                              <View
                                key={item.main.id}
                                style={{
                                  paddingVertical: Spacing.sm + 2,
                                  borderBottomWidth: isLast ? 0 : 1,
                                  borderBottomColor: theme.surfaceHighlight,
                                }}
                              >
                                {/* Main meal row */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                                  <View style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: BorderRadius.sm,
                                    backgroundColor: theme.surfaceHighlight,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}>
                                    <Ionicons name="restaurant-outline" size={16} color={theme.primary} />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                      <Text
                                        style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: '600', flex: 1 }}
                                        numberOfLines={1}
                                      >
                                        {item.main.title || 'Untitled'}
                                      </Text>
                                      {displayMesScore != null && displayMesTier ? (
                                        <View
                                          style={{
                                            backgroundColor: (displayTierConfig?.color || theme.primary) + '14',
                                            borderColor: (displayTierConfig?.color || theme.primary) + '35',
                                            borderWidth: 1,
                                            borderRadius: BorderRadius.full,
                                            padding: 2,
                                          }}
                                        >
                                          <MealMESBadge
                                            score={displayMesScore}
                                            tier={displayMesTier}
                                            onPress={mainMes?.score ? () => setScoreSheetMeal({ title: item.main.title || 'Untitled', score: mainMes.score }) : undefined}
                                          />
                                        </View>
                                      ) : (
                                        <View
                                          style={{
                                            backgroundColor: theme.surfaceHighlight,
                                            borderRadius: BorderRadius.full,
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                          }}
                                        >
                                          <Text style={{ color: theme.textTertiary, fontSize: 10, fontWeight: '700' }}>···</Text>
                                        </View>
                                      )}
                                    </View>
                                  </View>
                                </View>

                                {/* Side (nested, indented) */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingLeft: 32 + Spacing.md }}>
                                  <View style={{
                                    width: 6, height: 6,
                                    borderRadius: 3,
                                    backgroundColor: '#22C55E',
                                    marginRight: 8,
                                  }} />
                                  <Ionicons name="leaf-outline" size={12} color="#22C55E" style={{ marginRight: 4 }} />
                                  <Text
                                    style={{ color: theme.textSecondary, fontSize: FontSize.xs, fontWeight: '500', flex: 1 }}
                                    numberOfLines={1}
                                  >
                                    {item.side.title || 'Side'}
                                  </Text>
                                </View>

                                {/* Combined macros */}
                                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, paddingLeft: 32 + Spacing.md }}>
                                  <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500' }}>
                                    {combinedCal.toFixed(0)} calories
                                  </Text>
                                  {combinedPro > 0 && <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500' }}>P {combinedPro.toFixed(0)}g</Text>}
                                  {combinedCarb > 0 && <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500' }}>C {combinedCarb.toFixed(0)}g</Text>}
                                  {combinedFat > 0 && <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500' }}>F {combinedFat.toFixed(0)}g</Text>}
                                </View>
                              </View>
                            );
                          }

                          // Regular single meal row
                          const mealMes = mealScores.find((m) => m.food_log_id === item.log.id);
                          return (
                            <SingleMealRow
                              key={item.log.id}
                              log={item.log}
                              mealScore={mealMes}
                              recipeScoreOverride={
                                item.log.source_type === 'recipe' && item.log.source_id
                                  ? (currentRecipeMesMap[String(item.log.source_id)] || null)
                                  : null
                              }
                              isLast={isLast}
                            />
                          );
                        })}
                      </View>
                    )}
                  </Card>
                </TouchableOpacity>
              );
            })()}

            {/* ════════════════════════════════════════════
                 METABOLIC VIEW (continued)
               ════════════════════════════════════════════ */}
            {viewMode === 'metabolic' && (
              <>
            {/* ── Metabolic Coach ── */}
            <MetabolicCoach
              score={dailyMES?.score ?? null}
              remaining={remainingBudget}
              budget={mesBudget}
              mealsLogged={logs.length}
              mealSuggestions={mesSuggestions}
            />

            {/* ── MES History (last 14 days) ── */}
            {mesHistory.length > 0 && (
              <EnergyHistoryChart data={mesHistory.slice(-14)} />
            )}
              </>
            )}

            {/* ════════════════════════════════════════════
                 NUTRIENT VIEW
               ════════════════════════════════════════════ */}
            {viewMode === 'nutrient' && (
              <>

            {/* ── Macros ── */}
            <Card style={{ marginBottom: Spacing.md }}>
              <View style={styles.inlineRow}>
                <Ionicons name="nutrition-outline" size={15} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Macros</Text>
              </View>
              {macros.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={{ marginBottom: Spacing.sm }}
                  onPress={() =>
                    setSelectedNutrient({
                      label: m.label,
                      consumed: m.consumed,
                      target: m.target,
                      unit: m.unit,
                      pct: m.pct,
                    })
                  }
                >
                  <View style={styles.rowBetween}>
                    <View style={styles.inlineRow}>
                      <Ionicons name={m.icon} size={14} color={theme.textSecondary} />
                      <Text style={[styles.rowLabel, { color: theme.text }]}>{m.label}</Text>
                    </View>
                    <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>{m.consumed.toFixed(0)}/{m.target.toFixed(0)} {m.unit}</Text>
                  </View>
                  <View style={[styles.barBg, { backgroundColor: theme.surfaceHighlight }]}>
                    <LinearGradient
                      colors={theme.gradient.primary}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.barFill, { width: `${m.pct}%`, borderRadius: 4 }]}
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </Card>

            {/* ── Micronutrients ── */}
            <Card style={{ marginBottom: Spacing.md }}>
              <View style={styles.inlineRow}>
                <Ionicons name="flask-outline" size={15} color={theme.accent} />
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Essential Micronutrients</Text>
              </View>
              {microRows.map((m, idx) => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.microRow, idx % 2 === 1 && { backgroundColor: theme.surfaceHighlight, borderRadius: BorderRadius.sm, marginHorizontal: -Spacing.xs, paddingHorizontal: Spacing.xs }]}
                  onPress={() =>
                    setSelectedNutrient({
                      label: m.label,
                      consumed: m.consumed,
                      target: m.target,
                      unit: m.unit,
                      pct: m.pct,
                    })
                  }
                >
                  <View style={styles.microTopRow}>
                    <View style={styles.microLeft}>
                      <Ionicons name={microIcon(m.label) as any} size={13} color={theme.textSecondary} />
                      <Text style={[styles.microName, { color: theme.text }]} numberOfLines={1}>{m.label}</Text>
                    </View>
                    <Text style={[styles.rowMeta, { color: pctColor(m.pct), fontWeight: '700' }]}>{m.pct.toFixed(0)}%</Text>
                  </View>
                  <View style={styles.microMetaRow}>
                    <Text style={[styles.microDetail, { color: theme.textTertiary }]}> 
                      {m.consumed.toFixed(1)}/{m.target.toFixed(1)} {m.unit}
                    </Text>
                  </View>
                  <View style={[styles.barBg, { backgroundColor: theme.surfaceHighlight, marginTop: 4 }]}> 
                    <LinearGradient
                      colors={theme.gradient.accent}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.barFill, { width: `${m.pct}%`, borderRadius: 4 }]}
                    />
                  </View>
                </TouchableOpacity>
              ))}
              {allMicroRows.length > 10 && (
                <TouchableOpacity
                  onPress={() => setShowAllMicros((v) => !v)}
                  style={{ alignItems: 'center', paddingVertical: Spacing.sm, marginTop: Spacing.xs }}
                >
                  <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '700' }}>
                    {showAllMicros ? 'Show less' : `Show all ${allMicroRows.length} nutrients`}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => router.push('/food/search')}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.sm, paddingVertical: Spacing.sm, backgroundColor: theme.primaryMuted, borderRadius: BorderRadius.full }}
              >
                <Ionicons name="search" size={14} color={theme.primary} />
                <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '700' }}>Search Food Database</Text>
              </TouchableOpacity>
            </Card>

            {/* ── What To Eat Next ── */}
            <Card style={{ marginBottom: Spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="restaurant" size={14} color={theme.primary} />
                  </View>
                  <Text style={{ color: theme.text, fontSize: FontSize.md, fontWeight: '700' }}>What To Eat Next</Text>
                </View>
                <View style={{ backgroundColor: theme.primaryMuted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full }}>
                  <Text style={{ color: theme.primary, fontSize: 10, fontWeight: '700' }}>AI Picks</Text>
                </View>
              </View>
              {(gaps?.recommended_foods || []).length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm }}>
                  <Ionicons name="checkmark-circle" size={32} color={theme.success} />
                  <Text style={{ color: theme.textSecondary, fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center' }}>No specific recommendations right now.{"\n"}Keep logging meals!</Text>
                </View>
              ) : (
                <View>
                  {(gaps?.recommended_foods || []).slice(0, 4).map((f: RecommendedFood, idx: number) => {
                    const nutrientLabel = String(f.for || '').replace(/_/g, ' ');
                    const foodIcons: Record<string, string> = { pepper: 'leaf', kiwi: 'nutrition', salmon: 'fish', egg: 'nutrition-outline', yogurt: 'cafe', spinach: 'leaf', almond: 'ellipse' };
                    const iconName = Object.keys(foodIcons).find(k => f.name.toLowerCase().includes(k));
                    const isLast = idx === Math.min((gaps?.recommended_foods || []).length, 4) - 1;
                    return (
                      <View key={`next-${f.for}-${f.food_id}-${idx}`} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: theme.surfaceHighlight }}>
                        <View style={{ width: 36, height: 36, borderRadius: BorderRadius.sm, backgroundColor: theme.surfaceHighlight, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name={(iconName ? foodIcons[iconName] : 'nutrition-outline') as any} size={16} color={theme.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: '600' }} numberOfLines={1}>{f.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Ionicons name="sparkles" size={10} color={theme.textTertiary} />
                            <Text style={{ color: theme.textTertiary, fontSize: 11, fontWeight: '500' }}>Boosts {nutrientLabel}</Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleAddFoodFromCoach(f)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.full }}
                        >
                          <Ionicons name="add" size={14} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: '700' }}>Add</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>

            {/* ── Nutrition Gap Coach ── */}
            <Card style={{ marginBottom: Spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.accentMuted, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="bulb" size={14} color={theme.warning} />
                  </View>
                  <Text style={{ color: theme.text, fontSize: FontSize.md, fontWeight: '700' }}>Nutrition Gap Coach</Text>
                </View>
              </View>
              {(gaps?.low_nutrients || []).length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm }}>
                  <Ionicons name="shield-checkmark" size={32} color={theme.success} />
                  <Text style={{ color: theme.textSecondary, fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center' }}>Great job — no major nutrient gaps!</Text>
                </View>
              ) : (
                <>
                  {/* Gap nutrient bars */}
                  <View style={{ marginBottom: Spacing.md }}>
                    {(gaps?.low_nutrients || []).map((g: LowNutrient, gIdx: number) => {
                      const pct = Math.min(100, Number(g.pct || 0));
                      const gapColor = pct < 10 ? '#EF4444' : pct < 30 ? '#F59E0B' : '#22C55E';
                      const isLastGap = gIdx === (gaps?.low_nutrients || []).length - 1;
                      return (
                        <View key={g.key} style={{ paddingVertical: Spacing.md, borderBottomWidth: isLastGap ? 0 : 1, borderBottomColor: theme.surfaceHighlight }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: gapColor }} />
                              <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: '600', textTransform: 'capitalize' }}>{g.key.replace(/_/g, ' ')}</Text>
                            </View>
                            <Text style={{ color: gapColor, fontSize: 11, fontWeight: '800' }}>{pct}%</Text>
                          </View>
                          <View style={{ height: 4, backgroundColor: theme.surfaceHighlight, borderRadius: 2, overflow: 'hidden', marginLeft: 11 }}>
                            <View
                              style={{ height: '100%', width: `${Math.max(pct, 2)}%`, borderRadius: 2, backgroundColor: gapColor }}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {/* Suggested meals */}
                  {(gaps?.recommended_meals || []).length > 0 && (
                    <View style={{ marginBottom: Spacing.md }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm }}>
                        <Ionicons name="cafe-outline" size={13} color={theme.primary} />
                        <Text style={{ color: theme.textSecondary, fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Suggested Meals</Text>
                      </View>
                      <View>
                        {(gaps?.recommended_meals || []).map((s: RecommendedMeal, idx: number) => {
                          const isLastMeal = idx === (gaps?.recommended_meals || []).length - 1;
                          return (
                            <TouchableOpacity
                              key={`${s.for}-${s.recipe_id}-${idx}`}
                              onPress={() => s.recipe_id && router.push(`/browse/${s.recipe_id}` as any)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm + 2, borderBottomWidth: isLastMeal ? 0 : 1, borderBottomColor: theme.surfaceHighlight }}
                            >
                              <View style={{ width: 32, height: 32, borderRadius: BorderRadius.sm, backgroundColor: theme.surfaceHighlight, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="restaurant-outline" size={14} color={theme.primary} />
                              </View>
                              <Text style={{ flex: 1, color: theme.text, fontSize: FontSize.sm, fontWeight: '600' }} numberOfLines={1}>{s.title}</Text>
                              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Recommended foods */}
                  {(gaps?.recommended_foods || []).length > 0 && (
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm }}>
                        <Ionicons name="leaf-outline" size={13} color={theme.primary} />
                        <Text style={{ color: theme.textSecondary, fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Recommended Foods</Text>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                        {(gaps?.recommended_foods || []).map((f: RecommendedFood, idx: number) => (
                          <TouchableOpacity
                            key={`rec-${f.for}-${f.food_id}-${idx}`}
                            onPress={() => handleAddFoodFromCoach(f)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.surfaceHighlight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full }}
                          >
                            <Text style={{ color: theme.text, fontSize: FontSize.xs, fontWeight: '600' }}>{f.name}</Text>
                            <Ionicons name="add-circle" size={14} color={theme.primary} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}
            </Card>

            {/* ── NutriScore History (last 14 days mini chart) ── */}
            {scoreHistory.length > 0 && (
              <Card style={{ marginBottom: Spacing.md, paddingVertical: Spacing.md }}>
                <Text style={{ color: theme.text, fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.sm }}>NutriScore History</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 60 }}>
                  {scoreHistory.slice(-14).map((entry: ScoreHistoryEntry, i: number) => {
                    const barHeight = Math.max(4, (entry.score / 100) * 56);
                    const barColor = entry.tier === 'gold' ? '#FFD700'
                      : entry.tier === 'silver' ? '#C0C0C0'
                      : entry.tier === 'bronze' ? '#CD7F32'
                      : theme.surfaceHighlight;
                    return (
                      <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                        <View style={{ width: 8, height: barHeight, borderRadius: 4, backgroundColor: barColor }} />
                      </View>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ color: theme.textTertiary, fontSize: 9 }}>
                    {scoreHistory.length > 0 ? scoreHistory[Math.max(0, scoreHistory.length - 14)]?.date?.slice(5) : ''}
                  </Text>
                  <Text style={{ color: theme.textTertiary, fontSize: 9 }}>
                    {scoreHistory.length > 0 ? scoreHistory[scoreHistory.length - 1]?.date?.slice(5) : ''}
                  </Text>
                </View>
              </Card>
            )}

              </>
            )}

          </>
        )}
      </ScrollView>

      <Modal visible={!!selectedNutrient} transparent animationType="slide" onRequestClose={() => setSelectedNutrient(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}> 
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{selectedNutrient?.label}</Text>
              <TouchableOpacity onPress={() => setSelectedNutrient(null)}>
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={[styles.barBg, { backgroundColor: theme.surfaceHighlight, height: 8, marginTop: Spacing.md }]}>
              <LinearGradient
                colors={theme.gradient.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.barFill, { width: `${Math.min(100, Number(selectedNutrient?.pct || 0))}%`, borderRadius: 4 }]}
              />
            </View>
            <Text style={[styles.modalMeta, { color: theme.textSecondary }]}>Consumed: {Number(selectedNutrient?.consumed || 0).toFixed(1)} {selectedNutrient?.unit || ''}</Text>
            <Text style={[styles.modalMeta, { color: theme.textSecondary }]}>Target: {Number(selectedNutrient?.target || 0).toFixed(1)} {selectedNutrient?.unit || ''}</Text>
            <Text style={[styles.modalScore, { color: pctColor(Number(selectedNutrient?.pct || 0)) }]}>{Number(selectedNutrient?.pct || 0).toFixed(0)}%</Text>
          </View>
        </View>
      </Modal>

      {/* ── Meal Score Sheet ── */}
      {scoreSheetMeal && (
        <MealScoreSheet
          visible={!!scoreSheetMeal}
          onClose={() => setScoreSheetMeal(null)}
          title={scoreSheetMeal.title}
          score={scoreSheetMeal.score}
          proteinTarget={mesBudget ? Math.round(mesBudget.protein_target_g / 3) : undefined}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { marginTop: 2, fontSize: FontSize.sm },
  addIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMenu: {
    position: 'absolute',
    top: 46,
    right: 0,
    width: 220,
    borderRadius: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 100,
    overflow: 'hidden',
  },
  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addMenuIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMenuLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  addMenuSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  center: { marginTop: Spacing.xl, alignItems: 'center' },
  /* ── Hero Grid ── */
  heroGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  heroSmallCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
  nutriCardShell: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  nutriLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 0.2,
  },

  /* ── Stat Row ── */
  statRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  statSub: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  /* ── Section ── */
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.sm, letterSpacing: 0.3 },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.xs,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rowLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  rowMeta: { fontSize: FontSize.xs, fontWeight: '600' },
  barBg: { height: 6, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%' },
  microRow: { paddingVertical: Spacing.xs },
  microTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  microLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: Spacing.sm },
  microName: { flex: 1, fontSize: FontSize.xs, fontWeight: '600' },
  microMetaRow: { marginTop: 2, marginBottom: 2 },
  microDetail: { fontSize: 11, fontWeight: '500' },
  /* ── Gap Coach ── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  modalMeta: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
  },
  modalScore: {
    marginTop: Spacing.md,
    fontSize: FontSize.xxxl,
    fontWeight: '800',
  },

  /* ── View Toggle ── */
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  toggleBtn: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  toggleBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  toggleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  toggleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  toggleTextActive: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  toggleText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
