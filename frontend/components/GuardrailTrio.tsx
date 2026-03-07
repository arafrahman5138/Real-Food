/**
 * GuardrailTrio — Layout of 3 GuardrailBar components (protein emphasized).
 * Shows protein, fiber, and carbs guardrail progress.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GuardrailBar } from './GuardrailBar';
import { Spacing } from '../constants/Colors';

interface GuardrailTrioProps {
  /** Current daily totals */
  proteinG: number;
  fiberG: number;
  sugarG: number;
  /** User's budget targets */
  proteinTarget: number;
  fiberFloor: number;
  sugarCeiling: number;
}

export function GuardrailTrio({
  proteinG,
  fiberG,
  sugarG,
  proteinTarget,
  fiberFloor,
  sugarCeiling,
}: GuardrailTrioProps) {
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
        consumed={sugarG}
        target={sugarCeiling}
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
