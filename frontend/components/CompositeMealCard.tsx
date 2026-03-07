/**
 * CompositeMealCard — Glassmorphic card for grouped meal events.
 *
 * Shows a meal-type header (Breakfast/Lunch/Dinner/Snack) with a
 * combined MES badge, component chips, aggregated macros, and an
 * expandable detail view of individual components.
 */
import React, { useEffect, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MealMESBadge } from './MealMESBadge';
import { useTheme } from '../hooks/useTheme';
import { useMetabolicBudgetStore, getTierConfig } from '../stores/metabolicBudgetStore';
import type { MealMES, CompositeMES, MESScore } from '../stores/metabolicBudgetStore';
import { BorderRadius, FontSize, Spacing } from '../constants/Colors';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

interface MealGroup {
  mealType: string;
  logs: DailyLog[];
  mealScores: MealMES[];
}

// ── Meal type config ──

const MEAL_TYPE_CONFIG: Record<string, { icon: string; label: string; gradient: [string, string] }> = {
  breakfast: { icon: 'sunny-outline', label: 'Breakfast', gradient: ['#F59E0B', '#D97706'] },
  lunch: { icon: 'restaurant-outline', label: 'Lunch', gradient: ['#3B82F6', '#2563EB'] },
  dinner: { icon: 'moon-outline', label: 'Dinner', gradient: ['#8B5CF6', '#6D28D9'] },
  snack: { icon: 'cafe-outline', label: 'Snack', gradient: ['#EC4899', '#DB2777'] },
};

function getMealTypeConfig(mealType: string) {
  return MEAL_TYPE_CONFIG[mealType.toLowerCase()] ?? {
    icon: 'ellipse-outline',
    label: mealType.charAt(0).toUpperCase() + mealType.slice(1),
    gradient: ['#6B7280', '#4B5563'],
  };
}

// ── Helper: aggregate nutrition from logs ──

function aggregateNutrition(logs: DailyLog[]) {
  let calories = 0, protein = 0, carbs = 0, fat = 0, fiber = 0;
  for (const log of logs) {
    const snap = log.nutrition_snapshot || {};
    calories += Number(snap.calories || 0);
    protein += Number(snap.protein || snap.protein_g || 0);
    carbs += Number(snap.carbs || snap.carbs_g || 0);
    fat += Number(snap.fat || snap.fat_g || 0);
    fiber += Number(snap.fiber || snap.fiber_g || 0);
  }
  return { calories, protein, carbs, fat, fiber };
}

// ── SingleMealRow — used for ungrouped logs & expanded component rows ──

