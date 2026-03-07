/**
 * MealMESBadge — Small pill/badge showing per-meal MES + tier icon.
 * Used on recipe cards and Chronometer meal list.
 * Supports null score for unscored items (components, desserts, sauces).
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTierConfig } from '../stores/metabolicBudgetStore';

interface MealMESBadgeProps {
  /** Display score (use display_score when available). Null = unscored item. */
  score: number | null;
  tier: string;
  /** Optional hint for unscored items, e.g. "Prep component — add sides for full MES" */
  unscoredHint?: string | null;
  compact?: boolean;
  /** Optional press handler (opens MealScoreSheet) */
  onPress?: () => void;
}

export function MealMESBadge({ score, tier, unscoredHint, compact = false, onPress }: MealMESBadgeProps) {
  // Unscored items (components, desserts, sauces) — show a muted label instead
  if (score == null) {
    const hint = unscoredHint || 'Not scored';
    return (
      <View style={[styles.compactBadge, { backgroundColor: '#8884' }]}>
        <Ionicons name="ellipse-outline" size={10} color="#888" />
        <Text style={[styles.compactText, { color: '#888' }]} numberOfLines={1}>{hint}</Text>
      </View>
    );
  }

  const tierCfg = getTierConfig(tier);
  const Wrapper = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress ? { onPress, activeOpacity: 0.7 } : {};

  if (compact) {
    return (
      <Wrapper {...wrapperProps} style={[styles.compactBadge, { backgroundColor: tierCfg.color + '25' }]}>
        <Ionicons name={tierCfg.icon} size={10} color={tierCfg.color} />
        <Text style={[styles.compactText, { color: tierCfg.color }]}>{Math.round(score)}</Text>
      </Wrapper>
    );
  }

  return (
    <Wrapper {...wrapperProps} style={[styles.badge, { backgroundColor: tierCfg.color + '20' }]}>
      <Ionicons name={tierCfg.icon} size={12} color={tierCfg.color} />
      <Text style={[styles.text, { color: tierCfg.color }]}>{Math.round(score)}</Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  compactText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
