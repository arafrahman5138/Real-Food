import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenContainer } from '../../components/ScreenContainer';
import { useTheme } from '../../hooks/useTheme';
import { nutritionApi, foodApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

// ── Types ──

interface DailyLog {
  id: string;
  title: string;
  meal_type?: string;
  source_type?: string;
  nutrition?: Record<string, number>;
  nutrition_snapshot?: Record<string, number>;
  [key: string]: unknown;
}

interface SearchResult {
  fdc_id?: number;
  id?: number;
  description?: string;
  brand_owner?: string;
  calories_kcal?: number;
}

// ── Component ──

export default function TodaysMealsScreen() {
  const theme = useTheme();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await nutritionApi.getDaily();
      setLogs(data?.logs || []);
    } catch (e) {
      console.error('Failed to fetch logs', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchLogs();
      setLoading(false);
    })();
  }, [fetchLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  }, [fetchLogs]);

  const handleDelete = (logId: string, title: string) => {
    Alert.alert('Remove Meal', `Remove "${title}" from today's log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setDeleting(logId);
          try {
            await nutritionApi.deleteLog(logId);
            await fetchLogs();
          } catch (e) {
            Alert.alert('Error', 'Failed to remove meal.');
          } finally {
            setDeleting(null);
          }
        },
      },
    ]);
  };

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await foodApi.search(q.trim(), 1);
      const foods = Array.isArray(data?.foods) ? data.foods : Array.isArray(data) ? data : [];
      setSearchResults(foods.slice(0, 10));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleAddSearchResult = async (item: SearchResult) => {
    const foodId = item.fdc_id || item.id;
    if (foodId) {
      router.push(`/food/${foodId}` as any);
    }
  };

  // ── Totals ──
  const totals = logs.reduce(
    (acc, log) => {
      const snap = log.nutrition_snapshot || {};
      acc.cal += Number(snap.calories || 0);
      acc.pro += Number(snap.protein || 0);
      acc.carb += Number(snap.carbs || 0);
      acc.fat += Number(snap.fat || 0);
      return acc;
    },
    { cal: 0, pro: 0, carb: 0, fat: 0 },
  );

  return (
    <ScreenContainer safeArea={false} padded={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* ── Summary Banner ── */}
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
          <LinearGradient
            colors={[theme.primary, theme.primary + 'DD'] as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.banner}
          >
          <View style={s.bannerTop}>
            <View>
              <Text style={s.bannerTitle}>Today's Meals</Text>
              <Text style={s.bannerSub}>{logs.length} meal{logs.length !== 1 ? 's' : ''} logged</Text>
            </View>
            <View style={s.bannerCalBadge}>
              <Text style={s.bannerCalText}>{totals.cal.toFixed(0)}</Text>
              <Text style={s.bannerCalUnit}>kcal</Text>
            </View>
          </View>
          <View style={s.bannerMacros}>
            {[
              { label: 'Protein', val: totals.pro, color: 'rgba(255,255,255,0.25)' },
              { label: 'Carbs', val: totals.carb, color: 'rgba(255,255,255,0.25)' },
              { label: 'Fat', val: totals.fat, color: 'rgba(255,255,255,0.25)' },
            ].map((m) => (
              <View key={m.label} style={[s.bannerMacro, { backgroundColor: m.color }]}>
                <Text style={s.bannerMacroVal}>{m.val.toFixed(0)}g</Text>
                <Text style={s.bannerMacroLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
          </LinearGradient>
        </View>

        {/* ── Quick Add Section ── */}
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.md }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setShowSearch(!showSearch)}
            style={[s.addBtn, { backgroundColor: theme.primaryMuted, borderColor: theme.primary + '20' }]}
          >
            <LinearGradient
              colors={[theme.primary, theme.primary + 'BB'] as any}
              style={s.addBtnIcon}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </LinearGradient>
            <Text style={[s.addBtnText, { color: theme.text }]}>Quick Add Food</Text>
            <Ionicons name={showSearch ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textTertiary} />
          </TouchableOpacity>

          {showSearch && (
            <View style={{ marginTop: Spacing.sm }}>
              <View style={[s.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Ionicons name="search" size={16} color={theme.textTertiary} />
                <TextInput
                  style={[s.searchInput, { color: theme.text }]}
                  placeholder="Search foods..."
                  placeholderTextColor={theme.textTertiary}
                  value={searchQuery}
                  onChangeText={handleSearch}
                  autoFocus
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                    <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
              {searching && (
                <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: Spacing.sm }} />
              )}
              {searchResults.length > 0 && (
                <View style={[s.searchResults, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  {searchResults.map((item, idx) => {
                    const key = String(item.fdc_id || item.id || idx);
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => handleAddSearchResult(item)}
                        style={[
                          s.searchResultRow,
                          idx < searchResults.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                        ]}
                      >
                        <View style={[s.searchResultIcon, { backgroundColor: theme.primaryMuted }]}>
                          <Ionicons name="nutrition-outline" size={14} color={theme.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.searchResultName, { color: theme.text }]} numberOfLines={1}>{item.description || 'Unknown'}</Text>
                          {item.brand_owner && (
                            <Text style={[s.searchResultBrand, { color: theme.textTertiary }]} numberOfLines={1}>{item.brand_owner}</Text>
                          )}
                        </View>
                        {item.calories_kcal != null && (
                          <Text style={[s.searchResultCal, { color: theme.textSecondary }]}>{Math.round(item.calories_kcal)} kcal</Text>
                        )}
                        <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Quick Actions ── */}
        <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg }}>
          <TouchableOpacity
            style={[s.quickAction, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => router.push('/(tabs)/meals?tab=browse' as any)}
          >
            <View style={[s.quickActionIcon, { backgroundColor: theme.primaryMuted }]}>
              <Ionicons name="book-outline" size={16} color={theme.primary} />
            </View>
            <Text style={[s.quickActionText, { color: theme.text }]}>Browse Recipes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.quickAction, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => router.push('/food/search' as any)}
          >
            <View style={[s.quickActionIcon, { backgroundColor: theme.accentMuted }]}>
              <Ionicons name="search-outline" size={16} color={theme.accent} />
            </View>
            <Text style={[s.quickActionText, { color: theme.text }]}>Search Foods</Text>
          </TouchableOpacity>
        </View>

        {/* ── Meal List ── */}
        <View style={{ paddingHorizontal: Spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md }}>
            <Text style={[s.sectionTitle, { color: theme.text }]}>Logged Meals</Text>
            {logs.length > 0 && (
              <Text style={[s.sectionCount, { color: theme.textTertiary }]}>{logs.length} item{logs.length !== 1 ? 's' : ''}</Text>
            )}
          </View>

          {loading ? (
            <View style={{ alignItems: 'center', paddingVertical: Spacing.xxxl }}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : logs.length === 0 ? (
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: theme.primaryMuted }]}>
                <Ionicons name="fast-food-outline" size={32} color={theme.primary} />
              </View>
              <Text style={[s.emptyTitle, { color: theme.text }]}>No meals yet</Text>
              <Text style={[s.emptySub, { color: theme.textSecondary }]}>Start by adding your first meal for today</Text>
            </View>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {logs.map((log: DailyLog) => {
                const snap = log.nutrition_snapshot || {};
                const cal = Number(snap.calories || 0);
                const pro = Number(snap.protein || 0);
                const carb = Number(snap.carbs || 0);
                const fat = Number(snap.fat || 0);
                const sourceIcon =
                  log.source_type === 'recipe' ? 'restaurant-outline' :
                  log.source_type === 'meal_plan' ? 'calendar-outline' : 'create-outline';
                const isDeleting = deleting === log.id;

                return (
                  <View
                    key={log.id}
                    style={[s.mealCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  >
                    {/* Top row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                      <LinearGradient
                        colors={[theme.primary + '25', theme.primary + '10'] as any}
                        style={s.mealIcon}
                      >
                        <Ionicons name={sourceIcon as any} size={18} color={theme.primary} />
                      </LinearGradient>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.mealTitle, { color: theme.text }]} numberOfLines={2}>
                          {log.title || 'Untitled'}
                        </Text>
                        {log.meal_type && (
                          <Text style={[s.mealType, { color: theme.textTertiary }]}>
                            {log.meal_type.charAt(0).toUpperCase() + log.meal_type.slice(1)}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDelete(log.id, log.title || 'Untitled')}
                        disabled={isDeleting}
                        style={[s.deleteBtn, { backgroundColor: theme.error + '12' }]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {isDeleting ? (
                          <ActivityIndicator size="small" color={theme.error} />
                        ) : (
                          <Ionicons name="trash-outline" size={16} color={theme.error} />
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* Macro pills */}
                    <View style={s.macroPills}>
                      <View style={[s.macroPill, { backgroundColor: theme.text + '0A' }]}>
                        <Ionicons name="flame-outline" size={12} color={theme.text} />
                        <Text style={[s.macroPillText, { color: theme.text }]}>{cal.toFixed(0)} kcal</Text>
                      </View>
                      {pro > 0 && (
                        <View style={[s.macroPill, { backgroundColor: theme.primary + '12' }]}>
                          <Text style={[s.macroPillText, { color: theme.primary }]}>P {pro.toFixed(0)}g</Text>
                        </View>
                      )}
                      {carb > 0 && (
                        <View style={[s.macroPill, { backgroundColor: theme.accent + '12' }]}>
                          <Text style={[s.macroPillText, { color: theme.accent }]}>C {carb.toFixed(0)}g</Text>
                        </View>
                      )}
                      {fat > 0 && (
                        <View style={[s.macroPill, { backgroundColor: theme.info + '12' }]}>
                          <Text style={[s.macroPillText, { color: theme.info }]}>F {fat.toFixed(0)}g</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ── Styles ──

const s = StyleSheet.create({
  banner: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    borderRadius: 20,
  },
  bannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  bannerSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FontSize.sm,
    fontWeight: '500',
    marginTop: 2,
  },
  bannerCalBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.lg,
  },
  bannerCalText: {
    color: '#fff',
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  bannerCalUnit: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: -2,
  },
  bannerMacros: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  bannerMacro: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  bannerMacroVal: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  bannerMacroLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  addBtnIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '500',
    paddingVertical: 0,
  },
  searchResults: {
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchResultIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  searchResultBrand: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  searchResultCal: {
    fontSize: 11,
    fontWeight: '600',
    marginRight: 4,
  },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  quickActionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  sectionCount: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
    gap: Spacing.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 240,
  },
  mealCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  mealIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  mealType: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    marginTop: 1,
    textTransform: 'capitalize',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  macroPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
