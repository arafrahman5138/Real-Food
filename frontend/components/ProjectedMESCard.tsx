import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { MetabolicRing } from './MetabolicRing';
import { BorderRadius, FontSize, Spacing } from '../constants/Colors';
import { getTierConfig } from '../stores/metabolicBudgetStore';

interface DayProjection {
  day: string;
  score: number;
  tier: string;
}

interface ProjectedMESCardProps {
  /** Average weekly projected MES */
  weeklyScore: number;
  weeklyTier: string;
  /** Per-day projections */
  dayProjections: DayProjection[];
}

const DAY_SHORT: Record<string, string> = {
  Monday: 'M',
  Tuesday: 'T',
  Wednesday: 'W',
  Thursday: 'Th',
  Friday: 'F',
  Saturday: 'Sa',
  Sunday: 'Su',
};

/**
 * Projected MES card shown after meal plan generation.
 * Displays the projected weekly MES + per-day mini bars.
 */
export function ProjectedMESCard({
  weeklyScore,
  weeklyTier,
  dayProjections,
}: ProjectedMESCardProps) {
  const theme = useTheme();
  const weeklyTierCfg = getTierConfig(weeklyTier);
  const maxBarHeight = 48;

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="analytics" size={18} color={theme.primary} />
          <Text style={[styles.title, { color: theme.text }]}>Projected Energy Score</Text>
        </View>
      </View>

      {/* Weekly ring + label */}
      <View style={styles.weeklyRow}>
        <MetabolicRing score={weeklyScore} tier={weeklyTier} size={64} showLabel={false} />
        <View style={styles.weeklyInfo}>
          <Text style={[styles.weeklyTier, { color: weeklyTierCfg.color }]}>
            {weeklyTierCfg.label}
          </Text>
          <Text style={[styles.weeklySubtext, { color: theme.textTertiary }]}>
            Weekly average MES {Math.round(weeklyScore)}
          </Text>
        </View>
      </View>

      {/* Per-day bar chart */}
      {dayProjections.length > 0 && (
        <View style={styles.chartContainer}>
          <View style={styles.chartRow}>
            {dayProjections.map((dp) => {
              const tierCfg = getTierConfig(dp.tier);
              const barH = Math.max(4, (dp.score / 100) * maxBarHeight);
              return (
                <View key={dp.day} style={styles.barCol}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: barH,
                        backgroundColor: tierCfg.color,
                      },
                    ]}
                  />
                  <Text style={[styles.barLabel, { color: theme.textTertiary }]}>
                    {DAY_SHORT[dp.day] || dp.day.slice(0, 2)}
                  </Text>
                  <Text style={[styles.barScore, { color: tierCfg.color }]}>
                    {Math.round(dp.score)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Threshold line */}
          <View
            style={[
              styles.thresholdLine,
              {
                bottom: (60 / 100) * maxBarHeight + 20, // 20 = label offset
                borderColor: theme.textTertiary + '44',
              },
            ]}
          >
            <Text style={[styles.thresholdLabel, { color: theme.textTertiary }]}>60</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  weeklyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  weeklyInfo: {
    flex: 1,
  },
  weeklyTier: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginTop: 2,
  },
  weeklySubtext: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  chartContainer: {
    position: 'relative',
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingTop: Spacing.sm,
  },
  barCol: {
    alignItems: 'center',
    gap: 3,
    flex: 1,
  },
  bar: {
    width: 16,
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  barScore: {
    fontSize: 9,
    fontWeight: '700',
  },
  thresholdLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  thresholdLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: -8,
    marginRight: 2,
  },
});
