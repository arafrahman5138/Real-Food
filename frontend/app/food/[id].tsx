import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { Card } from '../../components/GradientCard';
import { useTheme } from '../../hooks/useTheme';
import { foodApi, nutritionApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

interface NutrientDetail {
  value: number;
  unit: string;
}

interface FoodDetail {
  id: string;
  name: string;
  category?: string;
  brand?: string;
  source?: string;
  serving?: string;
  description?: string;
  nutrients: Record<string, NutrientDetail | number>;
  portions?: Array<{ amount: number; gramWeight: number; modifier: string }>;
}

const MACRO_KEYS: { match: string; label: string; color: 'text' | 'primary' | 'accent' | 'info' }[] = [
  { match: 'energy', label: 'Calories', color: 'text' },
  { match: 'protein', label: 'Protein', color: 'primary' },
  { match: 'carbohydrate', label: 'Carbs', color: 'accent' },
  { match: 'total lipid', label: 'Fat', color: 'info' },
  { match: 'fiber', label: 'Fiber', color: 'text' },
];

function findNutrient(nutrients: Record<string, NutrientDetail | number>, match: string): { value: number; unit: string } | null {
  for (const [key, val] of Object.entries(nutrients)) {
    if (key.toLowerCase().includes(match)) {
      if (typeof val === 'number') return { value: val, unit: match === 'energy' ? 'kcal' : 'g' };
      if (val && typeof val === 'object' && 'value' in val) return { value: val.value, unit: val.unit };
    }
  }
  const simple = nutrients[match] ?? nutrients[match + 's'];
  if (typeof simple === 'number') return { value: simple, unit: match === 'energy' || match === 'calories' ? 'kcal' : 'g' };
  return null;
}

export default function FoodDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [food, setFood] = useState<FoodDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadFood();
  }, [id]);

  const loadFood = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await foodApi.getDetail(id!);
      setFood(data);
    } catch (e: any) {
      setError(e?.message || 'Unable to load food details.');
    } finally {
      setLoading(false);
    }
  };

  const handleLog = async () => {
    if (!food) return;
    setLogging(true);
    try {
      const cals = findNutrient(food.nutrients, 'energy') ?? findNutrient(food.nutrients, 'calories');
      const protein = findNutrient(food.nutrients, 'protein');
      const carbs = findNutrient(food.nutrients, 'carbohydrate') ?? findNutrient(food.nutrients, 'carbs');
      const fat = findNutrient(food.nutrients, 'total lipid') ?? findNutrient(food.nutrients, 'fat');

      await nutritionApi.createLog({
        source_type: 'manual',
        title: food.name,
        meal_type: 'meal',
        servings: 1,
        quantity: 1,
        nutrition: {
          calories: cals?.value ?? 0,
          protein: protein?.value ?? 0,
          carbs: carbs?.value ?? 0,
          fat: fat?.value ?? 0,
        },
      });
      setLogSuccess(true);
      setTimeout(() => setLogSuccess(false), 3000);
      Alert.alert('Logged!', `"${food.name}" added to today's nutrition log.`, [
        { text: 'OK' },
        { text: 'View Chronometer', onPress: () => router.push('/(tabs)/chronometer' as any) },
      ]);
    } catch (e) {
      Alert.alert('Error', 'Failed to log food. Please try again.');
    } finally {
      setLogging(false);
    }
  };

  const macroRows = food
    ? MACRO_KEYS.map((mk) => {
        const found = findNutrient(food.nutrients, mk.match)
          ?? (mk.match === 'energy' ? findNutrient(food.nutrients, 'calories') : null);
        return { ...mk, value: found?.value ?? 0, unit: found?.unit ?? (mk.match === 'energy' ? 'kcal' : 'g') };
      })
    : [];

  const micronutrients = food
    ? Object.entries(food.nutrients)
        .filter(([key]) => {
          const k = key.toLowerCase();
          return !MACRO_KEYS.some((mk) => k.includes(mk.match)) && !k.includes('calories');
        })
        .map(([key, val]) => {
          const v = typeof val === 'number' ? { value: val, unit: '' } : val as NutrientDetail;
          return { name: key, value: v.value, unit: v.unit };
        })
        .filter((n) => n.value > 0)
    : [];

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading food details...</Text>
        </View>
      </View>
    );
  }

  if (error || !food) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>Something went wrong</Text>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error || 'Food not found.'}</Text>
          <TouchableOpacity
            onPress={loadFood}
            style={[styles.retryBtn, { backgroundColor: theme.primaryMuted }]}
          >
            <Text style={[styles.retryText, { color: theme.primary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: theme.text }]}>{food.name}</Text>
        <View style={styles.badges}>
          {food.category ? (
            <View style={[styles.categoryChip, { backgroundColor: theme.primaryMuted }]}>
              <Text style={[styles.categoryChipText, { color: theme.primary }]}>{food.category}</Text>
            </View>
          ) : null}
          {food.brand ? (
            <View style={[styles.categoryChip, { backgroundColor: theme.accentMuted }]}>
              <Text style={[styles.categoryChipText, { color: theme.accent }]}>{food.brand}</Text>
            </View>
          ) : null}
          {food.source === 'local' ? (
            <View style={[styles.categoryChip, { backgroundColor: theme.infoMuted }]}>
              <Text style={[styles.categoryChipText, { color: theme.info }]}>Local DB</Text>
            </View>
          ) : null}
        </View>
        {food.serving ? (
          <Text style={[styles.serving, { color: theme.textTertiary }]}>
            Serving: {food.serving}
          </Text>
        ) : null}

        {/* Macros */}
        <Card style={styles.nutritionCard}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Nutrition</Text>
          <View style={styles.macroGrid}>
            {macroRows.map((macro) => (
              <View key={macro.label} style={styles.macroItem}>
                <Text style={[styles.macroValue, { color: (theme as any)[macro.color] || theme.text }]}>
                  {macro.value % 1 === 0 ? macro.value : macro.value.toFixed(1)}
                  <Text style={styles.macroUnit}>{macro.unit}</Text>
                </Text>
                <Text style={[styles.macroLabel, { color: theme.textTertiary }]}>{macro.label}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Micronutrients */}
        {micronutrients.length > 0 ? (
          <Card style={styles.nutritionCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Micronutrients</Text>
            {micronutrients.map((n, idx) => (
              <View
                key={n.name}
                style={[
                  styles.microRow,
                  idx % 2 === 1 && { backgroundColor: theme.surfaceHighlight },
                ]}
              >
                <Text style={[styles.microName, { color: theme.text }]} numberOfLines={1}>
                  {n.name}
                </Text>
                <Text style={[styles.microValue, { color: theme.textSecondary }]}>
                  {n.value % 1 === 0 ? n.value : n.value.toFixed(2)} {n.unit}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Portions */}
        {food.portions && food.portions.length > 0 ? (
          <Card style={styles.nutritionCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Serving Sizes</Text>
            {food.portions.map((p, idx) => (
              <View
                key={idx}
                style={[styles.portionRow, idx % 2 === 1 && { backgroundColor: theme.surfaceHighlight }]}
              >
                <Text style={[styles.portionMod, { color: theme.text }]}>
                  {p.amount} {p.modifier || 'serving'}
                </Text>
                <Text style={[styles.portionWeight, { color: theme.textTertiary }]}>
                  {p.gramWeight}g
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky Log Bar */}
      <View style={[styles.logBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.logBtn, { backgroundColor: logSuccess ? theme.success : theme.primary }]}
          onPress={handleLog}
          disabled={logging || logSuccess}
          activeOpacity={0.8}
        >
          {logging ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : logSuccess ? (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.logBtnText}>Logged!</Text>
            </>
          ) : (
            <>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.logBtnText}>Log to Chronometer</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSize.md,
  },
  errorTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginTop: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.md,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  retryText: {
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  categoryChipText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  serving: {
    fontSize: FontSize.sm,
    marginBottom: Spacing.lg,
  },
  nutritionCard: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
  },
  macroItem: {
    alignItems: 'center',
    minWidth: 60,
  },
  macroValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  macroUnit: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  macroLabel: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  microRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  microName: {
    fontSize: FontSize.md,
    flex: 1,
  },
  microValue: {
    fontSize: FontSize.md,
    fontWeight: '600',
    textAlign: 'right',
  },
  portionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  portionMod: {
    fontSize: FontSize.md,
    flex: 1,
  },
  portionWeight: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  logBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    paddingBottom: Spacing.xl + 8,
    borderTopWidth: 1,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  logBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
