/**
 * ScoreBreakdown — Expandable sub-score breakdown for the MES card.
 *
 * Shows 4 bars: GIS, PAS, FS, FAS with their weight multiplier and value.
 * Collapses/expands with a tap on the header.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import { FontSize, Spacing, BorderRadius } from '../constants/Colors';
import type { SubScores, WeightsUsed } from '../stores/metabolicBudgetStore';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ScoreBreakdownProps {
  subScores: SubScores;
  weights: WeightsUsed;
  totalMES: number;
  /** Start expanded? Default false */
  initialExpanded?: boolean;
  expandable?: boolean;
}

interface RowData {
  key: keyof SubScores;
  label: string;
  fullName: string;
  color: string;
  gradient: readonly [string, string];
  weight: number;
  value: number;
}

export function ScoreBreakdown({
  subScores,
  weights,
  totalMES,
  initialExpanded = false,
  expandable = true,
}: ScoreBreakdownProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(initialExpanded || !expandable);

  const toggle = () => {
    if (!expandable) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  const rows: RowData[] = useMemo(() => [
    {
      key: 'gis',
      label: 'GIS',
      fullName: 'Glycemic Impact',
      color: '#FF9500',
      gradient: ['#FF9500', '#F59E0B'],
      weight: weights.gis,
      value: subScores.gis,
    },
    {
      key: 'pas',
      label: 'PAS',
      fullName: 'Protein',
      color: '#34C759',
      gradient: ['#34C759', '#22C55E'],
      weight: weights.protein,
      value: subScores.pas,
    },
    {
      key: 'fs',
      label: 'FS',
      fullName: 'Fiber',
      color: '#4A90D9',
      gradient: ['#4A90D9', '#3B82F6'],
      weight: weights.fiber,
      value: subScores.fs,
    },
    {
      key: 'fas',
      label: 'FAS',
      fullName: 'Fat Adequacy',
      color: '#A855F7',
      gradient: ['#A855F7', '#8B5CF6'],
      weight: weights.fat,
      value: subScores.fas,
    },
  ], [subScores, weights]);

  return (
    <View>
      {expandable ? (
        <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={styles.header}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textSecondary} />
          <Text style={[styles.headerText, { color: theme.textSecondary }]}>Score Breakdown</Text>
        </TouchableOpacity>
      ) : null}

      {expanded && (
        <View style={[styles.body, { backgroundColor: expandable ? theme.surfaceHighlight + '60' : theme.surface }]}>
          {rows.map((row) => (
            <View key={row.key} style={styles.row}>
              {/* Label column */}
              <View style={styles.labelCol}>
                <Text style={[styles.abbrev, { color: row.color }]}>{row.label}</Text>
                <Text style={[styles.fullName, { color: theme.textTertiary }]}>{row.fullName}</Text>
              </View>

              {/* Bar */}
              <View style={[styles.barBg, { backgroundColor: theme.surfaceHighlight }]}>
                <LinearGradient
                  colors={row.gradient as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.barFill, { width: `${Math.min(row.value, 100)}%` }]}
                />
              </View>

              {/* Value + weight */}
              <View style={styles.valueCol}>
                <Text style={[styles.value, { color: theme.text }]}>{Math.round(row.value)}</Text>
                <Text style={[styles.weight, { color: theme.textTertiary }]}>×{(row.weight * 100).toFixed(0)}%</Text>
              </View>
            </View>
          ))}

          {/* Weighted total */}
          <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Weighted MES</Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>{totalMES.toFixed(1)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: Spacing.xs,
  },
  headerText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  body: {
    borderRadius: BorderRadius.md,
    padding: Spacing.sm + 2,
    marginTop: Spacing.xs,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  labelCol: {
    width: 62,
  },
  abbrev: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  fullName: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: 1,
  },
  barBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  valueCol: {
    width: 52,
    alignItems: 'flex-end',
  },
  value: {
    fontSize: 12,
    fontWeight: '700',
  },
  weight: {
    fontSize: 9,
    fontWeight: '500',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    marginTop: 2,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '800',
  },
});
