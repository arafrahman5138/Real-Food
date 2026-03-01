import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  FlatList,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Card } from '../../components/GradientCard';
import { XPBar } from '../../components/XPBar';
import { StreakBadge } from '../../components/StreakBadge';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';
import { useGamificationStore } from '../../stores/gamificationStore';
import { useMealPlanStore } from '../../stores/mealPlanStore';
import { gameApi, recipeApi, nutritionApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';
import { getLevelTitle } from '../../constants/Config';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.42;
const RING_SIZE = 100;
const RING_STROKE = 8;

const DAILY_TIPS = [
  'Swap refined vegetable oils with extra virgin olive oil or avocado oil. They\'re rich in healthy monounsaturated fats and antioxidants.',
  'Aim for at least 30 different plant foods per week — fruits, vegetables, nuts, seeds, herbs, and whole grains — to support gut microbiome diversity.',
  'Eat the rainbow! Different colored produce provides different phytonutrients. Try to include at least 3 colors at each meal.',
  'Wild-caught fish like salmon, mackerel, and sardines are excellent sources of omega-3 fatty acids essential for brain and heart health.',
  'Fermented foods like yogurt, kimchi, sauerkraut, and kefir support a healthy gut. Try to include one serving daily.',
  'Soaking and sprouting grains, nuts, and legumes can increase nutrient bioavailability and reduce anti-nutrients like phytic acid.',
  'Dark leafy greens like kale, spinach, and Swiss chard are among the most nutrient-dense foods on the planet. Aim for a daily serving.',
];

const RECIPE_GRADIENTS: readonly [string, string][] = [
  ['#22C55E', '#16A34A'],
  ['#3B82F6', '#2563EB'],
  ['#EC4899', '#DB2777'],
  ['#F59E0B', '#D97706'],
  ['#8B5CF6', '#7C3AED'],
  ['#14B8A6', '#0D9488'],
  ['#EF4444', '#DC2626'],
  ['#6366F1', '#4F46E5'],
];

const MEAL_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  breakfast: 'sunny-outline',
  lunch: 'restaurant-outline',
  dinner: 'moon-outline',
  snack: 'cafe-outline',
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface QuickAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  gradient: readonly [string, string, ...string[]];
}

interface WeeklyStats {
  meals_cooked: number;
  recipes_saved: number;
  foods_explored: number;
  xp_earned: number;
}

interface RecommendedRecipe {
  id: string;
  title: string;
  difficulty?: string;
  total_time_min?: number;
  tags?: string[];
}

interface NutrientComparison {
  consumed: number;
  target: number;
  pct: number;
}

interface DailySummary {
  daily_score: number;
  comparison: Record<string, NutrientComparison>;
}

// ── Circular Progress Ring ─────────────────────────────────────────────
function NutritionRing({ score, color, size = RING_SIZE, strokeWidth = RING_STROKE }: {
  score: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const theme = useTheme();
  const clampedScore = Math.min(100, Math.max(0, score));
  // Create ring segments using 4 quadrant Views
  const innerSize = size - strokeWidth * 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background track */}
      <View style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: strokeWidth,
        borderColor: theme.surfaceHighlight,
      }} />
      {/* Progress ring — right half */}
      {clampedScore > 0 && (
        <View style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: 'transparent',
          borderTopColor: color,
          borderRightColor: clampedScore > 25 ? color : 'transparent',
          borderBottomColor: clampedScore > 50 ? color : 'transparent',
          borderLeftColor: clampedScore > 75 ? color : 'transparent',
          transform: [{ rotate: '-45deg' }],
        }} />
      )}
      {/* Inner circle (mask center) */}
      <View style={{
        width: innerSize,
        height: innerSize,
        borderRadius: innerSize / 2,
        backgroundColor: theme.card.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Text style={{ fontSize: FontSize.xxl, fontWeight: '800', color }}>{clampedScore}</Text>
        <Text style={{ fontSize: 9, fontWeight: '600', color: theme.textTertiary, marginTop: -2 }}>NutriScore</Text>
      </View>
    </View>
  );
}

