import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Card } from '../../components/GradientCard';
import { XPBar } from '../../components/XPBar';
import { StreakBadge } from '../../components/StreakBadge';
import { Button } from '../../components/Button';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { gameApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';
import { XP_PER_LEVEL } from '../../constants/Config';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  xp_reward: number;
  category: string;
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { user, logout } = useAuthStore();
  const { mode, setMode } = useThemeStore();
  const [activeTab, setActiveTab] = useState<'stats' | 'achievements'>('stats');
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loadingAchievements, setLoadingAchievements] = useState(false);
  const [achievementsError, setAchievementsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const xp = user?.xp_points || 0;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;

  const loadAchievements = async () => {
    setLoadingAchievements(true);
    setAchievementsError(false);
    try {
      const data = await gameApi.getAchievements();
      setAchievements(data || []);
    } catch {
      setAchievementsError(true);
    } finally {
      setLoadingAchievements(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAchievements();
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'achievements' && achievements.length === 0) {
      loadAchievements();
    }
  }, [activeTab]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const themeOptions: { id: 'system' | 'light' | 'dark'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'system', label: 'System', icon: 'phone-portrait' },
    { id: 'light', label: 'Light', icon: 'sunny' },
    { id: 'dark', label: 'Dark', icon: 'moon' },
  ];

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <LinearGradient colors={theme.gradient.hero} style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.name || 'U').charAt(0).toUpperCase()}
            </Text>
          </LinearGradient>
          <Text style={[styles.name, { color: theme.text }]}>{user?.name || 'User'}</Text>
          <Text style={[styles.email, { color: theme.textSecondary }]}>{user?.email || ''}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.levelBadge, { backgroundColor: theme.primaryMuted }]}>
              <Ionicons name="star" size={14} color={theme.primary} />
              <Text style={[styles.levelText, { color: theme.primary }]}>Level {level}</Text>
            </View>
            <StreakBadge streak={user?.current_streak || 0} compact />
          </View>
        </View>

        {/* XP Progress */}
        <Card style={{ marginBottom: Spacing.xl }}>
          <XPBar xp={xp} />
        </Card>

        {/* Tab Selector */}
        <View style={[styles.tabRow, { backgroundColor: theme.surfaceElevated, borderRadius: BorderRadius.md }]}>
          {(['stats', 'achievements'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
              style={[
                styles.tab,
                activeTab === tab && { backgroundColor: theme.surface },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === tab ? theme.text : theme.textTertiary },
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'stats' ? (
          <>
            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <Card style={styles.statCard} padding={Spacing.lg}>
                <Ionicons name="flame" size={24} color={theme.accent} />
                <Text style={[styles.statValue, { color: theme.text }]}>{user?.current_streak || 0}</Text>
                <Text style={[styles.statLabel, { color: theme.textTertiary }]}>Current Streak</Text>
              </Card>
              <Card style={styles.statCard} padding={Spacing.lg}>
                <Ionicons name="trophy" size={24} color={theme.accent} />
                <Text style={[styles.statValue, { color: theme.text }]}>{user?.longest_streak || 0}</Text>
                <Text style={[styles.statLabel, { color: theme.textTertiary }]}>Best Streak</Text>
              </Card>
              <Card style={styles.statCard} padding={Spacing.lg}>
                <Ionicons name="star" size={24} color={theme.primary} />
                <Text style={[styles.statValue, { color: theme.text }]}>{xp}</Text>
                <Text style={[styles.statLabel, { color: theme.textTertiary }]}>Total XP</Text>
              </Card>
              <Card style={styles.statCard} padding={Spacing.lg}>
                <Ionicons name="ribbon" size={24} color={theme.info} />
                <Text style={[styles.statValue, { color: theme.text }]}>{unlockedCount}</Text>
                <Text style={[styles.statLabel, { color: theme.textTertiary }]}>Achievements</Text>
              </Card>
            </View>

            {/* Theme Selector */}
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Appearance</Text>
            <View style={[styles.themeRow, { backgroundColor: theme.surfaceElevated, borderRadius: BorderRadius.md }]}>
              {themeOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => setMode(opt.id)}
                  activeOpacity={0.7}
                  style={[
                    styles.themeOption,
                    mode === opt.id && { backgroundColor: theme.primary },
                  ]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={mode === opt.id ? '#FFFFFF' : theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.themeOptionText,
                      { color: mode === opt.id ? '#FFFFFF' : theme.textSecondary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Preferences */}
            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.xl }]}>
              Preferences
            </Text>
            <TouchableOpacity
              activeOpacity={0.75}
              style={[styles.settingsRow, { borderBottomColor: theme.border }]}
              onPress={() => router.push('/saved')}
            >
              <View style={[styles.settingsIcon, { backgroundColor: theme.primaryMuted }]}>
                <Ionicons name="bookmark" size={18} color={theme.primary} />
              </View>
              <View style={styles.settingsInfo}>
                <Text style={[styles.settingsLabel, { color: theme.text }]}>Saved Recipes</Text>
                <Text style={[styles.settingsDesc, { color: theme.textTertiary }]} numberOfLines={1}>
                  View all recipes you bookmarked
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </TouchableOpacity>

            {[
              {
                icon: 'nutrition' as const,
                label: 'Dietary Preferences',
                desc: user?.dietary_preferences?.join(', ') || 'Not set',
                section: 'dietary',
              },
              {
                icon: 'flame' as const,
                label: 'Flavor Profile',
                desc: user?.flavor_preferences?.join(', ') || 'Not set',
                section: 'flavor',
              },
              {
                icon: 'alert-circle' as const,
                label: 'Allergies',
                desc: user?.allergies?.join(', ') || 'None',
                section: 'allergies',
              },
              {
                icon: 'close-circle' as const,
                label: 'Disliked Ingredients',
                desc: user?.disliked_ingredients?.join(', ') || 'None',
                section: 'disliked',
              },
              {
                icon: 'restaurant' as const,
                label: 'Liked Proteins',
                desc: user?.protein_preferences?.liked?.join(', ') || 'Not set',
                section: 'liked_proteins',
              },
              {
                icon: 'remove-circle' as const,
                label: 'Proteins to Avoid',
                desc: user?.protein_preferences?.disliked?.join(', ') || 'None',
                section: 'disliked_proteins',
              },
              {
                icon: 'people' as const,
                label: 'Household Size',
                desc: `${user?.household_size || 1} person(s)`,
                section: 'household',
              },
            ].map((item, index) => (
              <TouchableOpacity
                key={index}
                activeOpacity={0.7}
                style={[styles.settingsRow, { borderBottomColor: theme.border }]}
                onPress={() => router.push({ pathname: '/preferences', params: { section: item.section } })}
              >
                <View style={[styles.settingsIcon, { backgroundColor: theme.primaryMuted }]}>
                  <Ionicons name={item.icon} size={18} color={theme.primary} />
                </View>
                <View style={styles.settingsInfo}>
                  <Text style={[styles.settingsLabel, { color: theme.text }]}>{item.label}</Text>
                  <Text style={[styles.settingsDesc, { color: theme.textTertiary }]} numberOfLines={1}>
                    {item.desc}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            {loadingAchievements ? (
              <ActivityIndicator
                size="large"
                color={theme.primary}
                style={{ marginTop: Spacing.huge }}
              />
            ) : (
              <View style={styles.achievementsGrid}>
                {achievements.map((achievement) => (
                  <View key={achievement.id} style={{ opacity: achievement.unlocked ? 1 : 0.45 }}>
                    <Card style={styles.achievementCard} padding={Spacing.lg}>
                      <View
                        style={[
                          styles.achievementIcon,
                          {
                            backgroundColor: achievement.unlocked
                              ? theme.primaryMuted
                              : theme.surfaceHighlight,
                          },
                        ]}
                      >
                        <Ionicons
                          name={achievement.icon as any}
                          size={24}
                          color={achievement.unlocked ? theme.primary : theme.textTertiary}
                        />
                      </View>
                      <Text
                        style={[styles.achievementName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {achievement.name}
                      </Text>
                      <Text
                        style={[styles.achievementDesc, { color: theme.textTertiary }]}
                        numberOfLines={2}
                      >
                        {achievement.description}
                      </Text>
                      <View style={[styles.xpBadge, { backgroundColor: theme.accentMuted }]}>
                        <Text style={[styles.xpBadgeText, { color: theme.accent }]}>
                          +{achievement.xp_reward} XP
                        </Text>
                      </View>
                      {achievement.unlocked && (
                        <View style={[styles.unlockedBadge, { backgroundColor: theme.primary }]}>
                          <Ionicons name="checkmark" size={10} color="#FFF" />
                        </View>
                      )}
                    </Card>
                  </View>
                ))}
                {achievements.length === 0 && !loadingAchievements && (
                  <View style={styles.emptyState}>
                    <Ionicons name={achievementsError ? 'cloud-offline-outline' : 'trophy-outline'} size={48} color={theme.textTertiary} />
                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                      {achievementsError ? 'Unable to load achievements' : 'No achievements yet. Keep exploring!'}
                    </Text>
                    {achievementsError && (
                      <TouchableOpacity
                        onPress={() => {
                          setAchievementsError(false);
                          setLoadingAchievements(true);
                          gameApi
                            .getAchievements()
                            .then((data) => setAchievements(data || []))
                            .catch(() => setAchievementsError(true))
                            .finally(() => setLoadingAchievements(false));
                        }}
                        style={{ backgroundColor: theme.primaryMuted, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full }}
                      >
                        <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '700' }}>Retry</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {/* Logout */}
        <Button
          title="Sign Out"
          variant="ghost"
          onPress={() => {
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign Out',
                style: 'destructive',
                onPress: () => {
                  logout();
                  router.replace('/(auth)/login');
                },
              },
            ]);
          }}
          style={{ marginTop: Spacing.xxxl, marginBottom: Spacing.huge }}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: Spacing.lg,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  name: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  email: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  levelText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    padding: 4,
    marginBottom: Spacing.xl,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  statCard: {
    width: '47%' as any,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statValue: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  themeRow: {
    flexDirection: 'row',
    padding: 4,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.sm,
  },
  themeOptionText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.md,
  },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsInfo: {
    flex: 1,
  },
  settingsLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  settingsDesc: {
    fontSize: FontSize.sm,
    marginTop: 1,
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  achievementCard: {
    width: '47%' as any,
    alignItems: 'center',
    gap: Spacing.sm,
    position: 'relative',
  },
  achievementIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  achievementDesc: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 16,
  },
  xpBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  xpBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  unlockedBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    width: '100%',
    alignItems: 'center',
    paddingTop: Spacing.huge,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.md,
  },
});
