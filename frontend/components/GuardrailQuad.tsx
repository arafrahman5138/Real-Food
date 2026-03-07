/**
 * GuardrailQuad — Layout of 4 GuardrailBar components.
 * Shows protein, fat, fiber, and carbs guardrail progress.
 * Replaces the old GuardrailTrio with fat bar added.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GuardrailBar } from './GuardrailBar';
import { Spacing } from '../constants/Colors';

interface GuardrailQuadProps {
  /** Current daily totals */
  proteinG: number;
  fatG: number;
  fiberG: number;
  carbsG: number;
  /** User's budget targets */
  proteinTarget: number;
  fatTarget: number;
  fiberFloor: number;
  carbCeiling: number;
}

export function GuardrailQuad({
  proteinG,
  fatG,
  fiberG,
  carbsG,
  proteinTarget,
  fatTarget,
  fiberFloor,
  carbCeiling,
}: GuardrailQuadProps) {
  return (
    <View style={styles.container}>
      <GuardrailBar
        label="Protein"
        icon="barbell-outline"
        consumed={proteinG}
        target={proteinTarget}
        type="floor"
        color="#34C759"
        gradientColors={['#34C759', '#22C55E']}
      />
      <GuardrailBar
        label="Fat"
        icon="water-outline"
        consumed={fatG}
        target={fatTarget}
        type="floor"
        color="#A855F7"
        gradientColors={['#A855F7', '#8B5CF6']}
      />
      <GuardrailBar
        label="Fiber"
        icon="leaf-outline"
        consumed={fiberG}
        target={fiberFloor}
        type="floor"
        color="#4A90D9"
        gradientColors={['#4A90D9', '#3B82F6']}
      />
      <GuardrailBar
        label="Carbs"
        icon="shield-checkmark-outline"
        consumed={carbsG}
        target={carbCeiling}
        type="ceiling"
        color="#FF9500"
        gradientColors={['#FF9500', '#F59E0B']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
});
