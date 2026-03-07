import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useFocusEffect } from '@react-navigation/native';
import { ScreenContainer } from '../../components/ScreenContainer';
import { MetabolicRing } from '../../components/MetabolicRing';
import { GuardrailBar } from '../../components/GuardrailBar';
import { useTheme } from '../../hooks/useTheme';
import { metabolicApi } from '../../services/api';
import {
  useMetabolicBudgetStore,
  getTierConfig,
  type MESScore,
  type RemainingBudget,
  type MetabolicBudget,
} from '../../stores/metabolicBudgetStore';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

// ── Types ──

interface MealSuggestion {
  recipe_id: string;
  title: string;
  description: string;
  meal_score: number;
  meal_tier: string;
  projected_daily_score: number;
  projected_daily_tier: string;
  protein_g: number;
  fiber_g: number;
  sugar_g: number;
  calories: number;
  cuisine: string;
  total_time_min: number;
}

// ── Static food recommendations based on macros ──

interface FoodSuggestion {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  category: 'protein' | 'fiber' | 'low_carb';
  detail: string;
}

const MES_TIER_GUIDE = [
  {
    key: 'critical',
    range: '0-39',
    description: 'Potential energy crashes — prioritize balanced meals immediately.',
  },
  {
    key: 'low',
    range: '40-54',
    description: 'Low energy territory — protein and fiber should be your next move.',
  },
  {
    key: 'moderate',
    range: '55-69',
    description: 'Energy may fluctuate — focus on protein-forward meals with fiber.',
  },
  {
    key: 'good',
    range: '70-84',
    description: 'Solid energy levels — a little more protein or fiber will push you higher.',
  },
  {
    key: 'optimal',
    range: '85-100',
    description: 'Elite fuel — your macros are perfectly balanced for peak energy.',
  },
] as const;

const PROTEIN_FOODS: FoodSuggestion[] = [
  { name: 'Chicken Breast', icon: 'restaurant', category: 'protein', detail: '31g protein per 100g' },
  { name: 'Eggs', icon: 'egg', category: 'protein', detail: '13g protein per 2 eggs' },
  { name: 'Greek Yogurt', icon: 'cafe', category: 'protein', detail: '10g protein per 100g' },
  { name: 'Salmon', icon: 'fish', category: 'protein', detail: '25g protein per 100g' },
  { name: 'Cottage Cheese', icon: 'nutrition', category: 'protein', detail: '11g protein per 100g' },
  { name: 'Turkey Breast', icon: 'restaurant', category: 'protein', detail: '29g protein per 100g' },
  { name: 'Tuna', icon: 'fish', category: 'protein', detail: '26g protein per 100g' },
  { name: 'Lentils', icon: 'leaf', category: 'protein', detail: '9g protein per 100g cooked' },
];

const FIBER_FOODS: FoodSuggestion[] = [
  { name: 'Broccoli', icon: 'leaf', category: 'fiber', detail: '2.6g fiber per 100g' },
  { name: 'Black Beans', icon: 'ellipse', category: 'fiber', detail: '8.7g fiber per 100g' },
  { name: 'Oats', icon: 'nutrition', category: 'fiber', detail: '10g fiber per 100g' },
  { name: 'Avocado', icon: 'leaf', category: 'fiber', detail: '6.7g fiber per 100g' },
  { name: 'Chia Seeds', icon: 'water', category: 'fiber', detail: '34g fiber per 100g' },
  { name: 'Sweet Potato', icon: 'nutrition', category: 'fiber', detail: '3g fiber per 100g' },
  { name: 'Raspberries', icon: 'nutrition', category: 'fiber', detail: '6.5g fiber per 100g' },
  { name: 'Almonds', icon: 'ellipse', category: 'fiber', detail: '12.5g fiber per 100g' },
];

const LOW_CARB_FOODS: FoodSuggestion[] = [
  { name: 'Spinach', icon: 'leaf', category: 'low_carb', detail: '1.4g carbs per 100g' },
  { name: 'Zucchini', icon: 'leaf', category: 'low_carb', detail: '3.1g carbs per 100g' },
  { name: 'Cauliflower', icon: 'leaf', category: 'low_carb', detail: '3g carbs per 100g' },
  { name: 'Mushrooms', icon: 'leaf', category: 'low_carb', detail: '3.3g carbs per 100g' },
  { name: 'Bell Peppers', icon: 'leaf', category: 'low_carb', detail: '4.6g carbs per 100g' },
  { name: 'Cucumber', icon: 'leaf', category: 'low_carb', detail: '3.6g carbs per 100g' },
];

