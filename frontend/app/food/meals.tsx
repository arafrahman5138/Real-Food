import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { CompositeMealCard, SingleMealRow } from '../../components/CompositeMealCard';
import { MealMESBadge } from '../../components/MealMESBadge';
import { useTheme } from '../../hooks/useTheme';
import { nutritionApi, foodApi, recipeApi } from '../../services/api';
import { useMetabolicBudgetStore } from '../../stores/metabolicBudgetStore';
import type { MealMES } from '../../stores/metabolicBudgetStore';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

// ── Types ──

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
  const mealScores = useMetabolicBudgetStore((s) => s.mealScores);
  const fetchMealScores = useMetabolicBudgetStore((s) => s.fetchMealScores);

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
      await Promise.all([fetchLogs(), fetchMealScores()]);
      setLoading(false);
    })();
  }, [fetchLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchLogs(), fetchMealScores()]);
    setRefreshing(false);
  }, [fetchLogs]);

  const handleDelete = (logId: string, title: string, groupId?: string | null) => {
    const label = groupId ? `"${title}" and its side` : `"${title}"`;
    Alert.alert('Remove Meal', `Remove ${label} from today's log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setDeleting(logId);
          try {
            if (groupId) {
              await nutritionApi.deleteGroupLogs(groupId);
            } else {
              await nutritionApi.deleteLog(logId);
            }
            await fetchLogs();
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to remove meal.';
            console.error('Delete meal failed', { logId, title, error: msg });
            Alert.alert('Error', msg);
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

  // Count distinct meals (grouped pair = 1 meal)
  const mealCount = useMemo(() => {
    const groupIds = new Set<string>();
    let count = 0;
    for (const log of logs) {
      if (log.group_id) {
        if (!groupIds.has(log.group_id)) {
          groupIds.add(log.group_id);
          count++;
        }
      } else {
        count++;
      }
    }
    return count;
  }, [logs]);

  // ── Backfill group MES scores for logs created before score storage ──
  const [backfilledScores, setBackfilledScores] = useState<Record<string, { score: number; tier: string }>>({});
  useEffect(() => {
    let cancelled = false;
    const groupMap = new Map<string, DailyLog[]>();
    for (const log of logs) {
      if (!log.group_id) continue;
      const list = groupMap.get(log.group_id) || [];
      list.push(log);
      groupMap.set(log.group_id, list);
    }
    const needsBackfill = Array.from(groupMap.entries()).filter(([, groupLogs]) => {
      if (groupLogs.length < 2) return false;
      return !groupLogs.some((l) => l.group_mes_score != null);
    });
    if (needsBackfill.length === 0) return;
    (async () => {
      for (const [groupId, groupLogs] of needsBackfill) {
        if (cancelled) return;
        try {
          const recipeLogs = groupLogs.filter((x) => x.source_type === 'recipe' && x.source_id);
          if (recipeLogs.length < 2) continue;
          const mainRecipeId = String(recipeLogs[0].source_id);
          const sideRecipeId = String(recipeLogs[1].source_id);
          // Fetch main recipe + pairing suggestions in parallel
          const [mainRecipe, pairings] = await Promise.all([
            recipeApi.getDetail(mainRecipeId).catch(() => null as any),
            recipeApi.getPairingSuggestions(mainRecipeId, 50).catch(() => [] as any[]),
          ]);
          const matchedPair = pairings.find((p: any) => String(p.recipe_id) === sideRecipeId);
          if (matchedPair) {
            // Use same formula as detail page: min(100, storedRawMes + mes_delta)
            const storedRawMes = Number(mainRecipe?.nutrition_info?.mes_score ?? 0);
            const hasStoredRawMes = Number.isFinite(storedRawMes) && storedRawMes > 0;
            const score = hasStoredRawMes
              ? Math.min(100, Number((storedRawMes + (matchedPair.mes_delta ?? 0)).toFixed(1)))
              : Number(matchedPair.combined_display_score ?? matchedPair.combined_mes_score ?? 0);
            const tier = score >= 80 ? 'optimal' : score >= 60 ? 'stable' : score >= 40 ? 'shaky' : 'crash_risk';
            if (score > 0 && !cancelled) {
              setBackfilledScores((prev) => ({ ...prev, [groupId]: { score, tier } }));
              for (const log of groupLogs) {
                nutritionApi.updateLog(log.id, { group_mes_score: score, group_mes_tier: tier }).catch(() => {});
              }
            }
          }
        } catch { /* skip */ }
      }
    })();
    return () => { cancelled = true; };
  }, [logs.map((l) => `${l.id}:${l.group_id}:${l.group_mes_score}`).join('|')]);

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
              <Text style={s.bannerSub}>{mealCount} meal{mealCount !== 1 ? 's' : ''} logged</Text>
            </View>
            <View style={s.bannerCalBadge}>
              <Text style={s.bannerCalText}>{totals.cal.toFixed(0)}</Text>
              <Text style={s.bannerCalUnit}>calories</Text>
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
                          <Text style={[s.searchResultCal, { color: theme.textSecondary }]}>{Math.round(item.calories_kcal)} calories</Text>
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
            {mealCount > 0 && (
              <Text style={[s.sectionCount, { color: theme.textTertiary }]}>{mealCount} item{mealCount !== 1 ? 's' : ''}</Text>
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
            (() => {
              // Group logs by meal_type
              const GROUPABLE_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
              const grouped: Record<string, DailyLog[]> = {};
              const ungrouped: DailyLog[] = [];

              for (const log of logs) {
                const mt = (log.meal_type || 'meal').toLowerCase();
                if (GROUPABLE_TYPES.includes(mt)) {
                  if (!grouped[mt]) grouped[mt] = [];
                  grouped[mt].push(log);
                } else {
                  ungrouped.push(log);
                }
              }

              const mealGroups = GROUPABLE_TYPES
                .filter(mt => grouped[mt] && grouped[mt].length > 0)
                .map(mt => ({
                  mealType: mt,
                  logs: grouped[mt],
                  mealScores: mealScores.filter((ms: MealMES) =>
                    grouped[mt].some(l => l.id === ms.food_log_id)
                  ),
                }));

              return (
                <View style={{ gap: Spacing.sm }}>
                  {/* Composite meal groups */}
                  {mealGroups.map((group) =>
                    group.logs.length >= 2 ? (
                      <View key={group.mealType} style={{ gap: Spacing.sm }}>
                        <CompositeMealCard group={group} />
                        {/* Delete buttons for individual items in the group */}
                        {group.logs.map((log) => (
                          <View key={`del-${log.id}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.sm }}>
                            <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                              {log.title || 'Untitled'}
                            </Text>
                            <TouchableOpacity
                              onPress={() => handleDelete(log.id, log.title || 'Untitled')}
                              disabled={deleting === log.id}
                              style={[s.deleteBtn, { backgroundColor: theme.error + '12' }]}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              {deleting === log.id ? (
                                <ActivityIndicator size="small" color={theme.error} />
                              ) : (
                                <Ionicons name="trash-outline" size={14} color={theme.error} />
                              )}
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    ) : (
                      /* Single-item group — render as regular meal card */
                      group.logs.map((log) => {
                        const snap = log.nutrition_snapshot || {};
                        const cal = Number(snap.calories || 0);
                        const pro = Number(snap.protein || 0);
                        const carb = Number(snap.carbs || 0);
                        const fat = Number(snap.fat || 0);
                        const sourceIcon =
                          log.source_type === 'recipe' ? 'restaurant-outline' :
                          log.source_type === 'meal_plan' ? 'calendar-outline' : 'create-outline';
                        const isDeleting = deleting === log.id;
                        const mealMes = mealScores.find((ms: MealMES) => ms.food_log_id === log.id);

                        return (
                          <View
                            key={log.id}
                            style={[s.mealCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                              <LinearGradient
                                colors={[theme.primary + '25', theme.primary + '10'] as any}
                                style={s.mealIcon}
                              >
                                <Ionicons name={sourceIcon as any} size={18} color={theme.primary} />
                              </LinearGradient>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={[s.mealTitle, { color: theme.text }]} numberOfLines={2}>
                                    {log.title || 'Untitled'}
                                  </Text>
                                  {mealMes && (
                                    mealMes.score
                                      ? <MealMESBadge score={mealMes.score.display_score || mealMes.score.total_score} tier={mealMes.score.display_tier || mealMes.score.tier} compact />
                                      : <MealMESBadge score={null} tier="crash_risk" unscoredHint={mealMes.unscored_hint} compact />
                                  )}
                                </View>
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
                            <View style={s.macroPills}>
                              <View style={[s.macroPill, { backgroundColor: theme.text + '0A' }]}>
                                <Ionicons name="flame-outline" size={12} color={theme.text} />
                                <Text style={[s.macroPillText, { color: theme.text }]}>{cal.toFixed(0)} calories</Text>
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
                      })
                    )
                  )}

                  {/* Ungrouped logs (generic "meal" type) — with group_id pairing */}
                  {(() => {
                    // Build group_id map for ungrouped logs
                    const gidMap = new Map<string, DailyLog[]>();
                    const soloLogs: DailyLog[] = [];
                    for (const log of ungrouped) {
                      if (log.group_id) {
                        const list = gidMap.get(log.group_id) || [];
                        list.push(log);
                        gidMap.set(log.group_id, list);
                      } else {
                        soloLogs.push(log);
                      }
                    }

                    type UngroupedItem = { type: 'paired'; main: DailyLog; side: DailyLog } | { type: 'solo'; log: DailyLog };
                    const items: UngroupedItem[] = [];
                    const usedIds = new Set<string>();

                    for (const log of ungrouped) {
                      if (usedIds.has(log.id)) continue;
                      if (log.group_id && gidMap.has(log.group_id)) {
                        const groupLogs = gidMap.get(log.group_id)!;
                        if (groupLogs.length >= 2) {
                          items.push({ type: 'paired', main: groupLogs[0], side: groupLogs[1] });
                          groupLogs.forEach((l) => usedIds.add(l.id));
                          continue;
                        }
                      }
                      items.push({ type: 'solo', log });
                      usedIds.add(log.id);
                    }

                    return items.map((item) => {
                      if (item.type === 'paired') {
                        const mainSnap = item.main.nutrition_snapshot || {};
                        const sideSnap = item.side.nutrition_snapshot || {};
                        const cal = Number(mainSnap.calories || 0) + Number(sideSnap.calories || 0);
                        const pro = Number(mainSnap.protein || 0) + Number(sideSnap.protein || 0);
                        const carb = Number(mainSnap.carbs || 0) + Number(sideSnap.carbs || 0);
                        const fat = Number(mainSnap.fat || 0) + Number(sideSnap.fat || 0);
                        // Use stored group MES score (set at log time) or backfilled
                        const storedScore = item.main.group_mes_score ?? item.side.group_mes_score ?? null;
                        const storedTier = item.main.group_mes_tier ?? item.side.group_mes_tier ?? null;
                        const backfill = item.main.group_id ? backfilledScores[item.main.group_id] : undefined;
                        // Fallback to individual meal MES
                        const mainMes = mealScores.find((ms: MealMES) => ms.food_log_id === item.main.id);
                        const displayScore = storedScore ?? backfill?.score ?? (mainMes?.score?.display_score || mainMes?.score?.total_score || null);
                        const displayTier = storedTier ?? backfill?.tier ?? (mainMes?.score?.display_tier || mainMes?.score?.tier || null);
                        const isDeletingGroup = deleting === item.main.id;

                        return (
                          <View
                            key={item.main.id}
                            style={[s.mealCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                          >
                            {/* Main meal row */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                              <LinearGradient
                                colors={[theme.primary + '25', theme.primary + '10'] as any}
                                style={s.mealIcon}
                              >
                                <Ionicons name="restaurant-outline" size={18} color={theme.primary} />
                              </LinearGradient>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={[s.mealTitle, { color: theme.text }]} numberOfLines={2}>
                                    {item.main.title || 'Untitled'}
                                  </Text>
                                  {displayScore != null && displayTier && (
                                    <MealMESBadge
                                      score={displayScore}
                                      tier={displayTier}
                                      compact
                                    />
                                  )}
                                </View>
                              </View>
                              <TouchableOpacity
                                onPress={() => handleDelete(item.main.id, item.main.title || 'Untitled', item.main.group_id)}
                                disabled={isDeletingGroup}
                                style={[s.deleteBtn, { backgroundColor: theme.error + '12' }]}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                {isDeletingGroup ? (
                                  <ActivityIndicator size="small" color={theme.error} />
                                ) : (
                                  <Ionicons name="trash-outline" size={16} color={theme.error} />
                                )}
                              </TouchableOpacity>
                            </View>

                            {/* Side row (indented with green leaf) */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingLeft: 42 + Spacing.md }}>
                              <View style={{
                                width: 6, height: 6,
                                borderRadius: 3,
                                backgroundColor: '#22C55E',
                                marginRight: 8,
                              }} />
                              <Ionicons name="leaf-outline" size={13} color="#22C55E" style={{ marginRight: 5 }} />
                              <Text
                                style={{ color: theme.textSecondary, fontSize: FontSize.xs, fontWeight: '500', flex: 1 }}
                                numberOfLines={1}
                              >
                                {item.side.title || 'Side'}
                              </Text>
                            </View>

                            {/* Combined macros */}
                            <View style={[s.macroPills, { marginTop: Spacing.sm }]}>
                              <View style={[s.macroPill, { backgroundColor: theme.text + '0A' }]}>
                                <Ionicons name="flame-outline" size={12} color={theme.text} />
                                <Text style={[s.macroPillText, { color: theme.text }]}>{cal.toFixed(0)} calories</Text>
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
                      }

                      // Solo ungrouped log
                      const log = item.log;
                      const snap = log.nutrition_snapshot || {};
                      const cal = Number(snap.calories || 0);
                      const pro = Number(snap.protein || 0);
                      const carb = Number(snap.carbs || 0);
                      const fat = Number(snap.fat || 0);
                      const sourceIcon =
                        log.source_type === 'recipe' ? 'restaurant-outline' :
                        log.source_type === 'meal_plan' ? 'calendar-outline' : 'create-outline';
                      const isDeleting = deleting === log.id;
                      const mealMes = mealScores.find((ms: MealMES) => ms.food_log_id === log.id);

                      return (
                        <View
                          key={log.id}
                          style={[s.mealCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                            <LinearGradient
                              colors={[theme.primary + '25', theme.primary + '10'] as any}
                              style={s.mealIcon}
                            >
                              <Ionicons name={sourceIcon as any} size={18} color={theme.primary} />
                            </LinearGradient>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={[s.mealTitle, { color: theme.text }]} numberOfLines={2}>
                                  {log.title || 'Untitled'}
                                </Text>
                                {mealMes && (
                                  mealMes.score
                                    ? <MealMESBadge score={mealMes.score.display_score || mealMes.score.total_score} tier={mealMes.score.display_tier || mealMes.score.tier} compact />
                                    : <MealMESBadge score={null} tier="crash_risk" unscoredHint={mealMes.unscored_hint} compact />
                                )}
                              </View>
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
                          <View style={s.macroPills}>
                            <View style={[s.macroPill, { backgroundColor: theme.text + '0A' }]}>
                              <Ionicons name="flame-outline" size={12} color={theme.text} />
                              <Text style={[s.macroPillText, { color: theme.text }]}>{cal.toFixed(0)} calories</Text>
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
                    });
                  })()}
                </View>
              );
            })()
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
