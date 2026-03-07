/**
 * EnergyHistoryChart — 14-day bar chart of daily MES with tier-colored bars.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { getTierConfig } from '../stores/metabolicBudgetStore';
import type { MESHistoryEntry } from '../stores/metabolicBudgetStore';
import { FontSize, Spacing, BorderRadius } from '../constants/Colors';

interface EnergyHistoryChartProps {
  data: MESHistoryEntry[];
  maxBars?: number;
  barHeight?: number;
}

function weekdayLabel(isoDate: string) {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate.slice(8);
  return parsed.toLocaleDateString('en-US', { weekday: 'short' });
}

export function EnergyHistoryChart({
  data,
  maxBars = 7,
  barHeight = 72,
}: EnergyHistoryChartProps) {
  const theme = useTheme();
  const entries = data.slice(-maxBars);
  const latestEntry = entries[entries.length - 1];
  const latestScore = latestEntry ? Math.round(latestEntry.display_score || latestEntry.total_score) : 0;
  const averageScore = entries.length > 0
    ? Math.round(entries.reduce((sum, e) => sum + (e.display_score || e.total_score), 0) / entries.length)
    : 0;

  if (entries.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.surfaceElevated }]}>
        <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
          No MES history yet. Log meals to start tracking!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryText, { color: theme.textSecondary }]}>Last {entries.length} days avg</Text>
        <Text style={[styles.summaryValue, { color: theme.text }]}>{averageScore}</Text>
        <View style={[styles.dividerDot, { backgroundColor: theme.textTertiary + '55' }]} />
        <Text style={[styles.summaryText, { color: theme.textSecondary }]}>Latest</Text>
        <Text style={[styles.summaryValue, { color: theme.text }]}>{latestScore}</Text>
      </View>

      <View style={styles.chartRow}>
        {entries.map((entry, i) => {
          const tierCfg = getTierConfig(entry.display_tier || entry.tier);
          const displayScore = entry.display_score || entry.total_score;
          const height = Math.max(4, (displayScore / 100) * barHeight);
          const dayLabel = weekdayLabel(entry.date);
          const isLatest = i === entries.length - 1;

          return (
            <View key={entry.date} style={styles.barContainer}>
              <View style={[styles.barBg, { height: barHeight, backgroundColor: theme.surfaceHighlight }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      height,
                      backgroundColor: tierCfg.color,
                      opacity: isLatest ? 1 : 0.9,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.dayLabel, { color: isLatest ? theme.textSecondary : theme.textTertiary }]}>{dayLabel}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: Spacing.xs,
  },
  summaryText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  dividerDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    marginHorizontal: 2,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingHorizontal: 4,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
  },
  barBg: {
    width: '100%',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
  },
  dayLabel: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
