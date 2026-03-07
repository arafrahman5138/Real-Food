import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Card } from '../../components/GradientCard';
import { XPBar } from '../../components/XPBar';
import { StreakBadge } from '../../components/StreakBadge';
import { MetabolicRing } from '../../components/MetabolicRing';
import { MetabolicStreakBadge } from '../../components/MetabolicStreakBadge';
import { XPToast } from '../../components/XPToast';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';
import { useGamificationStore } from '../../stores/gamificationStore';
import { useMealPlanStore } from '../../stores/mealPlanStore';
import { useMetabolicBudgetStore, getTierConfig } from '../../stores/metabolicBudgetStore';
import { gameApi, recipeApi, nutritionApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.42;
const RING_SIZE = 100;
const RING_STROKE = 8;
const CHRONO_MODE_TAB_WIDTH = 56;
const CHRONO_MODE_TAB_GAP = 4;
const CHRONO_MODE_BAR_INSET = 4;
const CHRONO_MODE_TAB_HEIGHT = 32;
const DAY_CONTENT_WIDTH = width - Spacing.xl * 2;
const DAY_PILL_WIDTH = DAY_CONTENT_WIDTH / 7;
const TODAY_DAY_INDEX = 22; // offset 0 in [-22..+8]
const INITIAL_DAY_INDEX = Math.max(0, TODAY_DAY_INDEX - 3);

const toDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

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

const MACRO_KEYS = new Set(['calories', 'protein', 'carbs', 'fat', 'fiber']);

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
  logs?: Array<{
    id?: string;
    title?: string;
    meal_type?: string;
    servings?: number;
    source_type?: string;
  }>;
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
  const dailyMES = useMetabolicBudgetStore((s) => s.dailyScore);
  const remainingBudget = useMetabolicBudgetStore((s) => s.remainingBudget);
  const metabolicStreak = useMetabolicBudgetStore((s) => s.streak);
  const fetchMetabolic = useMetabolicBudgetStore((s) => s.fetchAll);
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
  const [xpToast, setXpToast] = useState<string | null>(null);
  const [xpToastIcon, setXpToastIcon] = useState<string>('flash');
  const [chronoPanelView, setChronoPanelView] = useState<'snapshot' | 'logged' | 'activity'>('snapshot');
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => toDateKey(new Date()));
  const chronoModeAnim = useRef(new Animated.Value(0)).current;
  const chronoPanelOpacity = useRef(new Animated.Value(1)).current;
  const chronoPanelLift = useRef(new Animated.Value(0)).current;
  const weekPulse = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const weekListRef = useRef<FlatList<any>>(null);

  const weekDays = useMemo(() => {
    const now = new Date();
    const anchor = new Date(now);
    anchor.setHours(0, 0, 0, 0);

    return Array.from({ length: 31 }).map((_, idx) => {
      const offset = idx - 22; // range: -22 days to +8 days
      const d = new Date(anchor);
      d.setDate(anchor.getDate() + offset);
      return {
        key: d.toISOString(),
        dayKey: toDateKey(d),
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        date: d.getDate(),
        offset,
        isToday:
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate(),
      };
    });
  }, []);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(weekPulse, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(weekPulse, { toValue: 0, duration: 850, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [weekPulse]);

  useEffect(() => {
    const t = setTimeout(() => {
      weekListRef.current?.scrollToIndex({ index: INITIAL_DAY_INDEX, animated: false });
    }, 0);
    return () => clearTimeout(t);
  }, []);

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
      fetchMetabolic(),
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
    fetchMetabolic();
  }, []);

  // Show toast for metabolic streak milestones and daily tier XP
  const prevStreakRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (!metabolicStreak) return;
    const current = metabolicStreak.current_streak;
    const prev = prevStreakRef.current;
    prevStreakRef.current = current;

    if (prev === null || prev === current || current === 0) return;

    // Milestone streaks
    const milestones = [30, 14, 7, 3];
    for (const ms of milestones) {
      if (current >= ms && (prev < ms)) {
        const labels: Record<number, string> = { 3: 'Bronze', 7: 'Silver', 14: 'Gold', 30: 'Diamond' };
        setXpToastIcon('flash');
        setXpToast(`Energy Streak: ${labels[ms]}! 🔥 ${current} days`);
        return;
      }
    }

    // Generic streak growth
    if (current > prev) {
      setXpToastIcon('battery-charging');
      setXpToast(`Energy streak: ${current} days!`);
    }
  }, [metabolicStreak]);

  // Today's meals from plan
  const selectedDate = useMemo(() => {
    const found = weekDays.find((d) => d.dayKey === selectedDayKey);
    if (found) {
      const [y, m, day] = found.dayKey.split('-').map(Number);
      return new Date(y, (m || 1) - 1, day || 1);
    }
    return new Date();
  }, [weekDays, selectedDayKey]);
  const selectedDayName = DAYS[selectedDate.getDay()];
  const selectedDayNameLong = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });

  const todayMeals = useMemo(() => {
    if (!currentPlan?.items) return [];
    return currentPlan.items.filter(
      (item) => item.day_of_week?.toLowerCase() === selectedDayName.toLowerCase()
    );
  }, [currentPlan, selectedDayName]);

  // Nutrition ring color based on score
  const ringColor = useMemo(() => {
    const score = dailySummary?.daily_score ?? 0;
    if (score >= 80) return '#22C55E';
    if (score >= 50) return '#3B82F6';
    if (score >= 25) return '#F59E0B';
    return '#EF4444';
  }, [dailySummary]);

  // Top 2 micronutrients to highlight (lowest % — areas to improve)
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

  const calorieConsumed = Math.round(dailySummary?.comparison?.calories?.consumed ?? 0);
  const calorieTarget = Math.round(dailySummary?.comparison?.calories?.target ?? 0);
  const proteinConsumed = Math.round(dailySummary?.comparison?.protein?.consumed ?? 0);
  const proteinTarget = Math.round(dailySummary?.comparison?.protein?.target ?? 0);
  const carbsConsumed = Math.round(dailySummary?.comparison?.carbs?.consumed ?? 0);
  const carbsTarget = Math.round(dailySummary?.comparison?.carbs?.target ?? 0);
  const fatConsumed = Math.round(dailySummary?.comparison?.fat?.consumed ?? 0);
  const fatTarget = Math.round(dailySummary?.comparison?.fat?.target ?? 0);
  const mesDisplayScore = Math.round(dailyMES?.score?.display_score ?? dailyMES?.score?.total_score ?? 0);
  const mesTierKey = dailyMES?.score?.display_tier ?? dailyMES?.score?.tier ?? 'critical';
  const mesTierLabelMap: Record<string, string> = {
    optimal: 'Elite Fuel',
    good: 'Momentum',
    moderate: 'Steady Burn',
    low: 'Low Energy',
    critical: 'Energy Drain',
    // Legacy aliases
    stable: 'Momentum',
    shaky: 'Steady Burn',
    crash_risk: 'Energy Drain',
  };
  const mesTierLabel = mesTierLabelMap[mesTierKey] || 'Energy Drain';
  const mesTierColor = getTierConfig(mesTierKey).color;
  const loggedMeals = useMemo(
    () =>
      (dailySummary?.logs || [])
        .filter((log) => !log.source_type || log.source_type === 'recipe' || log.source_type === 'food')
        .slice(0, 3),
    [dailySummary]
  );

  const openChronoPanelRoute = (mode: 'snapshot' | 'logged' | 'activity') => {
    if (mode === 'snapshot') {
      router.push('/(tabs)/chronometer' as any);
      return;
    }
    if (mode === 'logged') {
      router.push('/food/meals' as any);
      return;
    }
    router.push('/(tabs)/chronometer' as any);
  };

  const handleChronoModePress = (mode: 'snapshot' | 'logged' | 'activity') => {
    if (chronoPanelView === mode) {
      openChronoPanelRoute(mode);
      return;
    }
    const modeOrder: Array<'snapshot' | 'logged' | 'activity'> = ['snapshot', 'logged', 'activity'];
    const nextIndex = modeOrder.indexOf(mode);

    Animated.spring(chronoModeAnim, {
      toValue: nextIndex,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();

    Animated.parallel([
      Animated.timing(chronoPanelOpacity, { toValue: 0, duration: 90, useNativeDriver: true }),
      Animated.timing(chronoPanelLift, { toValue: 6, duration: 90, useNativeDriver: true }),
    ]).start(() => {
      setChronoPanelView(mode);
      Animated.parallel([
        Animated.timing(chronoPanelOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(chronoPanelLift, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 5 }),
      ]).start();
    });
  };

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
      <XPToast message={xpToast} icon={xpToastIcon} onDismissed={() => setXpToast(null)} />
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
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
              {metabolicStreak && metabolicStreak.current_streak > 0 && (
                <MetabolicStreakBadge currentStreak={metabolicStreak.current_streak} compact />
              )}
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

        <Animated.View
          style={[
            styles.weekStripWrap,
            {
              height: scrollY.interpolate({
                inputRange: [0, 80],
                outputRange: [72, 44],
                extrapolate: 'clamp',
              }),
            },
          ]}
        >
          <Animated.View
            style={[
              styles.weekStrip,
              {
                opacity: scrollY.interpolate({
                  inputRange: [0, 80],
                  outputRange: [1, 0.92],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          >
            <FlatList
              ref={weekListRef}
              horizontal
              data={weekDays}
              keyExtractor={(item) => item.key}
              showsHorizontalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
              pagingEnabled
              decelerationRate="fast"
              initialScrollIndex={INITIAL_DAY_INDEX}
              getItemLayout={(_, index) => ({
                length: DAY_PILL_WIDTH,
                offset: DAY_PILL_WIDTH * index,
                index,
              })}
              onScrollToIndexFailed={() => {}}
              contentContainerStyle={styles.weekListContent}
              renderItem={({ item: day }) => {
                const pulseScale = weekPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.08],
                });
                const isSelected = day.dayKey === selectedDayKey;
                const isToday = day.isToday;
                return (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setSelectedDayKey(day.dayKey)}
                    style={styles.weekItem}
                  >
                    <Text
                      style={[
                        styles.weekDayLabel,
                        { color: isSelected || isToday ? theme.text : theme.textSecondary },
                        isSelected && styles.weekDayLabelActive,
                      ]}
                    >
                      {day.label}
                    </Text>
                    <Animated.View
                      style={[
                        styles.weekRing,
                        isSelected && styles.weekRingToday,
                        {
                          borderColor: isSelected ? theme.primary : isToday ? theme.primary + '88' : theme.border,
                          backgroundColor: isSelected ? undefined : isToday ? theme.primary + '0D' : undefined,
                        },
                        isSelected && { transform: [{ scale: pulseScale }] },
                      ]}
                    >
                      <Text style={[styles.weekDate, { color: isSelected ? theme.primary : theme.text }]}>{day.date}</Text>
                    </Animated.View>
                  </TouchableOpacity>
                );
              }}
            />
          </Animated.View>
        </Animated.View>

        {/* Chronometer Snapshot / Logged Panel */}
        <View style={styles.chronoWrap}>
          <Animated.View
            style={[
              styles.chronoMain,
              {
                opacity: chronoPanelOpacity,
                transform: [{ translateY: chronoPanelLift }],
              },
            ]}
          >
            {chronoPanelView === 'snapshot' ? (
                <View style={styles.chronoSnapshotWrap}>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => openChronoPanelRoute('snapshot')}
                  >
                    <LinearGradient
                      colors={['#FFFFFF', '#FBFCF9']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.chronoHero, { borderColor: theme.primary + '22' }]}
                    >
                      <View style={styles.chronoHeroLeft}>
                        <Text style={[styles.chronoEyebrow, { color: theme.primary }]}>Daily Fuel</Text>
                        <View style={styles.chronoValueRow}>
                          <Text style={[styles.chronoValue, { color: theme.text }]}>
                            {calorieConsumed}
                            <Text style={[styles.chronoValueTarget, { color: theme.textSecondary }]}> / {calorieTarget || 0}</Text>
                          </Text>
                          <Text style={[styles.chronoLabelInline, { color: theme.textSecondary }]}>cal</Text>
                        </View>
                        <View style={styles.chronoPillsRow}>
                          <View style={[styles.chronoPill, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
                            <Ionicons name="barbell-outline" size={12} color={theme.primary} />
                            <Text style={[styles.chronoPillText, { color: theme.primary }]}>
                              {Math.max((proteinTarget || 0) - proteinConsumed, 0)}g protein left
                            </Text>
                          </View>
                          <View style={[styles.chronoPill, { backgroundColor: 'rgba(245,158,11,0.14)' }]}>
                            <Ionicons name="leaf-outline" size={12} color="#D97706" />
                            <Text style={[styles.chronoPillText, { color: '#D97706' }]}>
                              {Math.round(remainingBudget?.sugar_headroom_g ?? 0)}g carb room
                            </Text>
                          </View>
                        </View>
                        <View style={[styles.chronoCalTrack, { backgroundColor: theme.surfaceHighlight }]}>
                          <LinearGradient
                            colors={[theme.primary, '#7DD3A7'] as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[
                              styles.chronoCalFill,
                              { width: `${Math.max(6, Math.min(100, calorieTarget > 0 ? (calorieConsumed / calorieTarget) * 100 : 0))}%` },
                            ]}
                          />
                        </View>
                      </View>
                      <View style={[styles.chronoHeroScorePanel, { backgroundColor: '#FCFCFA' }]}>
                        <View style={[styles.chronoMesPill, styles.chronoMesPillCentered, { backgroundColor: mesTierColor + '18' }]}>
                          <Text style={[styles.chronoMesPillText, { color: mesTierColor }]}>{mesTierLabel}</Text>
                        </View>
                        <View style={styles.chronoRingWrap}>
                          <MetabolicRing
                            score={dailyMES?.score?.display_score ?? dailyMES?.score?.total_score ?? 0}
                            tier={dailyMES?.score?.display_tier ?? dailyMES?.score?.tier ?? 'crash_risk'}
                            size={106}
                            showLabel
                          />
                        </View>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                  <View style={styles.chronoMiniRow}>
                    {[
                      { label: 'Protein eaten', consumed: proteinConsumed, target: proteinTarget, icon: 'barbell-outline' as const, color: '#22C55E' },
                      { label: 'Carbs eaten', consumed: carbsConsumed, target: carbsTarget, icon: 'nutrition-outline' as const, color: '#F59E0B' },
                      { label: 'Fat eaten', consumed: fatConsumed, target: fatTarget, icon: 'water-outline' as const, color: '#3B82F6' },
                    ].map((item) => (
                      <TouchableOpacity
                        key={item.label}
                        activeOpacity={0.88}
                        onPress={() => openChronoPanelRoute('snapshot')}
                        style={[styles.chronoMiniCard, { backgroundColor: theme.card.background, borderColor: theme.border }]}
                      >
                        <View style={[styles.chronoMiniAccent, { backgroundColor: item.color }]} />
                        <Text style={[styles.chronoMiniValue, { color: theme.text }]}>
                          {item.consumed}
                          <Text style={[styles.chronoMiniTarget, { color: theme.textSecondary }]}>/{item.target || 0}g</Text>
                        </Text>
                        <Text style={[styles.chronoMiniLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                        <View style={[styles.chronoMiniIcon, { backgroundColor: item.color + '16' }]}>
                          <Ionicons name={item.icon} size={14} color={item.color} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
            ) : chronoPanelView === 'logged' ? (
                <View style={[styles.chronoLoggedCard, styles.chronoFixedCard, { backgroundColor: theme.card.background, borderColor: theme.border }]}>
                  <View style={styles.chronoLoggedHeader}>
                    <Text style={[styles.chronoLoggedTitle, { color: theme.text }]}>Today's Meals Logged</Text>
                    <View style={[styles.chronoLoggedCountPill, { backgroundColor: theme.primaryMuted }]}>
                      <Text style={[styles.chronoLoggedCountText, { color: theme.primary }]}>{loggedMeals.length}</Text>
                    </View>
                  </View>
                  {loggedMeals.length > 0 ? (
                    <View style={styles.chronoLoggedList}>
                      {loggedMeals.map((log, idx) => {
                        const icon = MEAL_TYPE_ICONS[(log.meal_type || '').toLowerCase()] || 'restaurant-outline';
                        return (
                          <View key={`${log.id || log.title || 'log'}-${idx}`} style={[styles.chronoLoggedRow, idx < loggedMeals.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.surfaceHighlight }]}>
                            <View style={[styles.chronoLoggedIcon, { backgroundColor: theme.surfaceHighlight }]}>
                              <Ionicons name={icon} size={14} color={theme.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.chronoLoggedMealName, { color: theme.text }]} numberOfLines={1}>
                                {log.title || 'Meal'}
                              </Text>
                              <Text style={[styles.chronoLoggedMeta, { color: theme.textSecondary }]}>
                                {(log.meal_type || 'meal').toLowerCase()}
                              </Text>
                            </View>
                            <Text style={[styles.chronoLoggedServings, { color: theme.textTertiary }]}>{log.servings || 1}x</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.chronoLoggedEmpty}>
                      <Ionicons name="restaurant-outline" size={20} color={theme.textTertiary} />
                      <Text style={[styles.chronoLoggedEmptyText, { color: theme.textSecondary }]}>No meals logged yet today</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={[styles.chronoLoggedCard, styles.chronoFixedCard, { backgroundColor: theme.card.background, borderColor: theme.border }]}>
                  <View style={styles.chronoLoggedHeader}>
                    <Text style={[styles.chronoLoggedTitle, { color: theme.text }]}>Activity Snapshot</Text>
                    <View style={[styles.chronoLoggedCountPill, { backgroundColor: theme.primaryMuted }]}>
                      <Text style={[styles.chronoLoggedCountText, { color: theme.primary }]}>Today</Text>
                    </View>
                  </View>
                  <View style={styles.activityGrid}>
                    {[
                      { label: 'Steps', value: '7,842', sub: 'of 10,000', icon: 'walk-outline' as const, color: '#22C55E' },
                      { label: 'Active Min', value: '42', sub: 'of 60', icon: 'time-outline' as const, color: '#F59E0B' },
                      { label: 'Distance', value: '3.9 mi', sub: 'goal 5.0', icon: 'map-outline' as const, color: '#3B82F6' },
                      { label: 'Burned', value: '468', sub: 'calories active', icon: 'flame-outline' as const, color: '#EF4444' },
                    ].map((item) => (
                      <View key={item.label} style={[styles.activityCard, { backgroundColor: '#FFFFFF', borderColor: theme.border }]}>
                        <View style={[styles.activityIcon, { backgroundColor: item.color + '18' }]}>
                          <Ionicons name={item.icon} size={14} color={item.color} />
                        </View>
                        <Text style={[styles.activityValue, { color: theme.text }]}>{item.value}</Text>
                        <Text style={[styles.activityLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                        <Text style={[styles.activitySub, { color: theme.textTertiary }]}>{item.sub}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
          </Animated.View>

          <BlurView intensity={45} tint="light" style={[styles.chronoModeBar, { borderColor: theme.border }]}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.chronoModeActiveBubble,
                {
                  backgroundColor: theme.primaryMuted,
                  borderColor: theme.border,
                  transform: [
                    {
                      translateX: chronoModeAnim.interpolate({
                        inputRange: [0, 1, 2],
                        outputRange: [
                          CHRONO_MODE_BAR_INSET,
                          CHRONO_MODE_BAR_INSET + CHRONO_MODE_TAB_WIDTH + CHRONO_MODE_TAB_GAP,
                          CHRONO_MODE_BAR_INSET + (CHRONO_MODE_TAB_WIDTH + CHRONO_MODE_TAB_GAP) * 2,
                        ],
                      }),
                    },
                  ],
                },
              ]}
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleChronoModePress('snapshot')}
              style={[
                styles.chronoModeTab,
                { backgroundColor: 'transparent' },
              ]}
            >
              <Ionicons name="analytics-outline" size={18} color={chronoPanelView === 'snapshot' ? theme.primary : theme.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleChronoModePress('logged')}
              style={[
                styles.chronoModeTab,
                { backgroundColor: 'transparent' },
              ]}
            >
              <Ionicons name="restaurant-outline" size={18} color={chronoPanelView === 'logged' ? theme.primary : theme.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleChronoModePress('activity')}
              style={[
                styles.chronoModeTab,
                { backgroundColor: 'transparent' },
              ]}
            >
              <Ionicons name="walk-outline" size={18} color={chronoPanelView === 'activity' ? theme.primary : theme.textSecondary} />
            </TouchableOpacity>
          </BlurView>
        </View>

        {/* ── Today's Plan ─────────────────────────────────────────────── */}
        <View style={{ marginBottom: Spacing.xl }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/meals?tab=plan' as any)}
          >
            <Card padding={0}>
              {/* Card header */}
              <View style={s.todayHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.todayTitle, { color: theme.text }]}>Today's Plan</Text>
                  <Text style={[s.todayDay, { color: theme.textSecondary }]}>{selectedDayNameLong}</Text>
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
            </Card>
          </TouchableOpacity>
        </View>

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

        {/* XP Progress */}
        <Card style={{ marginBottom: Spacing.xl }}>
          <XPBar xp={user?.xp_points || 0} />
          {stats?.level_title ? (
            <Text style={{ color: theme.textSecondary, fontSize: FontSize.xs, textAlign: 'center', marginTop: 4 }}>
              {stats.level_title}
            </Text>
          ) : null}
        </Card>

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
                        quest.quest_type === 'logging' ? 'restaurant-outline' :
                        quest.quest_type === 'healthify' ? 'heart-outline' :
                        quest.quest_type === 'score' ? 'trophy-outline' :
                        quest.quest_type === 'cook' ? 'flame-outline' :
                        quest.quest_type === 'metabolic' ? 'flash-outline' :
                        'star-outline'
                      }
                      size={16}
                      color={quest.quest_type === 'metabolic' ? theme.accent : theme.textSecondary}
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
      </Animated.ScrollView>
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
    paddingBottom: 120,
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
  chronoWrap: {
    marginBottom: Spacing.xl,
  },
  chronoMain: {
    width: '100%',
    height: 294,
  },
  chronoSnapshotWrap: {
    height: '100%',
    justifyContent: 'flex-start',
  },
  chronoHero: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  chronoHeroLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  chronoEyebrow: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  chronoValue: {
    fontSize: FontSize.hero,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  chronoValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  chronoValueTarget: {
    fontSize: FontSize.xxl,
    fontWeight: '600',
  },
  chronoLabelInline: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: 7,
  },
  chronoMesPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    marginBottom: 2,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  chronoMesPillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  chronoPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.xs + 2,
  },
  chronoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  chronoPillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  chronoCalTrack: {
    height: 7,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginTop: Spacing.xs + 2,
  },
  chronoCalFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  chronoHeroScorePanel: {
    width: 122,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.xs,
  },
  chronoRingWrap: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chronoMesPillCentered: {
    alignSelf: 'center',
    marginTop: 0,
    marginBottom: Spacing.xs + 4,
  },
  chronoScorePanelCaption: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  chronoMiniRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 8,
  },
  chronoMiniCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 2,
    gap: 4,
    overflow: 'hidden',
  },
  chronoMiniAccent: {
    width: 24,
    height: 3,
    borderRadius: BorderRadius.full,
    marginBottom: 2,
  },
  chronoMiniValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  chronoMiniTarget: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  chronoMiniLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  chronoMiniIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chronoLoggedCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    minHeight: 218,
  },
  chronoFixedCard: {
    height: '100%',
  },
  chronoLoggedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  chronoLoggedTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  chronoLoggedCountPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  chronoLoggedCountText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  chronoLoggedList: {
    gap: 0,
  },
  chronoLoggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  chronoLoggedIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chronoLoggedMealName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  chronoLoggedMeta: {
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  chronoLoggedServings: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  chronoLoggedEmpty: {
    flex: 1,
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  chronoLoggedEmptyText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  activityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: 2,
  },
  activityCard: {
    width: '48.5%',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 4,
  },
  activityIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityValue: {
    fontSize: FontSize.md,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  activityLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  activitySub: {
    fontSize: FontSize.xs - 1,
    fontWeight: '500',
  },
  chronoModeBar: {
    marginTop: 10,
    alignSelf: 'center',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: CHRONO_MODE_BAR_INSET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: CHRONO_MODE_TAB_GAP,
    overflow: 'hidden',
    position: 'relative',
  },
  chronoModeActiveBubble: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: CHRONO_MODE_TAB_WIDTH,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chronoModeTab: {
    width: CHRONO_MODE_TAB_WIDTH,
    minHeight: CHRONO_MODE_TAB_HEIGHT,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    zIndex: 1,
  },
  weekStripWrap: {
    marginBottom: Spacing.md,
  },
  weekStrip: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  weekListContent: {
    paddingHorizontal: 0,
  },
  weekItem: {
    width: DAY_PILL_WIDTH,
    alignItems: 'center',
    gap: 5,
  },
  weekDayLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  weekDayLabelActive: {
    fontWeight: '800',
  },
  weekRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRingToday: {
    backgroundColor: 'rgba(34,197,94,0.10)',
  },
  weekDate: {
    fontSize: FontSize.md,
    fontWeight: '700',
    letterSpacing: -0.1,
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
