/**
 * GuardrailBar — Single horizontal progress bar for one MES guardrail.
 * Shows consumed vs target with color-coded fill.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { FontSize, Spacing, BorderRadius } from '../constants/Colors';

interface GuardrailBarProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  consumed: number;
  target: number;
  /** 'floor' means higher is better; 'ceiling' means lower is better */
  type: 'floor' | 'ceiling';
  unit?: string;
  color: string;
  gradientColors?: readonly [string, string];
}

export function GuardrailBar({
  label,
  icon,
  consumed,
  target,
  type,
  unit = 'g',
  color,
  gradientColors,
}: GuardrailBarProps) {
  const theme = useTheme();
  const pct = target > 0 ? Math.min((consumed / target) * 100, 150) : 0;
  const fillPct = Math.min(pct, 100);

  // Status text
  let statusText: string;
  let statusColor: string;
  if (type === 'floor') {
    if (pct >= 100) {
      statusText = '✓ Hit';
      statusColor = theme.success;
    } else if (pct >= 66) {
      statusText = 'On track';
      statusColor = color;
    } else {
      statusText = 'Needs more';
      statusColor = theme.warning;
    }
  } else {
    // ceiling — lower is better
    if (pct <= 66) {
      statusText = '✓ Good';
      statusColor = theme.success;
    } else if (pct <= 100) {
      statusText = 'Watch it';
      statusColor = theme.warning;
    } else {
      statusText = 'Over';
      statusColor = theme.error;
    }
  }

  const gradient = gradientColors ?? [color, color];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Ionicons name={icon} size={16} color={color} style={{ marginRight: 5 }} />
          <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
        </View>
        <Text style={[styles.status, { color: statusColor }]}>{statusText}</Text>
      </View>
      <View style={[styles.barBg, { backgroundColor: theme.surfaceHighlight }]}>
        <LinearGradient
          colors={gradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.barFill, { width: `${fillPct}%` }]}
        />
      </View>
      <View style={styles.footer}>
        <Text style={[styles.value, { color: theme.textSecondary }]}>
          {Math.round(consumed)}{unit} / {Math.round(target)}{unit}
        </Text>
        <Text style={[styles.pct, { color: theme.textTertiary }]}>
          {Math.round(pct)}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  status: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  barBg: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  value: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  pct: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
});
