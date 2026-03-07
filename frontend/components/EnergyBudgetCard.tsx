/**
 * EnergyBudgetCard — Hero card combining MetabolicRing + GuardrailQuad + ScoreBreakdown + remaining budget text.
 * Modern glassmorphic design with gradient header accent.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { MetabolicRing } from './MetabolicRing';
import { GuardrailQuad } from './GuardrailQuad';
import { getTierConfig } from '../stores/metabolicBudgetStore';
import type { MESScore, MetabolicBudget, RemainingBudget, MEAScore } from '../stores/metabolicBudgetStore';
import { FontSize, Spacing, BorderRadius } from '../constants/Colors';

interface EnergyBudgetCardProps {
  score: MESScore;
  budget: MetabolicBudget;
  remaining: RemainingBudget | null;
  mea?: MEAScore | null;
  fatTargetOverride?: number | null;
  fatConsumedOverride?: number | null;
}

export function EnergyBudgetCard({ score, budget, remaining, mea, fatTargetOverride, fatConsumedOverride }: EnergyBudgetCardProps) {
  const theme = useTheme();
  const displayTier = (score.display_tier || score.tier) as any;
  const displayScore = score.display_score || score.total_score;
  const tierCfg = getTierConfig(displayTier);

  const proteinLeft = remaining ? Math.round(remaining.protein_remaining_g) : 0;
  const fiberLeft = remaining ? Math.round(remaining.fiber_remaining_g) : 0;
  const carbRoom = remaining ? Math.round((remaining as any).carb_headroom_g ?? remaining.sugar_headroom_g) : 0;
  const fatLeft = remaining ? Math.round(remaining.fat_remaining_g ?? 0) : 0;
  const meaColor = getTierConfig(mea?.tier || displayTier).color;
  const fatTarget =
    fatTargetOverride != null && Number.isFinite(fatTargetOverride) && fatTargetOverride > 0
      ? fatTargetOverride
      : (budget.fat_target_g ?? 0);
  const fatConsumed =
    fatConsumedOverride != null && Number.isFinite(fatConsumedOverride) && fatConsumedOverride >= 0
      ? fatConsumedOverride
      : (score.fat_g ?? 0);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* ── Branded header ── */}
      <View style={styles.header}>
        <LinearGradient
          colors={[tierCfg.color + '20', tierCfg.color + '08'] as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerGradient}
        >
          <View style={[styles.headerIcon, { backgroundColor: tierCfg.color + '1A' }]}>
            <Ionicons name="flash" size={13} color={tierCfg.color} />
          </View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Metabolic Energy</Text>
          <View style={[styles.headerPill, { backgroundColor: tierCfg.color + '18' }]}>
            <Text style={[styles.headerPillText, { color: tierCfg.color }]}>MES</Text>
          </View>
        </LinearGradient>
      </View>

      {/* ── Score ring + tier info ── */}
      <View style={styles.topRow}>
        <MetabolicRing score={displayScore} tier={displayTier} size={96} />
        <View style={styles.tierInfo}>
          {/* Tier badge */}
          <View style={[styles.tierBadge, { backgroundColor: tierCfg.color + '18' }]}>
            <Ionicons name={tierCfg.icon} size={14} color={tierCfg.color} />
            <Text style={[styles.tierLabel, { color: tierCfg.color }]}>{tierCfg.label}</Text>
          </View>

          {/* MEA mini badge */}
          {mea && mea.mea_score > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.statPill, { backgroundColor: meaColor + '12' }]}>
                <Ionicons name="pulse-outline" size={11} color={meaColor} />
                <Text style={[styles.statPillText, { color: meaColor }]}>
                  MEA {Math.round(mea.mea_score)}
                </Text>
              </View>
              <Text style={{ fontSize: 9, color: theme.textTertiary, fontWeight: '500' }}>
                {mea.energy_prediction === 'sustained' ? 'Sustained Energy' :
                 mea.energy_prediction === 'adequate' ? 'Adequate Energy' :
                 mea.energy_prediction === 'may_dip' ? 'May Dip' : 'Low Energy'}
              </Text>
            </View>
          )}

          {/* Remaining budget — compact stat pills */}
          {remaining && (
            <View style={styles.statPills}>
              {proteinLeft > 0 && (
                <View style={[styles.statPill, { backgroundColor: '#22C55E14' }]}>
                  <Ionicons name="barbell-outline" size={11} color="#34C759" />
                  <Text style={[styles.statPillText, { color: '#16A34A' }]}>{proteinLeft}g protein left</Text>
                </View>
              )}
              {fiberLeft > 0 && (
                <View style={[styles.statPill, { backgroundColor: '#3B82F612' }]}>
                  <Ionicons name="leaf-outline" size={11} color="#4A90D9" />
                  <Text style={[styles.statPillText, { color: '#2563EB' }]}>{fiberLeft}g fiber left</Text>
                </View>
              )}
              <View style={[styles.statPill, { backgroundColor: '#F59E0B14' }]}>
                <Ionicons name="shield-checkmark-outline" size={11} color="#FF9500" />
                <Text style={[styles.statPillText, { color: '#D97706' }]}>{carbRoom}g carb room</Text>
              </View>
              {fatLeft > 0 && (
                <View style={[styles.statPill, { backgroundColor: '#A855F714' }]}>
                  <Ionicons name="water-outline" size={11} color="#A855F7" />
                  <Text style={[styles.statPillText, { color: '#9333EA' }]}>{fatLeft}g fat left</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      {/* ── Divider ── */}
      <View style={[styles.divider, { backgroundColor: theme.surfaceHighlight }]} />

      {/* ── Guardrail bars ── */}
      <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}>
        <GuardrailQuad
          proteinG={score.protein_g}
          fatG={fatConsumed}
          fiberG={score.fiber_g}
          carbsG={score.carbs_g ?? score.sugar_g}
          proteinTarget={budget.protein_target_g}
          fatTarget={fatTarget}
          fiberFloor={budget.fiber_floor_g}
          carbCeiling={budget.carb_ceiling_g ?? budget.sugar_ceiling_g}
        />
      </View>

      {/* ── Score Breakdown CTA ── */}
      {score.sub_scores && score.weights_used && (
        <TouchableOpacity
          activeOpacity={0.72}
          onPress={() => router.push('/food/mes-breakdown' as any)}
          style={[styles.breakdownLink, { borderTopColor: theme.surfaceHighlight }]}
        >
          <View style={styles.breakdownLinkLeft}>
            <Text style={[styles.breakdownLinkTitle, { color: theme.text }]}>Score Breakdown</Text>
            <Text style={[styles.breakdownLinkSub, { color: theme.textSecondary }]}>
              See how your MES is calculated
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // Header
  header: {
    marginBottom: 0,
  },
  headerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  headerIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  headerPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  headerPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  // Score + Tier
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    paddingTop: Spacing.md,
  },
  tierInfo: {
    flex: 1,
    gap: Spacing.sm,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 5,
  },
  tierLabel: {
    fontWeight: '700',
    fontSize: FontSize.sm,
  },

  // Stat pills
  statPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statPillText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Divider
  divider: {
    height: 1,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },

  // Guardrails now inside card padding
  guardrails: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  breakdownLink: {
    marginHorizontal: Spacing.md,
    borderTopWidth: 1,
    paddingTop: Spacing.sm + 2,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  breakdownLinkLeft: {
    flex: 1,
  },
  breakdownLinkTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  breakdownLinkSub: {
    marginTop: 2,
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
});
