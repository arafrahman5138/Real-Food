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
import { useTheme } from '../../hooks/useTheme';
import { nutritionApi } from '../../services/api';
import { useGamificationStore, type ScoreHistoryEntry } from '../../stores/gamificationStore';
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
  if (key.includes('vitamin d') || key.includes('calcium')) return 'bone-outline';
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
  const ringSize = size;
  const trackColor = theme.text === '#FFFFFF' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  // Dynamic color: red <30, orange <60, green >=60
  const arcColor = clampedScore >= 60 ? '#22C55E' : clampedScore >= 30 ? '#F59E0B' : '#EF4444';
  const scoreTextColor = theme.text;
  const labelColor = theme.textTertiary;

  return (
    <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }}>
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
      {/* Center text */}
      <Text style={{ fontSize: 32, fontWeight: '800', color: scoreTextColor, letterSpacing: -1 }}>
        {clampedScore > 0 ? score.toFixed(1) : '0'}
      </Text>
      <Text style={{ fontSize: 11, fontWeight: '600', color: labelColor, marginTop: -2, letterSpacing: 0.5 }}>NutriScore</Text>
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, gapData] = await Promise.all([
        nutritionApi.getDaily(),
        nutritionApi.getGaps(),
      ]);
      setDaily(data);
      setGaps(gapData);
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

  const handleDeleteLog = async (logId: string, title: string) => {
    Alert.alert('Remove Log', `Remove "${title}" from today's log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await nutritionApi.deleteLog(logId);
            await refresh();
          } catch (e) {
            console.error('Delete log failed', e);
          }
        },
      },
    ]);
  };

  const logs = daily?.logs || [];

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Spacing.huge }}
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
            {/* ── Hero Grid: NutriScore (left) + Streak/Tier (right) ── */}
            <View style={styles.heroGrid}>
              {/* Left: Square NutriScore card */}
              <Card style={[styles.heroSquare, { borderWidth: 1, borderColor: theme.border }]}>
                <NutritionRing score={score} size={130} strokeWidth={7} />
              </Card>

              {/* Right: Streak + Tier stacked */}
              <View style={styles.heroRightStack}>
                <Card style={styles.heroSmallCard}>
                  <Ionicons name="leaf" size={20} color="#22C55E" />
                  <Text style={{ color: theme.text, fontSize: FontSize.xl, fontWeight: '900', marginTop: 4 }}>{nutritionStreak}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: FontSize.xxs }}>Nutrition Streak</Text>
                  {nutritionLongestStreak > 0 && (
                    <Text style={{ color: theme.textTertiary, fontSize: 9, marginTop: 1 }}>Best: {nutritionLongestStreak}d</Text>
                  )}
                </Card>
                <Card style={styles.heroSmallCard}>
                  <Ionicons name="ribbon" size={20} color={todayTier?.color || theme.textTertiary} />
                  <Text style={{ color: todayTier?.color || theme.textTertiary, fontSize: FontSize.xl, fontWeight: '900', marginTop: 4 }}>{todayTier?.label || '—'}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: FontSize.xxs }}>Today's Tier</Text>
                  {todayTier && (
                    <Text style={{ color: theme.textTertiary, fontSize: 9, marginTop: 1 }}>+{todayTier.xp} XP</Text>
                  )}
                </Card>
              </View>
            </View>

            {/* ── Calorie Summary Row ── */}
              <View style={styles.statRow}>
                {[
                  { label: 'Calories', value: `${calories.consumed.toFixed(0)}`, sub: `/ ${calories.target.toFixed(0)} kcal`, icon: 'flame-outline' as const },
                  { label: 'Protein', value: `${macros.find((m) => m.key === 'protein')?.pct.toFixed(0) ?? 0}%`, sub: 'of target', icon: 'barbell-outline' as const },
                  { label: 'Score', value: `${score}`, sub: '/ 100', icon: 'star-outline' as const },
                ].map((s) => (
                  <Card key={s.label} style={styles.statCard}>
                    <Ionicons name={s.icon} size={16} color={theme.primary} style={{ marginBottom: 4 }} />
                    <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
                    <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{s.label}</Text>
                    <Text style={[styles.statSub, { color: theme.textTertiary }]}>{s.sub}</Text>
                  </Card>
                ))}
              </View>

            {/* ── Today's Meals ── */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/food/meals' as any)}
            >
              <Card style={{ marginBottom: Spacing.md, overflow: 'hidden' }}>
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
                        {logs.length === 0 ? 'No meals logged' : `${logs.length} meal${logs.length > 1 ? 's' : ''} logged`}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {logs.length > 0 && (
                      <View style={{ backgroundColor: theme.primary + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full }}>
                        <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '800' }}>
                          {logs.reduce((sum: number, l: DailyLog) => sum + Number(l.nutrition_snapshot?.calories || 0), 0).toFixed(0)} kcal
                        </Text>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                  </View>
                </View>

                {logs.length === 0 ? (
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
                  <View style={{ gap: 6 }}>
                    {logs.slice(0, 3).map((log: DailyLog, idx: number) => {
                      const snap = log.nutrition_snapshot || {};
                      const cal = Number(snap.calories || 0);
                      const pro = Number(snap.protein || 0);
                      const carb = Number(snap.carbs || 0);
                      const fat = Number(snap.fat || 0);
                      const sourceIcon =
                        log.source_type === 'recipe' ? 'restaurant-outline' :
                        log.source_type === 'meal_plan' ? 'calendar-outline' : 'create-outline';
                      return (
                        <View
                          key={log.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: Spacing.md,
                            backgroundColor: theme.primaryMuted,
                            borderRadius: BorderRadius.md,
                            padding: Spacing.md,
                            borderWidth: 1,
                            borderColor: theme.primary + '10',
                          }}
                        >
                          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={sourceIcon as any} size={16} color={theme.primary} />
                          </View>
                          <View style={{ flex: 1, gap: 3 }}>
                            <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: '600' }} numberOfLines={1}>
                              {log.title || 'Untitled'}
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <Text style={{ color: theme.textTertiary, fontSize: 11, fontWeight: '600' }}>
                                {cal.toFixed(0)} kcal
                              </Text>
                              {pro > 0 && <Text style={{ color: theme.primary + '90', fontSize: 11, fontWeight: '600' }}>P {pro.toFixed(0)}g</Text>}
                              {carb > 0 && <Text style={{ color: theme.accent + '90', fontSize: 11, fontWeight: '600' }}>C {carb.toFixed(0)}g</Text>}
                              {fat > 0 && <Text style={{ color: theme.info + '90', fontSize: 11, fontWeight: '600' }}>F {fat.toFixed(0)}g</Text>}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                    {logs.length > 3 && (
                      <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '600', textAlign: 'center', marginTop: 4 }}>
                        +{logs.length - 3} more meal{logs.length - 3 > 1 ? 's' : ''}
                      </Text>
                    )}
                  </View>
                )}
              </Card>
            </TouchableOpacity>

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
                <View style={{ gap: Spacing.sm }}>
                  {(gaps?.recommended_foods || []).slice(0, 4).map((f: RecommendedFood, idx: number) => {
                    const nutrientLabel = String(f.for || '').replace(/_/g, ' ');
                    const foodIcons: Record<string, string> = { pepper: 'leaf', kiwi: 'nutrition', salmon: 'fish', egg: 'egg', yogurt: 'cafe', spinach: 'leaf', almond: 'ellipse' };
                    const iconName = Object.keys(foodIcons).find(k => f.name.toLowerCase().includes(k));
                    return (
                      <View key={`next-${f.for}-${f.food_id}-${idx}`} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: theme.primaryMuted, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: theme.primary + '15' }}>
                        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name={(iconName ? foodIcons[iconName] : 'nutrition-outline') as any} size={18} color={theme.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: '700' }} numberOfLines={1}>{f.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                            <Ionicons name="sparkles" size={11} color={theme.primary} />
                            <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '600' }}>Boosts {nutrientLabel}</Text>
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
                  <View style={{ gap: Spacing.sm, marginBottom: Spacing.md }}>
                    {(gaps?.low_nutrients || []).map((g: LowNutrient) => {
                      const pct = Math.min(100, Number(g.pct || 0));
                      const gapColor = pct < 10 ? '#EF4444' : pct < 30 ? '#F59E0B' : '#22C55E';
                      const gapBg = pct < 10 ? 'rgba(239, 68, 68, 0.08)' : pct < 30 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(34, 197, 94, 0.08)';
                      return (
                        <View key={g.key} style={{ backgroundColor: gapBg, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: gapColor + '18' }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: gapColor }} />
                              <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: '600', textTransform: 'capitalize' }}>{g.key.replace(/_/g, ' ')}</Text>
                            </View>
                            <View style={{ backgroundColor: gapColor + '20', paddingHorizontal: 10, paddingVertical: 3, borderRadius: BorderRadius.full }}>
                              <Text style={{ color: gapColor, fontSize: 11, fontWeight: '800' }}>{pct}%</Text>
                            </View>
                          </View>
                          <View style={{ height: 5, backgroundColor: gapColor + '15', borderRadius: 3, overflow: 'hidden' }}>
                            <LinearGradient
                              colors={[gapColor, gapColor + 'CC'] as any}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={{ height: '100%', width: `${Math.max(pct, 2)}%`, borderRadius: 3 }}
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
                      <View style={{ gap: Spacing.xs }}>
                        {(gaps?.recommended_meals || []).map((s: RecommendedMeal, idx: number) => (
                          <TouchableOpacity
                            key={`${s.for}-${s.recipe_id}-${idx}`}
                            onPress={() => s.recipe_id && router.push(`/browse/${s.recipe_id}` as any)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: theme.primaryMuted, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: theme.primary + '12' }}
                          >
                            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: theme.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="restaurant-outline" size={16} color={theme.primary} />
                            </View>
                            <Text style={{ flex: 1, color: theme.text, fontSize: FontSize.sm, fontWeight: '600' }} numberOfLines={1}>{s.title}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full }}>
                              <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: '700' }}>Open</Text>
                              <Ionicons name="chevron-forward" size={12} color="#fff" />
                            </View>
                          </TouchableOpacity>
                        ))}
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
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.primaryMuted, paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: theme.primary + '20' }}
                          >
                            <Text style={{ color: theme.primary, fontSize: FontSize.xs, fontWeight: '700' }}>{f.name}</Text>
                            <Ionicons name="add-circle" size={14} color={theme.primary} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}
            </Card>

            {/* ── Score History (last 14 days mini chart) ── */}
            {scoreHistory.length > 0 && (
              <Card style={{ marginBottom: Spacing.md, paddingVertical: Spacing.md }}>
                <Text style={{ color: theme.text, fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.sm }}>Score History</Text>
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
    marginBottom: Spacing.md,
  },
  heroSquare: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroRightStack: {
    flex: 1,
    gap: Spacing.sm,
  },
  heroSmallCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
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
  /* ── Today's Meals ── */
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  logCount: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  emptyLogs: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyLogsText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  emptyLogsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
  },
  emptyLogsBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  logIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logInfo: {
    flex: 1,
    gap: 2,
  },
  logTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  logMacros: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  logMacro: {
    fontSize: 11,
    fontWeight: '500',
  },
  /* ── Gap Coach ── */
  smallBtn: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  smallBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
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
});
