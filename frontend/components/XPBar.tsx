import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, FontSize, Spacing } from '../constants/Colors';
import { useTheme } from '../hooks/useTheme';
import { XP_PER_LEVEL } from '../constants/Config';

interface XPBarProps {
  xp: number;
  compact?: boolean;
}

export function XPBar({ xp, compact = false }: XPBarProps) {
  const theme = useTheme();
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpInLevel = xp % XP_PER_LEVEL;
  const progress = xpInLevel / XP_PER_LEVEL;

  if (compact) {
    return (
      <View style={styles.compactRow}>
        <View style={[styles.levelBadge, { backgroundColor: theme.primaryMuted }]}>
          <Text style={[styles.levelText, { color: theme.primary }]}>Lvl {level}</Text>
        </View>
        <View style={[styles.barBg, { backgroundColor: theme.surfaceElevated }]}>
          <LinearGradient
            colors={theme.gradient.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.barFill, { width: `${progress * 100}%` }]}
          />
        </View>
        <Text style={[styles.xpText, { color: theme.textTertiary }]}>
          {xpInLevel}/{XP_PER_LEVEL}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={[styles.levelBadgeLarge, { backgroundColor: theme.primaryMuted }]}>
          <Text style={[styles.levelTextLarge, { color: theme.primary }]}>Level {level}</Text>
        </View>
        <Text style={[styles.xpTextLarge, { color: theme.textSecondary }]}>
          {xpInLevel} / {XP_PER_LEVEL} XP
        </Text>
      </View>
      <View style={[styles.barBgLarge, { backgroundColor: theme.surfaceElevated }]}>
        <LinearGradient
          colors={theme.gradient.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.barFillLarge, { width: `${progress * 100}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelBadge: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  levelBadgeLarge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  levelText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  levelTextLarge: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  barBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barBgLarge: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barFillLarge: {
    height: '100%',
    borderRadius: 5,
  },
  xpText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    minWidth: 60,
    textAlign: 'right',
  },
  xpTextLarge: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
});
