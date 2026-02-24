import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenContainer } from '../../components/ScreenContainer';
import { GradientCard, Card } from '../../components/GradientCard';
import { useTheme } from '../../hooks/useTheme';
import { nutritionApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

// ── Types ──────────────────────────────────────────────────────────────

interface NutrientComparison {
  consumed: number;
  target: number;
  pct: number;
}

interface DailyLog {
  id: string;
  title: string;
  meal_type?: string;
  source_type?: string;
  nutrition?: Record<string, number>;
  nutrition_snapshot?: Record<string, number>;
  [key: string]: unknown;
}

interface DailySummary {
  daily_score: number;
  comparison: Record<string, NutrientComparison>;
  logs: DailyLog[];
}

interface RecommendedFood {
  food_id?: string;
  name: string;
  for: string;
  nutrition_info?: Record<string, number>;
}

interface RecommendedMeal {
  recipe_id?: string;
  title: string;
  for: string;
}

interface LowNutrient {
  key: string;
  pct: number;
}

interface NutritionGaps {
  recommended_foods: RecommendedFood[];
  recommended_meals: RecommendedMeal[];
  low_nutrients: LowNutrient[];
}

interface SelectedNutrient {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  pct: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const MACROS = [
  { key: 'protein', label: 'Protein', unit: 'g', icon: 'barbell-outline' as const },
  { key: 'carbs', label: 'Carbs', unit: 'g', icon: 'flash-outline' as const },
  { key: 'fat', label: 'Fat', unit: 'g', icon: 'water-outline' as const },
  { key: 'fiber', label: 'Fiber', unit: 'g', icon: 'leaf-outline' as const },
];

const microIcon = (name: string) => {
  const key = name.toLowerCase();
  if (key.includes('vitamin d') || key.includes('calcium')) return 'bone-outline';
  if (key.includes('omega') || key.includes('potassium')) return 'heart-outline';
  if (key.includes('vitamin b') || key.includes('magnesium')) return 'sparkles-outline';
  if (key.includes('vitamin c') || key.includes('zinc')) return 'shield-checkmark-outline';
  return 'ellipse-outline';
};

const formatMicronutrientLabel = (key: string) =>
  key
    .replace(/_(mg|mcg|g)$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (s: string) => s.toUpperCase());

const micronutrientUnit = (key: string) => {
  if (key.endsWith('_mg')) return 'mg';
  if (key.endsWith('_mcg')) return 'mcg';
  if (key.endsWith('_g')) return 'g';
  return '';
};

export default function ChronometerScreen() {
  const theme = useTheme();
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gaps, setGaps] = useState<NutritionGaps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [selectedNutrient, setSelectedNutrient] = useState<SelectedNutrient | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, gapData] = await Promise.all([
        nutritionApi.getDaily(),
        nutritionApi.getGaps(),
      ]);
      setDaily(data);
      setGaps(gapData);
    } catch (e: any) {
      setError(e?.message || 'Unable to load nutrition data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const score = daily?.daily_score ?? 0;

  const macros = useMemo(() => {
    const c = daily?.comparison || {};
    return MACROS.map((m) => ({
      ...m,
      consumed: Number(c[m.key]?.consumed || 0),
      target: Number(c[m.key]?.target || 0),
      pct: Math.min(100, Number(c[m.key]?.pct || 0)),
    }));
  }, [daily]);

  const calories = useMemo(() => {
    const c = daily?.comparison?.calories;
    return { consumed: Number(c?.consumed || 0), target: Number(c?.target || 0) };
  }, [daily]);

  const pctColor = (pct: number) =>
    pct >= 80 ? theme.success : pct >= 40 ? theme.warning : theme.error;

  const allMicroRows = useMemo(() => {
    const c = daily?.comparison || {};
    return Object.entries(c)
      .filter(([k]) => !['calories', 'protein', 'carbs', 'fat', 'fiber'].includes(k))
      .map(([k, v]: [string, NutrientComparison]) => ({
        key: k,
        label: formatMicronutrientLabel(k),
        unit: micronutrientUnit(k),
        pct: Math.min(100, Number(v?.pct || 0)),
        consumed: Number(v?.consumed || 0),
        target: Number(v?.target || 0),
      }));
  }, [daily]);
  const [showAllMicros, setShowAllMicros] = useState(false);
  const microRows = showAllMicros ? allMicroRows : allMicroRows.slice(0, 10);

  const handleAddFoodFromCoach = async (food: RecommendedFood) => {
    try {
      await nutritionApi.createLog({
        source_type: 'manual',
        title: food?.name || 'Coach Food',
        meal_type: 'meal',
        servings: 1,
        quantity: 1,
        nutrition: food?.nutrition_info || {},
      });
      await refresh();
    } catch (e) {
      Alert.alert('Error', 'Failed to add food. Please try again.');
    }
  };

  const handleDeleteLog = async (logId: string, title: string) => {
    Alert.alert('Remove Log', `Remove "${title}" from today's log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await nutritionApi.deleteLog(logId);
            await refresh();
          } catch (e) {
            console.error('Delete log failed', e);
          }
        },
      },
    ]);
  };

  const logs = daily?.logs || [];

  const handleAddManual = async () => {
    if (!manualTitle.trim()) return;
    setSaving(true);
    try {
      await nutritionApi.createLog({
        source_type: 'manual',
        title: manualTitle.trim(),
        meal_type: 'meal',
        servings: 1,
        quantity: 1,
        nutrition: {
          calories: Number(manualCalories || 0),
          protein: Number(manualProtein || 0),
          carbs: Number(manualCarbs || 0),
          fat: Number(manualFat || 0),
        },
      });
      setManualTitle('');
      setManualCalories('');
      setManualProtein('');
      setManualCarbs('');
      setManualFat('');
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <Text style={[styles.title, { color: theme.text }]}>Chronometer</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Track macros, essential micronutrients, and daily score.</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : error ? (
          <Card style={{ marginTop: Spacing.xl }}>
            <View style={{ alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg }}>
              <Ionicons name="cloud-offline-outline" size={36} color={theme.textTertiary} />
              <Text style={{ color: theme.text, fontSize: FontSize.md, fontWeight: '700' }}>Something went wrong</Text>
              <Text style={{ color: theme.textSecondary, fontSize: FontSize.sm, textAlign: 'center' }}>{error}</Text>
              <TouchableOpacity
                onPress={refresh}
                style={{ backgroundColor: theme.primaryMuted, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, marginTop: Spacing.xs }}
              >
                <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '700' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ) : (
          <>
            {/* ── Hero Score ── */}
              <GradientCard gradient={theme.gradient.hero} style={{ marginBottom: Spacing.md, overflow: 'hidden' }}>
                {/* Watermark trophy */}
                <View style={styles.heroWatermark}>
                  <Ionicons name="trophy" size={120} color="rgba(255,255,255,0.07)" />
                </View>
                <View style={styles.rowBetween}>
                  <View style={styles.inlineRow}>
                    <Ionicons name="trophy-outline" size={14} color="rgba(255,255,255,0.8)" />
                    <Text style={[styles.scoreLabel, { color: 'rgba(255,255,255,0.8)' }]}>Daily Target Score</Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                    <Text style={[styles.pillText, { color: '#fff' }]}>{score >= 80 ? 'On Track' : 'In Progress'}</Text>
                  </View>
                </View>
                <Text style={[styles.scoreValue, { color: '#fff' }]}>{score}/100</Text>
                <Text style={[styles.heroSub, { color: 'rgba(255,255,255,0.7)' }]}>Keep stacking meals and nutrient-dense foods to increase today's score.</Text>
                <TouchableOpacity style={styles.heroCta} onPress={() => router.push('/(tabs)/meals?tab=browse' as any)}>
                  <Text style={styles.heroCtaText}>Log a meal →</Text>
                </TouchableOpacity>
              </GradientCard>

            {/* ── Calorie Summary Row ── */}
              <View style={styles.statRow}>
                {[
                  { label: 'Calories', value: `${calories.consumed.toFixed(0)}`, sub: `/ ${calories.target.toFixed(0)} kcal`, icon: 'flame-outline' as const },
                  { label: 'Protein', value: `${macros.find((m) => m.key === 'protein')?.pct.toFixed(0) ?? 0}%`, sub: 'of target', icon: 'barbell-outline' as const },
                  { label: 'Score', value: `${score}`, sub: '/ 100', icon: 'star-outline' as const },
                ].map((s) => (
                  <Card key={s.label} style={styles.statCard}>
                    <Ionicons name={s.icon} size={16} color={theme.primary} style={{ marginBottom: 4 }} />
                    <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
                    <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{s.label}</Text>
                    <Text style={[styles.statSub, { color: theme.textTertiary }]}>{s.sub}</Text>
                  </Card>
                ))}
              </View>

            {/* ── Today's Meals ── */}
            <Card style={{ marginBottom: Spacing.md }}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.inlineRow}>
                  <Ionicons name="receipt-outline" size={15} color={theme.primary} />
                  <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Today's Meals</Text>
                </View>
                <Text style={[styles.logCount, { color: theme.textTertiary }]}>{logs.length} logged</Text>
              </View>
              {logs.length === 0 ? (
                <View style={styles.emptyLogs}>
                  <Ionicons name="fast-food-outline" size={28} color={theme.textTertiary} />
                  <Text style={[styles.emptyLogsText, { color: theme.textSecondary }]}>No meals logged yet today</Text>
                  <TouchableOpacity
                    style={[styles.emptyLogsBtn, { backgroundColor: theme.primaryMuted }]}
                    onPress={() => router.push('/(tabs)/meals?tab=browse' as any)}
                  >
                    <Ionicons name="add" size={14} color={theme.primary} />
                    <Text style={[styles.emptyLogsBtnText, { color: theme.primary }]}>Browse Recipes</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                logs.map((log: DailyLog, idx: number) => {
                  const snap = log.nutrition_snapshot || {};
                  const cal = Number(snap.calories || 0);
                  const pro = Number(snap.protein || 0);
                  const carb = Number(snap.carbs || 0);
                  const fat = Number(snap.fat || 0);
                  const sourceIcon =
                    log.source_type === 'recipe' ? 'restaurant-outline' :
                    log.source_type === 'meal_plan' ? 'calendar-outline' : 'create-outline';
                  return (
                    <View
                      key={log.id}
                      style={[
                        styles.logRow,
                        idx < logs.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                      ]}
                    >
                      <View style={[styles.logIcon, { backgroundColor: theme.primaryMuted }]}> 
                        <Ionicons name={sourceIcon as any} size={16} color={theme.primary} />
                      </View>
                      <View style={styles.logInfo}>
                        <Text style={[styles.logTitle, { color: theme.text }]} numberOfLines={1}>
                          {log.title || 'Untitled'}
                        </Text>
                        <View style={styles.logMacros}>
                          <Text style={[styles.logMacro, { color: theme.textTertiary }]}>
                            {cal.toFixed(0)} kcal
                          </Text>
                          {pro > 0 && (
                            <Text style={[styles.logMacro, { color: theme.textTertiary }]}>
                              P {pro.toFixed(0)}g
                            </Text>
                          )}
                          {carb > 0 && (
                            <Text style={[styles.logMacro, { color: theme.textTertiary }]}>
                              C {carb.toFixed(0)}g
                            </Text>
                          )}
                          {fat > 0 && (
                            <Text style={[styles.logMacro, { color: theme.textTertiary }]}>
                              F {fat.toFixed(0)}g
                            </Text>
                          )}
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDeleteLog(log.id, log.title || 'Untitled')}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.error} />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </Card>

            {/* ── Macros ── */}
            <Card style={{ marginBottom: Spacing.md }}>
              <View style={styles.inlineRow}>
                <Ionicons name="nutrition-outline" size={15} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Macros</Text>
              </View>
              {macros.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={{ marginBottom: Spacing.sm }}
                  onPress={() =>
                    setSelectedNutrient({
                      label: m.label,
                      consumed: m.consumed,
                      target: m.target,
                      unit: m.unit,
                      pct: m.pct,
                    })
                  }
                >
                  <View style={styles.rowBetween}>
                    <View style={styles.inlineRow}>
                      <Ionicons name={m.icon} size={14} color={theme.textSecondary} />
                      <Text style={[styles.rowLabel, { color: theme.text }]}>{m.label}</Text>
                    </View>
                    <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>{m.consumed.toFixed(0)}/{m.target.toFixed(0)} {m.unit}</Text>
                  </View>
                  <View style={[styles.barBg, { backgroundColor: theme.surfaceHighlight }]}>
                    <LinearGradient
                      colors={theme.gradient.primary}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.barFill, { width: `${m.pct}%`, borderRadius: 4 }]}
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </Card>

            {/* ── Micronutrients ── */}
            <Card style={{ marginBottom: Spacing.md }}>
              <View style={styles.inlineRow}>
                <Ionicons name="flask-outline" size={15} color={theme.accent} />
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Essential Micronutrients</Text>
              </View>
              {microRows.map((m, idx) => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.microRow, idx % 2 === 1 && { backgroundColor: theme.surfaceHighlight, borderRadius: BorderRadius.sm, marginHorizontal: -Spacing.xs, paddingHorizontal: Spacing.xs }]}
                  onPress={() =>
                    setSelectedNutrient({
                      label: m.label,
                      consumed: m.consumed,
                      target: m.target,
                      unit: m.unit,
                      pct: m.pct,
                    })
                  }
                >
                  <View style={styles.microTopRow}>
                    <View style={styles.microLeft}>
                      <Ionicons name={microIcon(m.label) as any} size={13} color={theme.textSecondary} />
                      <Text style={[styles.microName, { color: theme.text }]} numberOfLines={1}>{m.label}</Text>
                    </View>
                    <Text style={[styles.rowMeta, { color: pctColor(m.pct), fontWeight: '700' }]}>{m.pct.toFixed(0)}%</Text>
                  </View>
                  <View style={styles.microMetaRow}>
                    <Text style={[styles.microDetail, { color: theme.textTertiary }]}> 
                      {m.consumed.toFixed(1)}/{m.target.toFixed(1)} {m.unit}
                    </Text>
                  </View>
                  <View style={[styles.barBg, { backgroundColor: theme.surfaceHighlight, marginTop: 4 }]}> 
                    <LinearGradient
                      colors={theme.gradient.accent}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.barFill, { width: `${m.pct}%`, borderRadius: 4 }]}
                    />
                  </View>
                </TouchableOpacity>
              ))}
              {allMicroRows.length > 10 && (
                <TouchableOpacity
                  onPress={() => setShowAllMicros((v) => !v)}
                  style={{ alignItems: 'center', paddingVertical: Spacing.sm, marginTop: Spacing.xs }}
                >
                  <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '700' }}>
                    {showAllMicros ? 'Show less' : `Show all ${allMicroRows.length} nutrients`}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => router.push('/food/search')}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.sm, paddingVertical: Spacing.sm, backgroundColor: theme.primaryMuted, borderRadius: BorderRadius.full }}
              >
                <Ionicons name="search" size={14} color={theme.primary} />
                <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '700' }}>Search Food Database</Text>
              </TouchableOpacity>
            </Card>

            {/* ── What To Eat Next ── */}
            <Card style={{ marginBottom: Spacing.md }}>
              <View style={styles.inlineRow}>
                <Ionicons name="restaurant-outline" size={15} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>What To Eat Next</Text>
              </View>
              {(gaps?.recommended_foods || []).length === 0 ? (
                <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>No specific recommendations right now - keep logging meals.</Text>
              ) : (
                (gaps?.recommended_foods || []).slice(0, 3).map((f: RecommendedFood) => (
                  <View key={`next-${f.for}-${f.food_id}`} style={styles.nextRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.suggestionText, { color: theme.text }]}>{f.name}</Text>
                      <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>Best for: {String(f.for || '').replace(/_/g, ' ')}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleAddFoodFromCoach(f)} style={[styles.smallBtn, { backgroundColor: theme.accentMuted }]}>
                      <Text style={[styles.smallBtnText, { color: theme.accent }]}>Add</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </Card>

            {/* ── Nutrition Gap Coach ── */}
            <Card style={{ marginBottom: Spacing.md }}>
              <View style={styles.inlineRow}>
                <Ionicons name="bulb-outline" size={15} color={theme.warning} />
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Nutrition Gap Coach</Text>
              </View>
              {(gaps?.low_nutrients || []).length === 0 ? (
                <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>Great job - no major nutrient gaps right now.</Text>
              ) : (
                <>
                  {(gaps?.low_nutrients || []).map((g: LowNutrient) => (
                    <View key={g.key} style={styles.gapRow}>
                      <View style={styles.inlineRow}>
                        <View style={[styles.gapDot, { backgroundColor: theme.warning }]} />
                        <Text style={[styles.gapName, { color: theme.text }]}>{g.key.replace(/_/g, ' ')}</Text>
                      </View>
                      <Text style={[styles.rowMeta, { color: theme.warning }]}>low ({Number(g.pct || 0).toFixed(0)}%)</Text>
                    </View>
                  ))}
                  {(gaps?.recommended_meals || []).length > 0 ? (
                    <View style={{ marginTop: Spacing.sm }}>
                      <Text style={[styles.rowMeta, { color: theme.textSecondary, marginBottom: 6 }]}>Suggested meals:</Text>
                      {(gaps?.recommended_meals || []).map((s: RecommendedMeal) => (
                        <View key={`${s.for}-${s.recipe_id}`} style={styles.suggestionRow}>
                          <Text style={[styles.suggestionText, { color: theme.primary, flex: 1 }]}>• {s.title}</Text>
                          <TouchableOpacity onPress={() => s.recipe_id && router.push(`/browse/${s.recipe_id}` as any)} style={[styles.smallBtn, { backgroundColor: theme.primaryMuted }]}>
                            <Text style={[styles.smallBtnText, { color: theme.primary }]}>Open</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {(gaps?.recommended_foods || []).length > 0 ? (
                    <View style={{ marginTop: Spacing.sm }}>
                      <Text style={[styles.rowMeta, { color: theme.textSecondary, marginBottom: 6 }]}>Recommended foods:</Text>
                      {(gaps?.recommended_foods || []).map((f: RecommendedFood) => (
                        <View key={`${f.for}-${f.food_id}`} style={styles.suggestionRow}>
                          <Text style={[styles.suggestionText, { color: theme.accent, flex: 1 }]}>• {f.name}</Text>
                          <TouchableOpacity onPress={() => handleAddFoodFromCoach(f)} style={[styles.smallBtn, { backgroundColor: theme.accentMuted }]}>
                            <Text style={[styles.smallBtnText, { color: theme.accent }]}>Add</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </>
              )}
            </Card>

            {/* ── Quick Manual Add ── */}
            <Card>
              <View style={styles.inlineRow}>
                <Ionicons name="create-outline" size={15} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Quick Manual Add</Text>
              </View>
              <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]} placeholder="Meal title" placeholderTextColor={theme.textTertiary} value={manualTitle} onChangeText={setManualTitle} />
              <View style={styles.inputGrid}>
                {[
                  ['Calories', manualCalories, setManualCalories],
                  ['Protein', manualProtein, setManualProtein],
                  ['Carbs', manualCarbs, setManualCarbs],
                  ['Fat', manualFat, setManualFat],
                ].map(([label, value, setter]: any) => (
                  <TextInput
                    key={label}
                    style={[styles.inputSmall, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
                    placeholder={label}
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="decimal-pad"
                    value={value}
                    onChangeText={setter}
                  />
                ))}
              </View>
              <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.primary }]} onPress={handleAddManual} disabled={saving}>
                <Ionicons name="add-circle" size={16} color="#fff" />
                <Text style={styles.addBtnText}>{saving ? 'Adding...' : 'Add Log'}</Text>
              </TouchableOpacity>
            </Card>
          </>
        )}
      </ScrollView>

      <Modal visible={!!selectedNutrient} transparent animationType="slide" onRequestClose={() => setSelectedNutrient(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}> 
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{selectedNutrient?.label}</Text>
              <TouchableOpacity onPress={() => setSelectedNutrient(null)}>
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={[styles.barBg, { backgroundColor: theme.surfaceHighlight, height: 8, marginTop: Spacing.md }]}>
              <LinearGradient
                colors={theme.gradient.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.barFill, { width: `${Math.min(100, Number(selectedNutrient?.pct || 0))}%`, borderRadius: 4 }]}
              />
            </View>
            <Text style={[styles.modalMeta, { color: theme.textSecondary }]}>Consumed: {Number(selectedNutrient?.consumed || 0).toFixed(1)} {selectedNutrient?.unit || ''}</Text>
            <Text style={[styles.modalMeta, { color: theme.textSecondary }]}>Target: {Number(selectedNutrient?.target || 0).toFixed(1)} {selectedNutrient?.unit || ''}</Text>
            <Text style={[styles.modalScore, { color: pctColor(Number(selectedNutrient?.pct || 0)) }]}>{Number(selectedNutrient?.pct || 0).toFixed(0)}%</Text>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: FontSize.xxl, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { marginTop: 2, marginBottom: Spacing.md, fontSize: FontSize.sm },
  center: { marginTop: Spacing.xl, alignItems: 'center' },
  /* ── Hero ── */
  heroWatermark: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    opacity: 1,
  },
  scoreLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  scoreValue: { fontSize: FontSize.hero, fontWeight: '900', marginTop: 2, letterSpacing: -1 },
  heroSub: {
    marginTop: 6,
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  heroCta: {
    marginTop: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
  },
  heroCtaText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  /* ── Stat Row ── */
  statRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  statSub: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  /* ── Section ── */
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.sm, letterSpacing: 0.3 },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.xs,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rowLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  rowMeta: { fontSize: FontSize.xs, fontWeight: '600' },
  barBg: { height: 6, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%' },
  microRow: { paddingVertical: Spacing.xs },
  microTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  microLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: Spacing.sm },
  microName: { flex: 1, fontSize: FontSize.xs, fontWeight: '600' },
  microMetaRow: { marginTop: 2, marginBottom: 2 },
  microDetail: { fontSize: 11, fontWeight: '500' },
  /* ── Today's Meals ── */
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  logCount: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  emptyLogs: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyLogsText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  emptyLogsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
  },
  emptyLogsBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  logIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logInfo: {
    flex: 1,
    gap: 2,
  },
  logTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  logMacros: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  logMacro: {
    fontSize: 11,
    fontWeight: '500',
  },
  /* ── Gap Coach ── */
  gapDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  gapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  gapName: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 6,
  },
  suggestionText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginBottom: 3,
  },
  smallBtn: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  smallBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  inputGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  inputSmall: {
    width: '47%',
    height: 40,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  addBtn: {
    height: 42,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  modalMeta: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
  },
  modalScore: {
    marginTop: Spacing.md,
    fontSize: FontSize.xxxl,
    fontWeight: '800',
  },
});
