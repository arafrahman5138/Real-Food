/**
 * MetabolicStreakBadge — Streak pill with bolt icon + days.
 * Similar to StreakBadge but for metabolic energy streak.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

interface MetabolicStreakBadgeProps {
  currentStreak: number;
  longestStreak?: number;
  compact?: boolean;
}

export function MetabolicStreakBadge({
  currentStreak,
  longestStreak,
  compact = false,
}: MetabolicStreakBadgeProps) {
  const theme = useTheme();

  const streakColor =
    currentStreak >= 14 ? '#FFD700' :
    currentStreak >= 7 ? '#C0C0C0' :
    currentStreak >= 3 ? '#CD7F32' :
    theme.textTertiary;

  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor: streakColor + '20' }]}>
        <Ionicons name="flash" size={12} color={streakColor} />
        <Text style={[styles.compactText, { color: streakColor }]}>{currentStreak}d</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceElevated }]}>
      <View style={[styles.iconBg, { backgroundColor: streakColor + '20' }]}>
        <Ionicons name="flash" size={18} color={streakColor} />
      </View>
      <View>
        <Text style={[styles.streakCount, { color: theme.text }]}>
          {currentStreak} day{currentStreak !== 1 ? 's' : ''}
        </Text>
        <Text style={[styles.streakLabel, { color: theme.textTertiary }]}>
          Energy Streak
        </Text>
      </View>
      {longestStreak !== undefined && longestStreak > 0 && (
        <View style={styles.bestContainer}>
          <Text style={[styles.bestLabel, { color: theme.textTertiary }]}>Best</Text>
          <Text style={[styles.bestValue, { color: theme.textSecondary }]}>{longestStreak}d</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    gap: 8,
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakCount: {
    fontSize: 15,
    fontWeight: '700',
  },
  streakLabel: {
    fontSize: 11,
  },
  bestContainer: {
    marginLeft: 'auto',
    alignItems: 'center',
  },
  bestLabel: {
    fontSize: 10,
  },
  bestValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 2,
  },
  compactText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