// ── Macro Status Badge ─────────────────────────────────────────────────
function MacroBadge({ label, pct, theme }: { label: string; pct: number; theme: any }) {
  const status = pct >= 80 ? 'GREAT' : pct >= 50 ? 'GOOD' : pct >= 25 ? 'LOW' : 'START';
  const statusColor = pct >= 80 ? '#22C55E' : pct >= 50 ? '#3B82F6' : pct >= 25 ? '#F59E0B' : theme.textTertiary;
  const statusBg = pct >= 80 ? 'rgba(34,197,94,0.12)' : pct >= 50 ? 'rgba(59,130,246,0.12)' : pct >= 25 ? 'rgba(245,158,11,0.12)' : theme.surfaceHighlight;

  return (
    <View style={s.macroBadgeRow}>
      <Text style={[s.macroBadgeLabel, { color: theme.text }]}>{label}</Text>
      <View style={[s.macroBadgePill, { backgroundColor: statusBg }]}>
        <Text style={[s.macroBadgeStatus, { color: statusColor }]}>{status}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const quests = useGamificationStore((s) => s.quests);
  const completionPct = useGamificationStore((s) => s.completionPct);
  const fetchQuests = useGamificationStore((s) => s.fetchQuests);
  const fetchStats = useGamificationStore((s) => s.fetchStats);
  const stats = useGamificationStore((s) => s.stats);
  const nutritionStreak = useGamificationStore((s) => s.nutritionStreak);
  const currentPlan = useMealPlanStore((s) => s.currentPlan);
  const loadCurrentPlan = useMealPlanStore((s) => s.loadCurrentPlan);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats>({
    meals_cooked: 0,
    recipes_saved: 0,
    foods_explored: 0,
    xp_earned: 0,
  });
  const [statsError, setStatsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recommended, setRecommended] = useState<RecommendedRecipe[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);

  const loadStats = async () => {
    setStatsError(false);
    try {
      const data = await gameApi.getWeeklyStats();
      setWeeklyStats(data);
    } catch {
      setStatsError(true);
    }
  };

  const loadRecommended = async () => {
    try {
      const params: Record<string, string | number | undefined> = { page_size: 10 };
      // Use user preferences to filter
      const flavorPrefs = user?.flavor_preferences || [];
      const proteinPrefs = user?.protein_preferences?.liked || [];
      if (flavorPrefs.length > 0) params.flavor = flavorPrefs[0];
      if (proteinPrefs.length > 0) params.protein_type = proteinPrefs.join(',');
      const data = await recipeApi.browse(params);
      const items: RecommendedRecipe[] = data?.items || [];
      // Shuffle for variety
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      setRecommended(items.slice(0, 8));
    } catch {
      // Fallback: try without preferences
      try {
        const data = await recipeApi.browse({ page_size: 8 });
        setRecommended(data?.items || []);
      } catch {}
    }
  };

  const loadDailyNutrition = async () => {
    try {
      const data = await nutritionApi.getDaily();
      if (data) setDailySummary(data);
    } catch {}
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Reset meal plan hasLoaded so it reloads
    useMealPlanStore.setState({ hasLoaded: false });
    await Promise.all([
      loadStats(),
      fetchQuests(),
      fetchStats(),
      loadRecommended(),
      loadCurrentPlan(),
      loadDailyNutrition(),
    ]);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadStats();
    fetchQuests();
    fetchStats();
    loadRecommended();
    loadCurrentPlan();
    loadDailyNutrition();
  }, []);

  // Today's meals from plan
  const todayName = DAYS[new Date().getDay()];
  const todayMeals = useMemo(() => {
    if (!currentPlan?.items) return [];
    return currentPlan.items.filter(
      (item) => item.day_of_week?.toLowerCase() === todayName.toLowerCase()
    );
  }, [currentPlan, todayName]);

  // Nutrition ring color based on score
  const ringColor = useMemo(() => {
    const score = dailySummary?.daily_score ?? 0;
    if (score >= 80) return '#22C55E';
    if (score >= 50) return '#3B82F6';
    if (score >= 25) return '#F59E0B';
    return '#EF4444';
  }, [dailySummary]);

  // Top 2 micronutrients to highlight (lowest % — areas to improve)
  const MACRO_KEYS = new Set(['calories', 'protein', 'carbs', 'fat', 'fiber']);
  const topMicros = useMemo(() => {
    const comp = dailySummary?.comparison;
    if (!comp) return [];
    return Object.entries(comp)
      .filter(([key]) => !MACRO_KEYS.has(key) && comp[key]?.target > 0)
      .map(([key, val]) => ({
        key,
        label: key
          .replace(/_(mg|mcg|g)$/i, '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (s: string) => s.toUpperCase()),
        pct: val.pct ?? 0,
      }))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 2);
  }, [dailySummary]);

  const quickActions: QuickAction[] = [
    {
      icon: 'chatbubbles',
      label: 'Healthify\na Food',
      route: '/(tabs)/chat',
      gradient: ['#22C55E', '#16A34A'],
    },
    {
      icon: 'restaurant',
      label: 'Meal\nPlan',
      route: '/(tabs)/meals?tab=plan',
      gradient: ['#3B82F6', '#2563EB'],
    },
    {
      icon: 'cart',
      label: 'Grocery\nList',
      route: '/(tabs)/meals?tab=grocery',
      gradient: ['#F59E0B', '#D97706'],
    },
    {
      icon: 'book',
      label: 'Browse\nRecipes',
      route: '/(tabs)/meals?tab=browse',
      gradient: ['#EC4899', '#DB2777'],
    },
    {
      icon: 'search',
      label: 'Food\nDatabase',
      route: '/food/search',
      gradient: ['#8B5CF6', '#7C3AED'],
    },
    {
      icon: 'analytics',
      label: 'Chrono\nmeter',
      route: '/(tabs)/chronometer',
      gradient: ['#14B8A6', '#0D9488'],
    },
  ];

  const firstName = user?.name?.split(' ')[0] || 'there';
  const greeting = getGreeting();
  const dailyTip = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return DAILY_TIPS[dayOfYear % DAILY_TIPS.length];
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  const renderRecipeCard = useCallback(({ item, index }: { item: RecommendedRecipe; index: number }) => {
    const gradient = RECIPE_GRADIENTS[index % RECIPE_GRADIENTS.length];
    const timeLabel = item.total_time_min ? `${item.total_time_min} min` : null;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(`/browse/${item.id}` as any)}
        style={{ marginRight: Spacing.md }}
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.recCard}
        >
          <Ionicons name="restaurant" size={28} color="rgba(255,255,255,0.25)" style={{ position: 'absolute', top: 12, right: 12 }} />
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Text style={s.recTitle} numberOfLines={2}>{item.title}</Text>
            <View style={s.recMeta}>
              {timeLabel && (
                <View style={s.recPill}>
                  <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.9)" />
                  <Text style={s.recPillText}>{timeLabel}</Text>
                </View>
              )}
              {item.difficulty && (
                <View style={s.recPill}>
                  <Text style={s.recPillText}>{item.difficulty}</Text>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }, []);

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>{greeting}</Text>
            <Text style={[styles.name, { color: theme.text }]}>{firstName}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              {nutritionStreak > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(34,197,94,0.12)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.full }}>
                  <Ionicons name="leaf" size={14} color="#22C55E" />
                  <Text style={{ color: '#22C55E', fontSize: FontSize.xs, fontWeight: '700' }}>{nutritionStreak}d</Text>
                </View>
              )}
              <StreakBadge streak={user?.current_streak || 0} compact />
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push('/(tabs)/profile' as any)}
                style={styles.profileButton}
              >
                <LinearGradient
                  colors={['#22C55E', '#16A34A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.profileGradient}
                >
                  <Text style={styles.profileInitial}>
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* XP Progress */}
        <Card style={{ marginBottom: Spacing.xl }}>
          <XPBar xp={user?.xp_points || 0} />
          {stats?.level_title ? (
            <Text style={{ color: theme.textSecondary, fontSize: FontSize.xs, textAlign: 'center', marginTop: 4 }}>
              {stats.level_title}
            </Text>
          ) : null}
        </Card>

        {/* ── Recommended For You ─────────────────────────────────────── */}
        {recommended.length > 0 && (
          <View style={{ marginBottom: Spacing.xl }}>
            <View style={s.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Recommended For You</Text>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/(tabs)/meals', params: { tab: 'browse' } } as any)}
                hitSlop={12}
              >
                <Text style={[s.seeAll, { color: theme.primary }]}>See All</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={recommended}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={renderRecipeCard}
              contentContainerStyle={{ paddingTop: Spacing.md }}
            />
          </View>
        )}

        {/* ── Today's Plan + Nutrition ────────────────────────────────── */}
        <View style={{ marginBottom: Spacing.xl }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/meals?tab=plan' as any)}
          >
            <Card padding={0}>
              {/* Card header */}
              <View style={s.todayHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.todayTitle, { color: theme.text }]}>Today</Text>
                  <Text style={[s.todayDay, { color: theme.textSecondary }]}>{todayName}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
              </View>

              {/* Meal rows */}
              {todayMeals.length > 0 ? (
                <View style={s.todayMeals}>
                  {todayMeals.map((meal, idx) => {
                    const icon = MEAL_TYPE_ICONS[meal.meal_type?.toLowerCase()] || 'ellipse-outline';
                    const recipeName = meal.recipe_data?.title || meal.meal_type || 'Meal';
                    return (
                      <View key={meal.id || idx} style={[s.mealRow, idx < todayMeals.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.surfaceHighlight }]}>
                        <View style={[s.mealIcon, { backgroundColor: theme.surfaceHighlight }]}>
                          <Ionicons name={icon} size={16} color={theme.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.mealName, { color: theme.text }]} numberOfLines={1}>{recipeName}</Text>
                          <Text style={[s.mealType, { color: theme.textTertiary }]}>{meal.meal_type}</Text>
                        </View>
                        {meal.servings > 0 && (
                          <Text style={[s.mealServings, { color: theme.textTertiary }]}>{meal.servings}x</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={s.todayEmpty}>
                  <Ionicons name="calendar-outline" size={24} color={theme.textTertiary} />
                  <Text style={[s.todayEmptyText, { color: theme.textSecondary }]}>No meals planned for today</Text>
                  <TouchableOpacity
                    onPress={() => router.push('/(tabs)/meals?tab=plan' as any)}
                    style={[s.todayEmptyCta, { backgroundColor: theme.primaryMuted }]}
                  >
                    <Text style={[s.todayEmptyCtaText, { color: theme.primary }]}>Create Plan</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Nutrition overview — ring + macro badges */}
              <View style={[s.nutritionSection, { borderTopWidth: 1, borderTopColor: theme.surfaceHighlight }]}>
                <NutritionRing score={dailySummary?.daily_score ?? 0} color={ringColor} />
                <View style={s.macroBadges}>
                  <MacroBadge label="Calories" pct={dailySummary?.comparison?.calories?.pct ?? 0} theme={theme} />
                  <MacroBadge label="Protein" pct={dailySummary?.comparison?.protein?.pct ?? 0} theme={theme} />
                  {topMicros.length >= 1 && (
                    <MacroBadge label={topMicros[0].label} pct={topMicros[0].pct} theme={theme} />
                  )}
                  {topMicros.length >= 2 && (
                    <MacroBadge label={topMicros[1].label} pct={topMicros[1].pct} theme={theme} />
                  )}
                  {topMicros.length === 0 && (
                    <>
                      <MacroBadge label="Vitamin D" pct={dailySummary?.comparison?.vitamin_d_mcg?.pct ?? 0} theme={theme} />
                      <MacroBadge label="Calcium" pct={dailySummary?.comparison?.calcium_mg?.pct ?? 0} theme={theme} />
                    </>
                  )}
                </View>
              </View>

              {/* CTA strip */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push('/(tabs)/chronometer' as any)}
              >
                <LinearGradient
                  colors={['rgba(59,130,246,0.08)', 'rgba(139,92,246,0.12)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.trackCta}
                >
                  <View style={s.trackCtaIcon}>
                    <Ionicons name="sparkles" size={18} color="#8B5CF6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.trackCtaTitle, { color: theme.text }]}>Track your nutrition</Text>
                    <Text style={[s.trackCtaSub, { color: theme.textTertiary }]}>Log meals & hit your targets</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
                </LinearGradient>
              </TouchableOpacity>
            </Card>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map((action, index) => (
            <TouchableOpacity
              key={index}
              activeOpacity={0.8}
              onPress={() => router.push(action.route as any)}
              style={styles.actionCard}
            >
              <Card padding={Spacing.lg} style={styles.actionCardInner}>
                <LinearGradient
                  colors={action.gradient}
                  style={styles.actionIcon}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name={action.icon} size={22} color="#FFFFFF" />
                </LinearGradient>
                <Text style={[styles.actionLabel, { color: theme.text }]}>{action.label}</Text>
              </Card>
            </TouchableOpacity>
          ))}
        </View>

        {/* Hero Card */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(tabs)/chat')} style={{ marginTop: Spacing.xl }}>
          <LinearGradient
            colors={theme.gradient.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>Transform Your{'\n'}Favorite Foods</Text>
              <Text style={styles.heroSubtitle}>
                Tell our AI what you crave and get a wholesome, delicious version instantly.
              </Text>
              <View style={styles.heroCta}>
                <Text style={styles.heroCtaText}>Try Healthify</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </View>
            </View>
            <View style={styles.heroIconContainer}>
              <Ionicons name="sparkles" size={64} color="rgba(255,255,255,0.2)" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Today's Tip */}
        <Card style={{ marginTop: Spacing.md }}>
          <View style={styles.tipHeader}>
            <Ionicons name="bulb" size={20} color={theme.accent} />
            <Text style={[styles.tipTitle, { color: theme.accent }]}>Daily Tip</Text>
          </View>
          <Text style={[styles.tipText, { color: theme.textSecondary }]}>
            {dailyTip}
          </Text>
        </Card>

        {/* Daily Quests */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.xxl }]}>Today's Quests</Text>
        <Card style={{ overflow: 'hidden', padding: 0 }}>
          {/* Progress header with gradient bar */}
          <View style={[styles.questHeader, { backgroundColor: theme.surface }]}>
            <View style={styles.questHeaderTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                <Ionicons name="flame" size={18} color={theme.accent} />
                <Text style={[styles.questHeaderTitle, { color: theme.text }]}>Daily Progress</Text>
              </View>
              <View style={[styles.questPctBadge, { backgroundColor: completionPct === 100 ? theme.primary : theme.accentMuted }]}>
                <Text style={[styles.questPctText, { color: completionPct === 100 ? '#fff' : theme.accent }]}>{completionPct}%</Text>
              </View>
            </View>
            <View style={[styles.questProgressTrack, { backgroundColor: theme.surfaceHighlight }]}>
              <LinearGradient
                colors={completionPct === 100 ? ['#22C55E', '#059669'] : ['#F59E0B', '#F97316']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.questProgressFill, { width: `${Math.max(completionPct, 2)}%` as any }]}
              />
            </View>
          </View>

          {/* Quest items */}
          {quests.map((quest, idx) => {
            const progress = quest.target_value > 0 ? quest.current_value / quest.target_value : 0;
            return (
              <View
                key={quest.id}
                style={[
                  styles.questItem,
                  { borderBottomColor: theme.border },
                  idx === quests.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={[
                  styles.questIcon,
                  { backgroundColor: quest.completed ? theme.primaryMuted : theme.surfaceHighlight },
                ]}>
                  {quest.completed ? (
                    <Ionicons name="checkmark" size={16} color={theme.primary} />
                  ) : (
                    <Ionicons
                      name={
                        quest.quest_type === 'log_meal' ? 'restaurant-outline' :
                        quest.quest_type === 'healthify' ? 'heart-outline' :
                        quest.quest_type === 'score' ? 'trophy-outline' :
                        quest.quest_type === 'cook' ? 'flame-outline' :
                        'star-outline'
                      }
                      size={16}
                      color={theme.textSecondary}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.questItemTitleRow}>
                    <Text
                      style={[
                        styles.questTitle,
                        { color: quest.completed ? theme.textTertiary : theme.text },
                        quest.completed && { textDecorationLine: 'line-through' },
                      ]}
                      numberOfLines={1}
                    >
                      {quest.title}
                    </Text>
                    <View style={[styles.questXpBadge, { backgroundColor: quest.completed ? theme.primaryMuted : theme.surfaceHighlight }]}>
                      <Text style={[styles.questXpText, { color: quest.completed ? theme.primary : theme.textSecondary }]}>+{quest.xp_reward} XP</Text>
                    </View>
                  </View>
                  {/* Mini progress bar */}
                  <View style={[styles.questMiniTrack, { backgroundColor: theme.surfaceHighlight }]}>
                    <View
                      style={[
                        styles.questMiniFill,
                        {
                          width: `${Math.min(progress * 100, 100)}%` as any,
                          backgroundColor: quest.completed ? theme.primary : theme.accent,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.questMeta, { color: theme.textTertiary }]}>
                    {quest.current_value}/{quest.target_value}
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>

        {/* Weekly Summary */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.xxl }]}>This Week</Text>
        {statsError ? (
          <Card padding={Spacing.lg}>
            <View style={{ alignItems: 'center', gap: Spacing.sm }}>
              <Ionicons name="cloud-offline-outline" size={28} color={theme.textTertiary} />
              <Text style={{ color: theme.textSecondary, fontSize: FontSize.sm, textAlign: 'center' }}>Unable to load weekly stats</Text>
              <TouchableOpacity
                onPress={loadStats}
                style={{ backgroundColor: theme.primaryMuted, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full }}
              >
                <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '700' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ) : (
        <>
        <View style={styles.statsRow}>
          <Card style={styles.statCard} padding={Spacing.md}>
            <Text style={[styles.statNumber, { color: theme.primary }]}>{weeklyStats.meals_cooked}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Meals Cooked</Text>
          </Card>
          <Card style={styles.statCard} padding={Spacing.md}>
            <Text style={[styles.statNumber, { color: theme.accent }]}>{weeklyStats.recipes_saved}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Recipes Saved</Text>
          </Card>
        </View>
        <View style={[styles.statsRow, { marginTop: Spacing.md }]}>
          <Card style={styles.statCard} padding={Spacing.md}>
            <Text style={[styles.statNumber, { color: '#8B5CF6' }]}>{weeklyStats.foods_explored}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Foods Explored</Text>
          </Card>
          <Card style={styles.statCard} padding={Spacing.md}>
            <Text style={[styles.statNumber, { color: theme.info }]}>{weeklyStats.xp_earned}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>XP Earned</Text>
          </Card>
        </View>
        </>
        )}

        <View style={{ height: Spacing.huge }} />
      </ScrollView>
    </ScreenContainer>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning,';
  if (hour < 17) return 'Good afternoon,';
  return 'Good evening,';
}

// ── New Section Styles ─────────────────────────────────────────────────
const s = StyleSheet.create({
  // Section header row
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAll: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  // Recipe card
  recCard: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.25,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    overflow: 'hidden',
  },
  recTitle: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '700',
    lineHeight: 20,
  },
  recMeta: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  recPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  recPillText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    fontWeight: '600',
  },
  // Today card
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  todayTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  todayDay: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    marginTop: 1,
  },
  todayMeals: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  mealIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  mealType: {
    fontSize: FontSize.xs,
    textTransform: 'capitalize',
    marginTop: 1,
  },
  mealServings: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  todayEmpty: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  todayEmptyText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  todayEmptyCta: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
  },
  todayEmptyCtaText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  // Nutrition section
  nutritionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  macroBadges: {
    flex: 1,
    gap: Spacing.sm,
  },
  macroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  macroBadgeLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  macroBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  macroBadgeStatus: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // Track CTA
  trackCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  trackCtaIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(139,92,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackCtaTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  trackCtaSub: {
    fontSize: FontSize.xs,
    marginTop: 1,
  },
});

const styles = StyleSheet.create({
  scroll: {
    paddingTop: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  headerLeft: {},
  headerRight: {},
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  profileGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  greeting: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  name: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  heroCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    overflow: 'hidden',
    flexDirection: 'row',
    minHeight: 160,
  },
  heroContent: {
    flex: 1,
    justifyContent: 'center',
  },
  heroIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: Spacing.md,
  },
  heroTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 30,
  },
  heroSubtitle: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  heroCtaText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  actionCard: {
    width: (width - Spacing.xl * 2 - Spacing.md) / 2,
  },
  actionCardInner: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tipTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  tipText: {
    fontSize: FontSize.sm,
    lineHeight: 22,
  },
  questHeader: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  questHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  questHeaderTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  questPctBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  questPctText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  questProgressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  questProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  questItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  questIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  questTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    flex: 1,
    marginRight: Spacing.xs,
  },
  questXpBadge: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  questXpText: {
    fontSize: FontSize.xs - 1,
    fontWeight: '700',
  },
  questMiniTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 3,
  },
  questMiniFill: {
    height: '100%',
    borderRadius: 2,
  },
  questMeta: {
    fontSize: FontSize.xs - 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statNumber: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    textAlign: 'center',
  },
});
