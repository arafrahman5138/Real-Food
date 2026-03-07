/**
 * NutriScoreHeroCard — Hero card for the Nutrient view.
 * Mirrors EnergyBudgetCard layout but shows NutriScore ring,
 * calorie progress, and top macro breakdown.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import { FontSize, Spacing, BorderRadius } from '../constants/Colors';

interface MacroStat {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  pct: number;
  icon: keyof typeof Ionicons.glyphMap;
}

interface NutriScoreHeroCardProps {
  score: number;
  calories: { consumed: number; target: number };
  macros: MacroStat[];
}

export function NutriScoreHeroCard({ score, calories, macros }: NutriScoreHeroCardProps) {
  const theme = useTheme();

  const clampedScore = Math.min(100, Math.max(0, score));
  const tierLabel = clampedScore >= 90 ? 'Gold Tier' : clampedScore >= 75 ? 'Silver Tier' : clampedScore >= 60 ? 'Bronze Tier' : 'Starter';
  const tierColor = clampedScore >= 90 ? '#FFD700' : clampedScore >= 75 ? '#C0C0C0' : clampedScore >= 60 ? '#CD7F32' : theme.textTertiary;
  const tierIcon = clampedScore >= 60 ? 'medal-outline' : 'trending-up-outline';

  const ringSize = 100;
  const strokeWidth = 8;
  const scoreFontSize = Math.round(ringSize * 0.26);
  const trackColor = theme.text === '#FFFFFF' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const arcColor = clampedScore >= 60 ? '#22C55E' : clampedScore >= 30 ? '#F59E0B' : '#EF4444';

  const calPct = calories.target > 0 ? Math.min(100, (calories.consumed / calories.target) * 100) : 0;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: theme.primaryMuted }]}>
          <Ionicons name="star" size={14} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>NutriScore</Text>
          <Text style={[styles.headerSub, { color: theme.textTertiary }]}>Daily nutrition quality</Text>
        </View>
        <View style={[styles.brandPill, { backgroundColor: theme.primary + '18' }]}>
          <Text style={[styles.brandPillText, { color: theme.primary }]}>NUTRIENT</Text>
        </View>
      </View>

      {/* Top row: Ring + Tier info */}
      <View style={styles.topRow}>
        {/* Score ring */}
        <View style={{ width: ringSize, height: ringSize }}>
          <View
            style={{
              position: 'absolute',
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderWidth: strokeWidth,
              borderColor: trackColor,
            }}
          />
          {clampedScore > 0 && (
            <View
              style={{
                position: 'absolute',
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                borderWidth: strokeWidth,
                borderColor: 'transparent',
                borderTopColor: arcColor,
                borderRightColor: clampedScore > 25 ? arcColor : 'transparent',
                borderBottomColor: clampedScore > 50 ? arcColor : 'transparent',
                borderLeftColor: clampedScore > 75 ? arcColor : 'transparent',
                transform: [{ rotate: '-45deg' }],
              }}
            />
          )}
          <View
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: scoreFontSize,
                fontWeight: '800',
                color: theme.text,
                textAlign: 'center',
                fontVariant: ['tabular-nums'],
                includeFontPadding: false,
                letterSpacing: -0.3,
              }}
            >
              {clampedScore.toFixed(0)}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '600', color: theme.textTertiary, marginTop: -1 }}>
              / 100
            </Text>
          </View>
        </View>

        {/* Tier + calorie summary */}
        <View style={styles.tierInfo}>
          <View style={[styles.tierBadge, { backgroundColor: tierColor + '20' }]}>
            <Ionicons name={tierIcon as any} size={16} color={tierColor} />
            <Text style={[styles.tierLabel, { color: tierColor }]}>{tierLabel}</Text>
          </View>
          <Text style={[styles.calText, { color: theme.textSecondary }]}>
            {calories.consumed.toFixed(0)} / {calories.target.toFixed(0)} calories
          </Text>
          {/* Calorie bar */}
          <View style={[styles.calBar, { backgroundColor: theme.surfaceHighlight }]}>
            <View
              style={[
                styles.calBarFill,
                { width: `${Math.min(calPct, 100)}%`, backgroundColor: arcColor },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Macro summary bars */}
      <View style={styles.macroSection}>
        {macros.map((m) => (
          <View key={m.label} style={styles.macroRow}>
            <View style={styles.macroHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={m.icon as any} size={13} color={theme.textSecondary} />
                <Text style={[styles.macroLabel, { color: theme.text }]}>{m.label}</Text>
              </View>
              <Text style={[styles.macroValue, { color: theme.textSecondary }]}>
                {m.consumed.toFixed(0)}/{m.target.toFixed(0)} {m.unit}
              </Text>
            </View>
            <View style={[styles.macroBar, { backgroundColor: theme.surfaceHighlight }]}>
              <LinearGradient
                colors={['#22C55E', '#16A34A'] as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.macroBarFill, { width: `${Math.min(m.pct, 100)}%` }]}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.md,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    marginTop: 1,
  },
  brandPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  brandPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  tierInfo: {
    flex: 1,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginBottom: Spacing.xs,
  },
  tierLabel: {
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  calText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginBottom: 6,
  },
  calBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  calBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  macroSection: {
    gap: Spacing.sm,
  },
  macroRow: {
    gap: 4,
  },
  macroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  macroLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  macroValue: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  macroBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroBarFill: {
    height: '100%',
    borderRadius: 3,
  },
});
