import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { metabolicApi } from '../services/api';
import { MetabolicRing } from './MetabolicRing';
import { BorderRadius, FontSize, Spacing } from '../constants/Colors';
import { getTierConfig } from '../stores/metabolicBudgetStore';

interface EnergyImpactPreviewProps {
  /** Nutrition values for this recipe / meal */
  nutrition: { protein_g: number; fiber_g: number; sugar_g?: number; carbs_g?: number; calories?: number };
  /** Compact mode — smaller layout */
  compact?: boolean;
}

interface PreviewResult {
  meal_score: {
    total_score: number;
    display_score: number;
    tier: string;
    display_tier: string;
    protein_score: number;
    fiber_score: number;
    sugar_score: number;
  };
  projected_daily: {
    total_score: number;
    display_score: number;
    tier: string;
    display_tier: string;
  } | null;
}

/**
 * "If you eat this…" preview card.
 * Shows the meal's MES score and how it would impact the daily score.
 */
export function EnergyImpactPreview({ nutrition, compact = false }: EnergyImpactPreviewProps) {
  const theme = useTheme();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    metabolicApi
      .previewMeal({
        protein_g: nutrition.protein_g || 0,
        fiber_g: nutrition.fiber_g || 0,
        carbs_g: nutrition.carbs_g || 0,
        sugar_g: nutrition.sugar_g || 0,
        calories: nutrition.calories || 0,
      })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nutrition.protein_g, nutrition.fiber_g, nutrition.carbs_g, nutrition.sugar_g]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  if (error || !preview) return null;

  const mealTierCfg = getTierConfig(preview.meal_score.display_tier || preview.meal_score.tier);
  const dailyTierCfg = preview.projected_daily
    ? getTierConfig(preview.projected_daily.display_tier || preview.projected_daily.tier)
    : null;

  const ringSize = compact ? 44 : 56;

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Title */}
      <View style={styles.titleRow}>
        <Ionicons name="flash" size={16} color={theme.primary} />
        <Text style={[styles.title, { color: theme.text }]}>Energy Impact</Text>
      </View>

      <View style={styles.body}>
        {/* Meal score */}
        <View style={styles.scoreBlock}>
          <MetabolicRing
            score={preview.meal_score.display_score || preview.meal_score.total_score}
            tier={preview.meal_score.display_tier || preview.meal_score.tier}
            size={ringSize}
            showLabel={false}
          />
          <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>This Meal</Text>
          <Text style={[styles.tierLabel, { color: mealTierCfg.color }]}>
            {mealTierCfg.label}
          </Text>
        </View>

        {/* Arrow */}
        <View style={styles.arrowContainer}>
          <Ionicons name="arrow-forward" size={20} color={theme.textTertiary} />
        </View>

        {/* Projected daily */}
        {preview.projected_daily && dailyTierCfg && (
          <View style={styles.scoreBlock}>
            <MetabolicRing
              score={preview.projected_daily.display_score || preview.projected_daily.total_score}
              tier={preview.projected_daily.display_tier || preview.projected_daily.tier}
              size={ringSize}
              showLabel={false}
            />
            <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>Projected Day</Text>
            <Text style={[styles.tierLabel, { color: dailyTierCfg.color }]}>
              {dailyTierCfg.label}
            </Text>
          </View>
        )}
      </View>

      {/* Guardrail breakdown */}
      {!compact && (
        <View style={styles.guardrails}>
          {[
            { label: 'Protein', score: preview.meal_score.protein_score, color: '#22C55E' },
            { label: 'Fiber', score: preview.meal_score.fiber_score, color: '#8B5CF6' },
            { label: 'Carbs', score: preview.meal_score.sugar_score, color: '#F59E0B' },
          ].map((g) => (
            <View key={g.label} style={styles.guardrailItem}>
              <View style={[styles.guardrailDot, { backgroundColor: g.color }]} />
              <Text style={[styles.guardrailLabel, { color: theme.textSecondary }]}>
                {g.label}
              </Text>
              <Text
                style={[
                  styles.guardrailScore,
                  { color: g.score >= 80 ? '#34C759' : g.score >= 60 ? '#4A90D9' : '#FF9500' },
                ]}
              >
                {Math.round(g.score)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  scoreBlock: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  scoreLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  tierLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  arrowContainer: {
    paddingBottom: 24,
  },
  guardrails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  guardrailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  guardrailDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  guardrailLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  guardrailScore: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});
