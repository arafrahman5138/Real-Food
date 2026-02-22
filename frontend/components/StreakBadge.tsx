import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, FontSize, Spacing } from '../constants/Colors';
import { useTheme } from '../hooks/useTheme';

interface StreakBadgeProps {
  streak: number;
  compact?: boolean;
}

export function StreakBadge({ streak, compact = false }: StreakBadgeProps) {
  const theme = useTheme();

  if (compact) {
    return (
      <View style={[styles.compactBadge, { backgroundColor: theme.accentMuted }]}>
        <Ionicons name="flame" size={14} color={theme.accent} />
        <Text style={[styles.compactText, { color: theme.accent }]}>{streak}</Text>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={theme.gradient.accent}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.badge}
    >
      <Ionicons name="flame" size={28} color="#FFFFFF" />
      <Text style={styles.streakNumber}>{streak}</Text>
      <Text style={styles.streakLabel}>Day Streak</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  compactText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    gap: 2,
  },
  streakNumber: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  streakLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
});
