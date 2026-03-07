/**
 * MetabolicRing — Circular MES display (0-100) with tier coloring.
 * Primary score ring for the Home and Chronometer screens.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { getTierConfig, TierKey } from '../stores/metabolicBudgetStore';
import { FontSize, Spacing } from '../constants/Colors';

interface MetabolicRingProps {
  score: number;
  tier: string;
  size?: number;
  showLabel?: boolean;
  showIcon?: boolean;
}

export function MetabolicRing({
  score,
  tier,
  size = 120,
  showLabel = true,
  showIcon = true,
}: MetabolicRingProps) {
  const theme = useTheme();
  const tierCfg = getTierConfig(tier);
  const borderWidth = Math.max(6, size * 0.06);
  const innerSize = size - borderWidth * 2;

  // Progress ring using border trick: full border in muted color, then
  // overlay partial colored border via rotation (simplified: full ring colored)
  const ringColor = tierCfg.color;
  const bgRingColor = theme.surfaceHighlight;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Background ring */}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth,
            borderColor: bgRingColor,
          },
        ]}
      />
      {/* Colored ring overlay */}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth,
            borderColor: ringColor,
            opacity: Math.min(score / 100, 1),
          },
        ]}
      />
      {/* Center content */}
      <View style={[styles.center, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
        {showIcon && (
          <Ionicons
            name={tierCfg.icon}
            size={Math.max(16, size * 0.15)}
            color={tierCfg.color}
            style={{ marginBottom: 2 }}
          />
        )}
        <Text style={[styles.score, { color: tierCfg.color, fontSize: Math.max(18, size * 0.22) }]}>
          {Math.round(score)}
        </Text>
        {showLabel && (
          <Text style={[styles.label, { color: theme.textSecondary, fontSize: Math.max(9, size * 0.085) }]}>
            MES
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontWeight: '800',
  },
  label: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
