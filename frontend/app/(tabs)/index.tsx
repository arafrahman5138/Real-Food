import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
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
import { gameApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

const { width } = Dimensions.get('window');

const DAILY_TIPS = [
  'Swap refined vegetable oils with extra virgin olive oil or avocado oil. They\'re rich in healthy monounsaturated fats and antioxidants.',
  'Aim for at least 30 different plant foods per week — fruits, vegetables, nuts, seeds, herbs, and whole grains — to support gut microbiome diversity.',
  'Eat the rainbow! Different colored produce provides different phytonutrients. Try to include at least 3 colors at each meal.',
  'Wild-caught fish like salmon, mackerel, and sardines are excellent sources of omega-3 fatty acids essential for brain and heart health.',
  'Fermented foods like yogurt, kimchi, sauerkraut, and kefir support a healthy gut. Try to include one serving daily.',
  'Soaking and sprouting grains, nuts, and legumes can increase nutrient bioavailability and reduce anti-nutrients like phytic acid.',
  'Dark leafy greens like kale, spinach, and Swiss chard are among the most nutrient-dense foods on the planet. Aim for a daily serving.',
];

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

export default function HomeScreen() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const quests = useGamificationStore((s) => s.quests);
  const completionPct = useGamificationStore((s) => s.completionPct);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats>({
    meals_cooked: 0,
    recipes_saved: 0,
    foods_explored: 0,
    xp_earned: 0,
  });
  const [statsError, setStatsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    setStatsError(false);
    try {
      const data = await gameApi.getWeeklyStats();
      setWeeklyStats(data);
    } catch {
      setStatsError(true);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, []);

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
      icon: 'trophy',
      label: 'My\nProfile',
      route: '/(tabs)/profile',
      gradient: ['#14B8A6', '#0D9488'],
    },
  ];

  const firstName = user?.name?.split(' ')[0] || 'there';
  const greeting = getGreeting();
  const dailyTip = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return DAILY_TIPS[dayOfYear % DAILY_TIPS.length];
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
            <StreakBadge streak={user?.current_streak || 0} compact />
          </View>
        </View>

        {/* XP Progress */}
        <Card style={{ marginBottom: Spacing.xl }}>
          <XPBar xp={user?.xp_points || 0} />
        </Card>

        {/* Hero Card */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(tabs)/chat')}>
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

        {/* Today's Tip */}
        <Card style={{ marginTop: Spacing.xl }}>
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
        <Card>
          <View style={styles.questHeaderRow}>
            <Text style={[styles.questHeaderTitle, { color: theme.text }]}>Daily Progress</Text>
            <Text style={[styles.questHeaderPct, { color: theme.primary }]}>{completionPct}%</Text>
          </View>
          {quests.map((quest) => (
            <View key={quest.id} style={styles.questRow}>
              <View style={[styles.questDot, { backgroundColor: quest.completed ? theme.primary : theme.surfaceHighlight }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.questTitle, { color: theme.text }]}>{quest.title}</Text>
                <Text style={[styles.questMeta, { color: theme.textTertiary }]}>
                  {quest.progress}/{quest.target} · +{quest.xpReward} XP
                </Text>
              </View>
              {quest.completed ? <Ionicons name="checkmark-circle" size={18} color={theme.primary} /> : null}
            </View>
          ))}
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
    marginBottom: Spacing.xxl,
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
  questHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  questHeaderTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  questHeaderPct: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  questRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
  },
  questDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  questTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  questMeta: {
    fontSize: FontSize.xs,
    marginTop: 1,
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
