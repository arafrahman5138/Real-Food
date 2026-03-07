/**
 * MealScoreSheet — Bottom-sheet modal showing per-meal sub-score breakdown.
 *
 * Displayed when the user taps a MealMESBadge on the chronometer meal list.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import { getTierConfig } from '../stores/metabolicBudgetStore';
import type { MESScore } from '../stores/metabolicBudgetStore';
import { FontSize, Spacing, BorderRadius } from '../constants/Colors';

interface MealScoreSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  score: MESScore;
  /** Per-meal protein target from budget ÷ meals_per_day */
  proteinTarget?: number;
}

interface SubRow {
  key: string;
  label: string;
  fullName: string;
  color: string;
  gradient: readonly [string, string];
  value: number;
  weightPct: number;
}

export function MealScoreSheet({ visible, onClose, title, score, proteinTarget }: MealScoreSheetProps) {
  const theme = useTheme();
  const mes = score.meal_mes ?? score.display_score ?? score.total_score;
  const tier = (score.display_tier || score.tier) as string;
  const tierCfg = getTierConfig(tier);

  const sub = score.sub_scores;
  const weights = score.weights_used;

  const rows: SubRow[] = sub && weights
    ? [
        { key: 'gis', label: 'GIS', fullName: 'Glycemic Impact', color: '#FF9500', gradient: ['#FF9500', '#F59E0B'], value: sub.gis, weightPct: Math.round(weights.gis * 100) },
        { key: 'pas', label: 'PAS', fullName: 'Protein', color: '#34C759', gradient: ['#34C759', '#22C55E'], value: sub.pas, weightPct: Math.round(weights.protein * 100) },
        { key: 'fs', label: 'FS', fullName: 'Fiber', color: '#4A90D9', gradient: ['#4A90D9', '#3B82F6'], value: sub.fs, weightPct: Math.round(weights.fiber * 100) },
        { key: 'fas', label: 'FAS', fullName: 'Fat Adequacy', color: '#A855F7', gradient: ['#A855F7', '#8B5CF6'], value: sub.fas, weightPct: Math.round(weights.fat * 100) },
      ]
    : [];

  const netCarbs = score.net_carbs_g ?? score.carbs_g ?? score.sugar_g ?? 0;
  const proteinG = score.protein_g ?? 0;
  const fiberG = score.fiber_g ?? 0;
  const fatG = score.fat_g ?? 0;

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <SafeAreaView style={[styles.sheet, { backgroundColor: theme.surface }]}>
          {/* ── Header ── */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
              <View style={styles.mesRow}>
                <Text style={[styles.mesLabel, { color: theme.textSecondary }]}>MES</Text>
                <Text style={[styles.mesValue, { color: tierCfg.color }]}>{Math.round(mes)}</Text>
                <View style={[styles.tierPill, { backgroundColor: tierCfg.color + '18' }]}>
                  <Ionicons name={tierCfg.icon} size={12} color={tierCfg.color} />
                  <Text style={[styles.tierText, { color: tierCfg.color }]}>{tierCfg.label}</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close-circle" size={28} color={theme.textTertiary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {/* ── Sub-Score bars ── */}
            {rows.length > 0 && (
              <View style={[styles.section, { backgroundColor: theme.surfaceHighlight + '60' }]}>
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Sub-Scores</Text>
                {rows.map((row) => (
                  <View key={row.key} style={styles.barRow}>
                    <View style={styles.barLabel}>
                      <Text style={[styles.abbrev, { color: row.color }]}>{row.label}</Text>
                      <Text style={[styles.fullName, { color: theme.textTertiary }]}>{row.fullName}</Text>
                    </View>
                    <View style={[styles.barBg, { backgroundColor: theme.surfaceHighlight }]}>
                      <LinearGradient
                        colors={row.gradient as [string, string]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.barFill, { width: `${Math.min(row.value, 100)}%` }]}
                      />
                    </View>
                    <Text style={[styles.barValue, { color: theme.text }]}>{Math.round(row.value)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Macros ── */}
            <View style={[styles.section, { backgroundColor: theme.surfaceHighlight + '60' }]}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Macros</Text>
              <View style={styles.macroGrid}>
                <MacroCell label="Net Carbs" value={`${Math.round(netCarbs)}g`} color="#FF9500" theme={theme} />
                <MacroCell
                  label="Protein"
                  value={`${Math.round(proteinG)}g`}
                  detail={proteinTarget ? `/ ${Math.round(proteinTarget)}g target` : undefined}
                  color="#34C759"
                  theme={theme}
                />
                <MacroCell label="Fiber" value={`${Math.round(fiberG)}g`} color="#4A90D9" theme={theme} />
                <MacroCell label="Fat" value={`${Math.round(fatG)}g`} color="#A855F7" theme={theme} />
              </View>
            </View>

            {/* ── Weight split ── */}
            {weights && (
              <View style={[styles.section, { backgroundColor: theme.surfaceHighlight + '60' }]}>
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Weights</Text>
                <Text style={[styles.weightText, { color: theme.textSecondary }]}>
                  GIS {Math.round(weights.gis * 100)}% · Protein {Math.round(weights.protein * 100)}% · Fiber {Math.round(weights.fiber * 100)}% · Fat {Math.round(weights.fat * 100)}%
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function MacroCell({ label, value, detail, color, theme }: { label: string; value: string; detail?: string; color: string; theme: any }) {
  return (
    <View style={macroStyles.cell}>
      <View style={[macroStyles.dot, { backgroundColor: color }]} />
      <Text style={[macroStyles.label, { color: theme.textTertiary }]}>{label}</Text>
      <Text style={[macroStyles.value, { color: theme.text }]}>{value}</Text>
      {detail && <Text style={[macroStyles.detail, { color: theme.textTertiary }]}>{detail}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  mesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  mesLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  mesValue: {
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  section: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  barLabel: {
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
  barValue: {
    width: 30,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
  },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  weightText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    lineHeight: 20,
  },
});

const macroStyles = StyleSheet.create({
  cell: {
    alignItems: 'flex-start',
    minWidth: 80,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
  },
  value: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  detail: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: 1,
  },
});