// ── Insight generator (extended version for detail screen) ──

interface DetailInsight {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  accent: string;
}

function generateDetailInsights(
  score: MESScore | null,
  remaining: RemainingBudget | null,
  budget: MetabolicBudget | null,
): DetailInsight[] {
  const insights: DetailInsight[] = [];
  if (!score || !budget) return insights;

  const tier = score.display_tier || score.tier;
  const displayScore = score.display_score ?? score.total_score;
  const proteinLeft = remaining?.protein_remaining_g ?? 0;
  const fiberLeft = remaining?.fiber_remaining_g ?? 0;
  const carbHeadroom = remaining?.carb_headroom_g ?? remaining?.sugar_headroom_g ?? 0;

  // Score overview
  insights.push({
    icon: 'analytics',
    title: 'Score Breakdown',
    body: `Your MES is ${Math.round(displayScore)}. Protein contributes 50%, fiber 25%, and carb control 25% to your overall score.`,
    accent: '#8B5CF6',
  });

  // Tier specific guidance
  if (tier === 'optimal') {
    insights.push({
      icon: 'trophy',
      title: 'Elite Performance',
      body: 'You\'re in the optimal zone. Your macros are well balanced — maintain this through your remaining meals.',
      accent: '#34C759',
    });
  } else if (tier === 'stable') {
    insights.push({
      icon: 'trending-up',
      title: 'Strong Foundation',
      body: 'Your energy is stable. Prioritize protein-dense foods in your next meal to push into the elite zone.',
      accent: '#4A90D9',
    });
  } else if (tier === 'shaky') {
    insights.push({
      icon: 'alert-circle',
      title: 'Needs Attention',
      body: 'Your energy levels may fluctuate. Focus on protein and fiber while moderating carbs to stabilize.',
      accent: '#FF9500',
    });
  } else {
    insights.push({
      icon: 'flash',
      title: 'Recovery Mode',
      body: 'Your score indicates potential energy crashes. A protein-forward meal with fiber can rapidly improve your standing.',
      accent: '#FF4444',
    });
  }

  // Macro-specific insights
  if (proteinLeft > 20) {
    insights.push({
      icon: 'barbell',
      title: `Protein Gap: ${Math.round(proteinLeft)}g remaining`,
      body: `You need ${Math.round(proteinLeft)}g more protein today. This is the biggest factor in your MES — try chicken, fish, eggs, or a protein shake.`,
      accent: '#22C55E',
    });
  } else if (proteinLeft > 0) {
    insights.push({
      icon: 'checkmark-circle',
      title: `Protein almost done: ${Math.round(proteinLeft)}g left`,
      body: 'You\'re close to hitting your protein target. A small portion of lean protein will close this gap.',
      accent: '#22C55E',
    });
  } else {
    insights.push({
      icon: 'checkmark-done-circle',
      title: 'Protein target met!',
      body: 'Excellent — you\'ve hit your protein target for the day. This is the single biggest factor in a high MES.',
      accent: '#34C759',
    });
  }

  if (fiberLeft > 10) {
    insights.push({
      icon: 'leaf',
      title: `Fiber Gap: ${Math.round(fiberLeft)}g remaining`,
      body: 'Add vegetables, legumes, or whole grains. Fiber supports sustained energy and digestion.',
      accent: '#10B981',
    });
  } else if (fiberLeft > 0) {
    insights.push({
      icon: 'leaf',
      title: `Fiber almost there: ${Math.round(fiberLeft)}g left`,
      body: 'A side salad or some fruit will complete your fiber target.',
      accent: '#10B981',
    });
  }

  if (carbHeadroom < 15 && carbHeadroom >= 0) {
    insights.push({
      icon: 'shield-checkmark',
      title: `Carb headroom: ${Math.round(carbHeadroom)}g`,
      body: 'You\'re nearing your carb ceiling. Choose low-carb options like leafy greens, lean meats, or eggs.',
      accent: '#F59E0B',
    });
  } else if (carbHeadroom > 50) {
    insights.push({
      icon: 'shield',
      title: `Carb headroom: ${Math.round(carbHeadroom)}g`,
      body: 'You have plenty of room for carbs. Feel free to include whole grains, fruits, or starchy vegetables.',
      accent: '#4A90D9',
    });
  }

  return insights;
}