export function SingleMealRow({
  log,
  mealScore,
  recipeScoreOverride,
  isLast = false,
  compact = false,
}: {
  log: DailyLog;
  mealScore?: MealMES;
  recipeScoreOverride?: { score: number; tier: string } | null;
  isLast?: boolean;
  compact?: boolean;
}) {
  const theme = useTheme();
  const snap = log.nutrition_snapshot || {};
  const cal = Number(snap.calories || 0);
  const pro = Number(snap.protein || snap.protein_g || 0);
  const carb = Number(snap.carbs || snap.carbs_g || 0);
  const fat = Number(snap.fat || snap.fat_g || 0);
  const sourceIcon =
    log.source_type === 'recipe' ? 'restaurant-outline' :
    log.source_type === 'meal_plan' ? 'calendar-outline' : 'create-outline';
  const badgeScore =
    recipeScoreOverride?.score ??
    mealScore?.score?.display_score ??
    mealScore?.score?.total_score ??
    null;
  const badgeTier =
    recipeScoreOverride?.tier ??
    mealScore?.score?.display_tier ??
    mealScore?.score?.tier ??
    'critical';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: compact ? Spacing.sm : Spacing.md,
        paddingVertical: compact ? Spacing.xs + 2 : Spacing.sm + 2,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.surfaceHighlight,
      }}
    >
      <View
        style={{
          width: compact ? 26 : 32,
          height: compact ? 26 : 32,
          borderRadius: BorderRadius.sm,
          backgroundColor: theme.surfaceHighlight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={sourceIcon as any} size={compact ? 13 : 16} color={theme.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            style={{
              color: theme.text,
              fontSize: compact ? FontSize.xs : FontSize.sm,
              fontWeight: '600',
              flex: 1,
            }}
            numberOfLines={1}
          >
            {log.title || 'Untitled'}
          </Text>
          {!compact && (mealScore || recipeScoreOverride) && (
            badgeScore != null
              ? <MealMESBadge score={badgeScore} tier={badgeTier} compact />
              : <MealMESBadge score={null} tier="crash_risk" unscoredHint={mealScore?.unscored_hint} compact />
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 1 }}>
          <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500' }}>
            {cal.toFixed(0)} calories
          </Text>
          {pro > 0 && <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500' }}>P {pro.toFixed(0)}g</Text>}
          {carb > 0 && <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500' }}>C {carb.toFixed(0)}g</Text>}
          {fat > 0 && <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '500' }}>F {fat.toFixed(0)}g</Text>}
        </View>
      </View>
    </View>
  );
}

// ── CompositeMealCard — The main composite card ──

export function CompositeMealCard({ group }: { group: MealGroup }) {
  const theme = useTheme();
  const isDark = theme.text === '#FFFFFF';
  const fetchCompositeMES = useMetabolicBudgetStore((s) => s.fetchCompositeMES);
  const [expanded, setExpanded] = useState(false);
  const [compositeMES, setCompositeMES] = useState<CompositeMES | null>(null);
  const [loading, setLoading] = useState(false);

  const config = getMealTypeConfig(group.mealType);
  const agg = aggregateNutrition(group.logs);

  // Fetch composite MES on mount
  useEffect(() => {
    let cancelled = false;
    const ids = group.logs.map(l => l.id).filter(Boolean);
    if (ids.length < 2) return;

    setLoading(true);
    fetchCompositeMES(ids).then(result => {
      if (!cancelled) {
        setCompositeMES(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [group.logs.map(l => l.id).join(',')]);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  // Determine display score/tier
  const displayScore = compositeMES?.score?.display_score ?? compositeMES?.score?.total_score ?? null;
  const displayTier = compositeMES?.score?.display_tier ?? compositeMES?.score?.tier ?? 'crash_risk';
  const tierCfg = getTierConfig(displayTier);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={toggleExpand}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.card.background,
            borderColor: theme.card.border,
          },
        ]}
      >
        {/* ── Tier accent left strip ── */}
        <View
          style={[
            styles.accentStrip,
            { backgroundColor: displayScore != null ? tierCfg.color + '60' : theme.surfaceHighlight },
          ]}
        />

        <View style={styles.cardContent}>
          {/* ── Header: Meal type icon + label + MES badge ── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.mealTypeIcon, { backgroundColor: config.gradient[0] + '20' }]}>
                <Ionicons name={config.icon as any} size={16} color={config.gradient[0]} />
              </View>
              <View>
                <Text style={[styles.mealTypeLabel, { color: theme.text }]}>
                  {config.label}
                </Text>
                <Text style={[styles.componentCount, { color: theme.textTertiary }]}>
                  {group.logs.length} item{group.logs.length > 1 ? 's' : ''} · {agg.calories.toFixed(0)} calories
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              {loading ? (
                <View style={[styles.mesBadgeLoading, { backgroundColor: theme.surfaceHighlight }]}>
                  <Text style={{ color: theme.textTertiary, fontSize: 10, fontWeight: '700' }}>···</Text>
                </View>
              ) : displayScore != null ? (
                <MealMESBadge score={displayScore} tier={displayTier} />
              ) : null}
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={theme.textTertiary}
              />
            </View>
          </View>

          {/* ── Component chips ── */}
          <View style={styles.chipRow}>
            {group.logs.map((log) => (
              <View
                key={log.id}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  },
                ]}
              >
                <Text
                  style={[styles.chipText, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {log.title || 'Untitled'}
                </Text>
              </View>
            ))}
          </View>

          {/* ── Aggregated macros ── */}
          <View style={styles.macroRow}>
            {[
              { label: 'Protein', value: agg.protein, color: '#22C55E' },
              { label: 'Carbs', value: agg.carbs, color: '#3B82F6' },
              { label: 'Fat', value: agg.fat, color: '#F59E0B' },
              { label: 'Fiber', value: agg.fiber, color: '#8B5CF6' },
            ].map((m) => (
              <View key={m.label} style={styles.macroItem}>
                <View style={[styles.macroDot, { backgroundColor: m.color + '40' }]}>
                  <View style={[styles.macroDotInner, { backgroundColor: m.color }]} />
                </View>
                <Text style={[styles.macroValue, { color: theme.text }]}>{m.value.toFixed(0)}g</Text>
                <Text style={[styles.macroLabel, { color: theme.textTertiary }]}>{m.label}</Text>
              </View>
            ))}
          </View>

          {/* ── Expanded: individual component rows ── */}
          {expanded && (
            <View style={[styles.expandedSection, { borderTopColor: theme.surfaceHighlight }]}>
              {group.logs.map((log, idx) => {
                const score = group.mealScores.find(ms => ms.food_log_id === log.id);
                return (
                  <SingleMealRow
                    key={log.id}
                    log={log}
                    mealScore={score}
                    isLast={idx === group.logs.length - 1}
                    compact
                  />
                );
              })}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  accentStrip: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  mealTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTypeLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  componentCount: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mesBadgeLoading: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: Spacing.sm,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 120,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  macroItem: {
    alignItems: 'center',
    gap: 2,
  },
  macroDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroValue: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  macroLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  expandedSection: {
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    paddingTop: Spacing.xs,
  },
});
