import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { BorderRadius, FontSize, Spacing } from '../constants/Colors';
import type { MESScore, RemainingBudget, MetabolicBudget} from '../stores/metabolicBudgetStore';
import { getTierConfig } from '../stores/metabolicBudgetStore';

const COACH_BLUE = '#3B82F6';
const COACH_BLUE_DARK = '#2563EB';

// ── Types ──

interface CoachInsight {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  accent: string;           // pill / icon tint color
  accentBg: string;         // subtle background
}

export interface MealSuggestion {
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

interface MetabolicCoachProps {
  score: MESScore | null;
  remaining: RemainingBudget | null;
  budget: MetabolicBudget | null;
  mealsLogged: number;
  mealSuggestions?: MealSuggestion[];
  style?: StyleProp<ViewStyle>;
}

// ── Insight Generator ──

function generateInsights(
  score: MESScore | null,
  remaining: RemainingBudget | null,
  budget: MetabolicBudget | null,
  mealsLogged: number,
): CoachInsight[] {
  const insights: CoachInsight[] = [];

  // No data yet → motivational onboarding nudge
  if (!score || !budget) {
    insights.push({
      icon: 'sparkles',
      title: 'Start your day strong',
      body: 'Log your first meal to unlock personalized metabolic coaching.',
      accent: COACH_BLUE,
      accentBg: 'rgba(59, 130, 246, 0.12)',
    });
    return insights;
  }

  const tier = score.display_tier || score.tier;
  const displayScore = score.display_score ?? score.total_score;

  const proteinLeft = remaining?.protein_remaining_g ?? 0;
  const fiberLeft = remaining?.fiber_remaining_g ?? 0;
  const carbHeadroom = remaining?.carb_headroom_g ?? remaining?.sugar_headroom_g ?? 0;

  // ─── Tier-specific headline ───
  if (tier === 'optimal') {
    insights.push({
      icon: 'trophy',
      title: 'Optimal fuel day',
      body: `You're at ${Math.round(displayScore)} — keep this momentum through your next meal.`,
      accent: '#34C759',
      accentBg: 'rgba(52, 199, 89, 0.12)',
    });
  } else if (tier === 'good' || tier === 'stable') {
    insights.push({
      icon: 'trending-up',
      title: 'Looking strong',
      body: `Score is ${Math.round(displayScore)}. A protein-rich meal could push you into optimal territory.`,
      accent: '#4A90D9',
      accentBg: 'rgba(74, 144, 217, 0.12)',
    });
  } else if (tier === 'moderate' || tier === 'shaky') {
    insights.push({
      icon: 'alert-circle',
      title: 'Room to improve',
      body: `Your MES is ${Math.round(displayScore)}. Focus on protein and fiber in your next meal.`,
      accent: '#FF9500',
      accentBg: 'rgba(255, 149, 0, 0.12)',
    });
  } else {
    insights.push({
      icon: 'flash',
      title: 'Let\'s turn this around',
      body: mealsLogged === 0
        ? 'Log a high-protein meal to kickstart your score.'
        : `Score is ${Math.round(displayScore)}. A balanced meal with protein and fiber can recover it fast.`,
      accent: '#FF4444',
      accentBg: 'rgba(255, 68, 68, 0.12)',
    });
  }

  // ─── Protein nudge ───
  if (proteinLeft > 15) {
    insights.push({
      icon: 'barbell',
      title: `${Math.round(proteinLeft)}g protein to go`,
      body: proteinLeft > 40
        ? 'Consider a protein-forward meal — chicken, fish, eggs, or a shake.'
        : 'A moderate portion of lean protein will close this gap.',
      accent: '#22C55E',
      accentBg: 'rgba(34, 197, 94, 0.10)',
    });
  }

  // ─── Fiber nudge ───
  if (fiberLeft > 8) {
    insights.push({
      icon: 'leaf',
      title: `${Math.round(fiberLeft)}g fiber remaining`,
      body: 'Add veggies, legumes, or whole grains to hit your fiber floor.',
      accent: '#10B981',
      accentBg: 'rgba(16, 185, 129, 0.10)',
    });
  }

  // ─── Carb headroom warning ───
  if (carbHeadroom < 20 && carbHeadroom >= 0 && mealsLogged > 0) {
    insights.push({
      icon: 'shield-checkmark',
      title: `${Math.round(carbHeadroom)}g carb headroom left`,
      body: 'You\'re close to your ceiling. Opt for low-carb sides in your next meal.',
      accent: '#F59E0B',
      accentBg: 'rgba(245, 158, 11, 0.10)',
    });
  }

  return insights.slice(0, 3); // max 3 insights
}

// ── Suggested foods (static, based on remaining budget gaps) ──

interface QuickFood {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

function getSuggestedFoods(remaining: RemainingBudget | null): QuickFood[] {
  if (!remaining) return [];
  const foods: QuickFood[] = [];

  const proteinLeft = remaining.protein_remaining_g ?? 0;
  const fiberLeft = remaining.fiber_remaining_g ?? 0;
  const carbHeadroom = remaining.carb_headroom_g ?? remaining.sugar_headroom_g ?? 999;

  if (proteinLeft > 15) {
    foods.push(
      { name: 'Chicken', icon: 'restaurant', color: '#22C55E' },
      { name: 'Eggs', icon: 'egg', color: '#22C55E' },
      { name: 'Greek Yogurt', icon: 'cafe', color: '#22C55E' },
    );
  }
  if (fiberLeft > 8) {
    foods.push(
      { name: 'Broccoli', icon: 'leaf', color: '#10B981' },
      { name: 'Lentils', icon: 'ellipse', color: '#10B981' },
    );
  }
  if (carbHeadroom < 20) {
    foods.push(
      { name: 'Spinach', icon: 'leaf', color: '#F59E0B' },
    );
  }

  // Fallback
  if (foods.length === 0) {
    foods.push(
      { name: 'Salmon', icon: 'fish', color: '#22C55E' },
      { name: 'Avocado', icon: 'leaf', color: '#10B981' },
      { name: 'Sweet Potato', icon: 'nutrition', color: '#F59E0B' },
    );
  }

  return foods.slice(0, 4);
}

// ── Component ──

export function MetabolicCoach({ score, remaining, budget, mealsLogged, mealSuggestions = [], style }: MetabolicCoachProps) {
  const theme = useTheme();
  const insights = useMemo(
    () => generateInsights(score, remaining, budget, mealsLogged),
    [score, remaining, budget, mealsLogged],
  );
  const suggestedFoods = useMemo(() => getSuggestedFoods(remaining), [remaining]);

  // Show top 2 meal suggestions in the card preview
  const previewMeals = mealSuggestions.slice(0, 2);

  if (insights.length === 0) return null;

  return (
    <View style={[styles.wrapper, style]}>
      {/* Glassmorphic shell */}
      <View
        style={[
          styles.shell,
          {
            backgroundColor: theme.card.background,
            borderColor: theme.card.border,
          },
        ]}
      >
        {/* Header — tappable to navigate to full coach */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push('/food/metabolic-coach' as any)}
          style={styles.header}
        >
          <LinearGradient
            colors={[COACH_BLUE, COACH_BLUE_DARK] as any}
            style={styles.headerIcon}
          >
            <Ionicons name="pulse" size={14} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Metabolic Coach</Text>
            <Text style={[styles.headerSub, { color: theme.textTertiary }]}>Personalized insights</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} style={{ marginLeft: 4 }} />
        </TouchableOpacity>

        {/* Insight list */}
        <View style={styles.insightList}>
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
                {/* Colored accent bar */}
                <View style={[styles.accentBar, { backgroundColor: insight.accent }]} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={insight.icon as any} size={14} color={insight.accent} />
                    <Text style={[styles.insightTitle, { color: theme.text }]}>
                      {insight.title}
                    </Text>
                  </View>
                  <Text style={[styles.insightBody, { color: theme.textSecondary }]}>
                    {insight.body}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Suggested Meals Preview ── */}
        {previewMeals.length > 0 && (
          <View style={styles.suggestedSection}>
            <View style={[styles.suggestedDivider, { backgroundColor: theme.surfaceHighlight }]} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm }}>
              <Ionicons name="restaurant-outline" size={12} color={theme.primary} />
              <Text style={{ color: theme.textSecondary, fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Suggested Meals
              </Text>
            </View>
            {previewMeals.map((meal, idx) => {
              const mealTier = getTierConfig(meal.meal_tier);
              const isLast = idx === previewMeals.length - 1;
              return (
                <TouchableOpacity
                  key={`${meal.recipe_id}-${idx}`}
                  onPress={() => router.push(`/browse/${meal.recipe_id}` as any)}
                  activeOpacity={0.7}
                  style={[
                    styles.mealPreviewRow,
                    !isLast && { borderBottomWidth: 1, borderBottomColor: theme.surfaceHighlight },
                  ]}
                >
                  <View style={[styles.mealPreviewIcon, { backgroundColor: theme.surfaceHighlight }]}>
                    <Ionicons name="restaurant-outline" size={14} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mealPreviewTitle, { color: theme.text }]} numberOfLines={1}>{meal.title}</Text>
                    <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500', marginTop: 1 }}>
                      {Math.round(meal.calories)} calories · P {Math.round(meal.protein_g)}g · F {Math.round(meal.fiber_g)}g
                    </Text>
                  </View>
                  <View style={[styles.mealScorePill, { backgroundColor: mealTier.color + '18' }]}>
                    <Ionicons name="flash" size={10} color={mealTier.color} />
                    <Text style={{ color: mealTier.color, fontSize: 10, fontWeight: '800' }}>
                      {Math.round(meal.projected_daily_score)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Suggested Foods Preview ── */}
        {suggestedFoods.length > 0 && (
          <View style={styles.suggestedSection}>
            {previewMeals.length === 0 && (
              <View style={[styles.suggestedDivider, { backgroundColor: theme.surfaceHighlight }]} />
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm }}>
              <Ionicons name="leaf-outline" size={12} color="#10B981" />
              <Text style={{ color: theme.textSecondary, fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Try These Foods
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
              {suggestedFoods.map((food, idx) => (
                <View
                  key={`food-${idx}`}
                  style={[styles.foodChip, { backgroundColor: '#FFFFFF', borderColor: food.color + '26' }]}
                >
                  <Ionicons name={food.icon as any} size={12} color={food.color} />
                  <Text style={[styles.foodChipText, { color: theme.text }]}>{food.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── See All CTA ── */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push('/food/metabolic-coach' as any)}
          style={[styles.seeAllBtn, { backgroundColor: 'rgba(59, 130, 246, 0.10)' }]}
        >
          <Text style={styles.seeAllText}>See full coaching breakdown</Text>
          <Ionicons name="arrow-forward" size={14} color={COACH_BLUE} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
  },
  shell: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.md,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  // Insights
  insightList: {
    gap: 0,
  },
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

  // Suggested sections
  suggestedSection: {
    marginTop: Spacing.xs,
  },
  suggestedDivider: {
    height: 1,
    marginBottom: Spacing.md,
  },
  mealPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  mealPreviewIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealPreviewTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  mealScorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  foodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  foodChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  seeAllText: {
    color: COACH_BLUE,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