// ── Food Category Sub-Component ──

function FoodCategory({
  theme,
  icon,
  color,
  label,
  subtitle,
  foods,
  searchQuery,
}: {
  theme: any;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  subtitle: string;
  foods: FoodSuggestion[];
  searchQuery: string;
}) {
  return (
    <View style={catStyles.wrapper}>
      {/* Category header */}
      <View style={catStyles.header}>
        <View style={[catStyles.iconDot, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon as any} size={12} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[catStyles.label, { color: theme.text }]}>{label}</Text>
          <Text style={[catStyles.sublabel, { color: theme.textTertiary }]}>{subtitle}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/food/search', params: { q: searchQuery } } as any)}
          activeOpacity={0.7}
          style={[catStyles.browseBtn, { backgroundColor: color + '14' }]}
        >
          <Text style={[catStyles.browseBtnText, { color }]}>Browse All</Text>
          <Ionicons name="arrow-forward" size={12} color={color} />
        </TouchableOpacity>
      </View>

      {/* Horizontal scrolling food cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: Spacing.sm, paddingRight: Spacing.xs }}
      >
        {foods.map((food, idx) => (
          <TouchableOpacity
            key={`${label}-${idx}`}
            onPress={() => router.push({ pathname: '/food/search', params: { q: food.name } } as any)}
            activeOpacity={0.7}
            style={[
              catStyles.card,
              {
                backgroundColor: theme.card.background,
                borderColor: theme.card.border,
              },
            ]}
          >
            <View style={[catStyles.cardIcon, { backgroundColor: color + '12' }]}>
              <Ionicons name={food.icon as any} size={16} color={color} />
            </View>
            <Text style={[catStyles.cardName, { color: theme.text }]} numberOfLines={1}>
              {food.name}
            </Text>
            <Text style={[catStyles.cardDetail, { color: theme.textTertiary }]} numberOfLines={1}>
              {food.detail}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const catStyles = StyleSheet.create({
  wrapper: {
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconDot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  sublabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  browseBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  card: {
    width: 120,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.sm + 2,
    gap: 6,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  cardDetail: {
    fontSize: 10,
    fontWeight: '500',
  },
});

// ── Component ──

export default function MetabolicCoachScreen() {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const dailyMES = useMetabolicBudgetStore((s) => s.dailyScore);
  const mesBudget = useMetabolicBudgetStore((s) => s.budget);
  const remainingBudget = useMetabolicBudgetStore((s) => s.remainingBudget);
  const mesHistory = useMetabolicBudgetStore((s) => s.scoreHistory);
  const streak = useMetabolicBudgetStore((s) => s.streak);
  const fetchAll = useMetabolicBudgetStore((s) => s.fetchAll);

  const [mealSuggestions, setMealSuggestions] = useState<MealSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const score = dailyMES?.score ?? null;
  const remaining = remainingBudget;
  const budget = mesBudget;

  const tier = score ? getTierConfig(score.display_tier || score.tier) : null;
  const displayScore = score ? Math.round(score.display_score ?? score.total_score) : 0;

  const insights = useMemo(
    () => generateDetailInsights(score, remaining, budget),
    [score, remaining, budget],
  );

  // Determine which foods to recommend based on remaining budget
  const recommendedFoods = useMemo(() => {
    const foods: FoodSuggestion[] = [];
    const proteinLeft = remaining?.protein_remaining_g ?? 0;
    const fiberLeft = remaining?.fiber_remaining_g ?? 0;
    const carbHeadroom = remaining?.carb_headroom_g ?? remaining?.sugar_headroom_g ?? 999;

    if (proteinLeft > 10) foods.push(...PROTEIN_FOODS.slice(0, 4));
    if (fiberLeft > 5) foods.push(...FIBER_FOODS.slice(0, 4));
    if (carbHeadroom < 30) foods.push(...LOW_CARB_FOODS.slice(0, 3));

    // If no specific gaps, show a balanced mix
    if (foods.length === 0) {
      foods.push(...PROTEIN_FOODS.slice(0, 3), ...FIBER_FOODS.slice(0, 3));
    }

    return foods;
  }, [remaining]);

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const data = await metabolicApi.getMealSuggestions(undefined, 8);
      setMealSuggestions(data || []);
    } catch {
      // silent
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchAll(), fetchSuggestions()]);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
    }, []),
  );

  useEffect(() => {
    fetchAll();
    fetchSuggestions();
  }, []);

  const tierGradient = tier
    ? tier.color === '#34C759' ? ['#34C759', '#22A04B'] as const
      : tier.color === '#4A90D9' ? ['#4A90D9', '#3A78B5'] as const
      : tier.color === '#FF9500' ? ['#FF9500', '#E6860A'] as const
      : ['#FF4444', '#DD3333'] as const
    : ['#8B5CF6', '#6D28D9'] as const;

  return (
    <ScreenContainer safeArea={false}>
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: Spacing.sm, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* ── Hero Section ── */}
        <View
          style={[
            styles.heroCard,
            { backgroundColor: theme.card.background, borderColor: theme.card.border },
          ]}
        >
          {/* Gradient header */}
          <LinearGradient
            colors={tierGradient as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.heroHeader}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="pulse" size={16} color="#fff" />
              <Text style={styles.heroHeaderTitle}>Metabolic Coach</Text>
            </View>
            {streak && streak.current_streak > 0 && (
              <View style={styles.streakPill}>
                <Ionicons name="flame" size={12} color="#FF9500" />
                <Text style={styles.streakText}>{streak.current_streak} day streak</Text>
              </View>
            )}
          </LinearGradient>

          {/* Score + Tier */}
          <View style={styles.heroBody}>
            <MetabolicRing
              score={displayScore}
              tier={(score?.display_tier || score?.tier || 'crash_risk') as any}
              size={110}
            />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={[styles.tierBadge, { backgroundColor: (tier?.color || '#8B5CF6') + '18' }]}>
                <Ionicons name={(tier?.icon || 'flash') as any} size={14} color={tier?.color || '#8B5CF6'} />
                <Text style={[styles.tierLabel, { color: tier?.color || '#8B5CF6' }]}>
                  {tier?.label || 'No Data'}
                </Text>
              </View>
              {/* Stat pills */}
              <View style={styles.statPills}>
                {remaining && (
                  <>
                    <View style={[styles.statPill, { backgroundColor: theme.surfaceHighlight }]}>
                      <Text style={[styles.statPillText, { color: theme.text }]}>
                        {Math.round(remaining.protein_remaining_g)}g protein left
                      </Text>
                    </View>
                    <View style={[styles.statPill, { backgroundColor: theme.surfaceHighlight }]}>
                      <Text style={[styles.statPillText, { color: theme.text }]}>
                        {Math.round(remaining.fiber_remaining_g)}g fiber left
                      </Text>
                    </View>
                    <View style={[styles.statPill, { backgroundColor: theme.surfaceHighlight }]}>
                      <Text style={[styles.statPillText, { color: theme.text }]}>
                        {Math.round(remaining.carb_headroom_g ?? remaining.sugar_headroom_g ?? 0)}g carb room
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          </View>

          {/* Guardrail bars */}
          {score && budget && (
            <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.md }}>
              <GuardrailBar
                label="Protein"
                icon="barbell"
                consumed={score.protein_g}
                target={budget.protein_target_g}
                type="floor"
                color="#22C55E"
              />
              <View style={{ height: Spacing.sm }} />
              <GuardrailBar
                label="Fiber"
                icon="leaf"
                consumed={score.fiber_g}
                target={budget.fiber_floor_g}
                type="floor"
                color="#10B981"
              />
              <View style={{ height: Spacing.sm }} />
              <GuardrailBar
                label="Carbs"
                icon="flash"
                consumed={score.carbs_g ?? score.sugar_g}
                target={budget.sugar_ceiling_g}
                type="ceiling"
                color="#F59E0B"
              />
            </View>
          )}
        </View>

        {/* ── Personalized Insights ── */}
        <View
          style={[
            styles.section,
            { backgroundColor: theme.card.background, borderColor: theme.card.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <LinearGradient
              colors={['#8B5CF6', '#6D28D9'] as any}
              style={styles.sectionIcon}
            >
              <Ionicons name="bulb" size={14} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Personalized Insights</Text>
              <Text style={[styles.sectionSub, { color: theme.textTertiary }]}>Based on your daily intake</Text>
            </View>
          </View>

          {insights.map((insight, idx) => {
            const isLast = idx === insights.length - 1;
            return (
              <View
                key={idx}
                style={[
                  styles.insightRow,
                  !isLast && { borderBottomWidth: 1, borderBottomColor: theme.surfaceHighlight },
                ]}
              >
                <View style={[styles.accentBar, { backgroundColor: insight.accent }]} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={insight.icon as any} size={14} color={insight.accent} />
                    <Text style={[styles.insightTitle, { color: theme.text }]}>{insight.title}</Text>
                  </View>
                  <Text style={[styles.insightBody, { color: theme.textSecondary }]}>{insight.body}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Recommended Meals ── */}
        <View
          style={[
            styles.section,
            { backgroundColor: theme.card.background, borderColor: theme.card.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <LinearGradient
              colors={[theme.primary, theme.primary + 'CC'] as any}
              style={styles.sectionIcon}
            >
              <Ionicons name="restaurant" size={14} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Recommended Meals</Text>
              <Text style={[styles.sectionSub, { color: theme.textTertiary }]}>Optimized for your remaining budget</Text>
            </View>
            <View style={[styles.aiPill, { backgroundColor: theme.primaryMuted }]}>
              <Ionicons name="sparkles" size={10} color={theme.primary} />
              <Text style={[styles.aiPillText, { color: theme.primary }]}>MES</Text>
            </View>
          </View>

          {loadingSuggestions ? (
            <View style={{ paddingVertical: Spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : mealSuggestions.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm }}>
              <Ionicons name="checkmark-circle" size={32} color={theme.success} />
              <Text style={{ color: theme.textSecondary, fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center' }}>
                No specific meal recommendations right now.{'\n'}Keep logging your meals!
              </Text>
            </View>
          ) : (
            <View>
              {mealSuggestions.map((meal, idx) => {
                const isLast = idx === mealSuggestions.length - 1;
                const mealTier = getTierConfig(meal.meal_tier);
                return (
                  <TouchableOpacity
                    key={`${meal.recipe_id}-${idx}`}
                    onPress={() => router.push(`/browse/${meal.recipe_id}` as any)}
                    activeOpacity={0.7}
                    style={[
                      styles.mealRow,
                      !isLast && { borderBottomWidth: 1, borderBottomColor: theme.surfaceHighlight },
                    ]}
                  >
                    <View style={[styles.mealIcon, { backgroundColor: theme.surfaceHighlight }]}>
                      <Ionicons name="restaurant-outline" size={16} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.mealTitle, { color: theme.text }]} numberOfLines={1}>
                        {meal.title}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500' }}>
                          {Math.round(meal.calories)} calories
                        </Text>
                        <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500' }}>
                          P {Math.round(meal.protein_g)}g
                        </Text>
                        <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500' }}>
                          F {Math.round(meal.fiber_g)}g
                        </Text>
                        {meal.total_time_min > 0 && (
                          <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500' }}>
                            {meal.total_time_min}min
                          </Text>
                        )}
                      </View>
                    </View>
                    {/* Projected score badge */}
                    <View style={[styles.scoreBadge, { backgroundColor: mealTier.color + '18' }]}>
                      <Ionicons name="flash" size={10} color={mealTier.color} />
                      <Text style={[styles.scoreBadgeText, { color: mealTier.color }]}>
                        {Math.round(meal.projected_daily_score)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Recommended Foods ── */}
        <View
          style={[
            styles.section,
            { backgroundColor: theme.card.background, borderColor: theme.card.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <LinearGradient
              colors={['#10B981', '#059669'] as any}
              style={styles.sectionIcon}
            >
              <Ionicons name="leaf" size={14} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Recommended Foods</Text>
              <Text style={[styles.sectionSub, { color: theme.textTertiary }]}>Whole foods to close your gaps</Text>
            </View>
          </View>

          {recommendedFoods.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm }}>
              <Ionicons name="checkmark-circle" size={32} color={theme.success} />
              <Text style={{ color: theme.textSecondary, fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center' }}>
                You're well balanced today!
              </Text>
            </View>
          ) : (
            <View style={{ gap: Spacing.md }}>
              {/* ── Protein-Rich ── */}
              {remaining && (remaining.protein_remaining_g ?? 0) > 10 && (
                <FoodCategory
                  theme={theme}
                  icon="barbell"
                  color="#22C55E"
                  label="Protein-Rich"
                  subtitle={`${Math.round(remaining.protein_remaining_g)}g to go`}
                  foods={PROTEIN_FOODS.slice(0, 6)}
                  searchQuery="high protein"
                />
              )}

              {/* ── Fiber-Rich ── */}
              {remaining && (remaining.fiber_remaining_g ?? 0) > 5 && (
                <FoodCategory
                  theme={theme}
                  icon="leaf"
                  color="#10B981"
                  label="Fiber-Rich"
                  subtitle={`${Math.round(remaining.fiber_remaining_g)}g to go`}
                  foods={FIBER_FOODS.slice(0, 6)}
                  searchQuery="high fiber"
                />
              )}

              {/* ── Low-Carb ── */}
              {remaining && (remaining.carb_headroom_g ?? remaining.sugar_headroom_g ?? 999) < 30 && (
                <FoodCategory
                  theme={theme}
                  icon="shield-checkmark"
                  color="#F59E0B"
                  label="Low-Carb Options"
                  subtitle={`${Math.round(remaining.carb_headroom_g ?? remaining.sugar_headroom_g ?? 0)}g headroom`}
                  foods={LOW_CARB_FOODS.slice(0, 6)}
                  searchQuery="low carb vegetables"
                />
              )}

              {/* ── Balanced (fallback) ── */}
              {remaining &&
                (remaining.protein_remaining_g ?? 0) <= 10 &&
                (remaining.fiber_remaining_g ?? 0) <= 5 &&
                (remaining.carb_headroom_g ?? remaining.sugar_headroom_g ?? 999) >= 30 && (
                <FoodCategory
                  theme={theme}
                  icon="sparkles"
                  color="#8B5CF6"
                  label="Balanced Picks"
                  subtitle="You're on track"
                  foods={[...PROTEIN_FOODS.slice(0, 3), ...FIBER_FOODS.slice(0, 3)]}
                  searchQuery="whole food"
                />
              )}
            </View>
          )}
        </View>

        {/* ── MES Tier Guide ── */}
        <View
          style={[
            styles.section,
            { backgroundColor: theme.card.background, borderColor: theme.card.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <LinearGradient
              colors={['#F59E0B', '#D97706'] as any}
              style={styles.sectionIcon}
            >
              <Ionicons name="information" size={14} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>MES Tier Guide</Text>
              <Text style={[styles.sectionSub, { color: theme.textTertiary }]}>Understanding your score</Text>
            </View>
          </View>

          {MES_TIER_GUIDE.map((item, idx) => {
            const cfg = getTierConfig(item.key);
            const currentTier = score?.display_tier || score?.tier || 'critical';
            const isActive =
              currentTier === item.key ||
              (currentTier === 'crash_risk' && item.key === 'critical') ||
              (currentTier === 'shaky' && item.key === 'moderate') ||
              (currentTier === 'stable' && item.key === 'good');
            const isLast = idx === MES_TIER_GUIDE.length - 1;
            return (
              <View
                key={item.key}
                style={[
                  styles.tierRow,
                  isActive && { backgroundColor: cfg.color + '0A', borderRadius: BorderRadius.md },
                  !isLast && { borderBottomWidth: 1, borderBottomColor: theme.surfaceHighlight },
                ]}
              >
                <View style={[styles.tierDot, { backgroundColor: cfg.color }]} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
                    <Text style={[styles.tierName, { color: theme.text }]}>{cfg.label}</Text>
                    <Text style={{ color: theme.textTertiary, fontSize: 10, fontWeight: '600' }}>{item.range}</Text>
                    {isActive && (
                      <View style={[styles.youBadge, { backgroundColor: cfg.color + '20' }]}>
                        <Text style={{ color: cfg.color, fontSize: 9, fontWeight: '800' }}>YOU</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.tierDesc, { color: theme.textSecondary }]}>{item.description}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  // Hero
  heroCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  heroHeaderTitle: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  streakText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.md,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  tierLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  statPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statPillText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Section
  section: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.md,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  aiPillText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Insights
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: 2,
  },
  accentBar: {
    width: 3,
    borderRadius: 2,
    alignSelf: 'stretch',
    marginTop: 2,
    marginBottom: 2,
  },
  insightTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  insightBody: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },

  // Meal rows
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  mealIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // Tier guide
  tierRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  tierDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 7,
  },
  tierName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  tierDesc: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    marginTop: 2,
  },
  youBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
});
