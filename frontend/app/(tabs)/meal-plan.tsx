import React, { useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Card } from '../../components/GradientCard';
import { Button } from '../../components/Button';
import { ChipSelector } from '../../components/ChipSelector';
import { useTheme } from '../../hooks/useTheme';
import { useMealPlanStore } from '../../stores/mealPlanStore';
import { useAuthStore } from '../../stores/authStore';
import { useGamificationStore } from '../../stores/gamificationStore';
import { mealPlanApi } from '../../services/api';
import { FLAVOR_OPTIONS, DIETARY_OPTIONS, ALLERGY_OPTIONS } from '../../constants/Config';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  bulk_cook: { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6', label: 'Bulk Cook' },
  quick: { bg: 'rgba(34,197,94,0.12)', text: '#22C55E', label: 'Quick' },
  sit_down: { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B', label: 'Sit-Down' },
};

export default function MealPlanScreen() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const addXp = useAuthStore((s) => s.addXp);
  const completeAction = useGamificationStore((s) => s.completeAction);
  const { currentPlan, isGenerating, selectedDay, setCurrentPlan, setGenerating, setSelectedDay } =
    useMealPlanStore();
  const [showPrefs, setShowPrefs] = useState(!currentPlan);
  const [flavors, setFlavors] = useState<string[]>(user?.flavor_preferences || []);
  const [dietary, setDietary] = useState<string[]>(user?.dietary_preferences || []);
  const [allergies, setAllergies] = useState<string[]>(user?.allergies || []);
  const [timePrefs, setTimePrefs] = useState({ quick: 4, medium: 2, long: 1 });
  const [error, setError] = useState('');
  const [questToast, setQuestToast] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  const showQuestToast = (message: string) => {
    setQuestToast(message);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setQuestToast(null));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const result = await mealPlanApi.generate({
        preferences: {
          flavor_preferences: flavors,
          dietary_restrictions: dietary,
          allergies: allergies,
          cooking_time_budget: timePrefs,
          household_size: user?.household_size || 1,
          budget_level: user?.budget_level || 'medium',
          bulk_cook_preference: true,
          meals_per_day: 3,
        },
      });
      if (!result?.items?.length) {
        throw new Error('Plan returned with no meals');
      }
      setCurrentPlan(result);
      setShowPrefs(false);
      const questResult = completeAction('meal_plan');
      if (questResult.gainedXp > 0) {
        addXp(questResult.gainedXp);
        showQuestToast(`Quest complete · +${questResult.gainedXp} XP`);
      }
    } catch (err: any) {
      const samplePlan = generateSamplePlan();
      setCurrentPlan(samplePlan);
      setShowPrefs(false);
    } finally {
      setGenerating(false);
    }
  };

  const toggleFlavor = (id: string) => {
    setFlavors((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const toggleDietary = (id: string) => {
    setDietary((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const toggleAllergy = (id: string) => {
    setAllergies((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const todayMeals = currentPlan?.items?.filter((item) => item.day_of_week === selectedDay) || [];

  if (showPrefs || !currentPlan) {
    return (
      <ScreenContainer>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={[styles.title, { color: theme.text }]}>Create Your{'\n'}Meal Plan</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Tell us your preferences and we'll build a personalized week of whole-food meals.
          </Text>

          <ChipSelector
            label="Flavor Preferences"
            options={FLAVOR_OPTIONS}
            selected={flavors}
            onToggle={toggleFlavor}
          />

          <ChipSelector
            label="Dietary Restrictions"
            options={DIETARY_OPTIONS}
            selected={dietary}
            onToggle={toggleDietary}
          />

          <ChipSelector
            label="Allergies"
            options={ALLERGY_OPTIONS}
            selected={allergies}
            onToggle={toggleAllergy}
          />

          <View style={styles.timeSection}>
            <Text style={[styles.sectionLabel, { color: theme.text }]}>Weekly Cooking Time Mix</Text>
            <View style={styles.timeRow}>
              {[
                { key: 'quick', label: 'Quick (<20m)', icon: 'flash' as const },
                { key: 'medium', label: 'Medium (20-45m)', icon: 'time' as const },
                { key: 'long', label: 'Long (45m+)', icon: 'hourglass' as const },
              ].map((item) => (
                <Card key={item.key} style={styles.timeCard} padding={Spacing.md}>
                  <Ionicons name={item.icon} size={20} color={theme.primary} />
                  <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      onPress={() =>
                        setTimePrefs((p) => ({
                          ...p,
                          [item.key]: Math.max(0, p[item.key as keyof typeof p] - 1),
                        }))
                      }
                      style={[styles.stepperBtn, { backgroundColor: theme.surfaceHighlight }]}
                    >
                      <Ionicons name="remove" size={16} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.stepperValue, { color: theme.text }]}>
                      {timePrefs[item.key as keyof typeof timePrefs]}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setTimePrefs((p) => ({
                          ...p,
                          [item.key]: p[item.key as keyof typeof p] + 1,
                        }))
                      }
                      style={[styles.stepperBtn, { backgroundColor: theme.primaryMuted }]}
                    >
                      <Ionicons name="add" size={16} color={theme.primary} />
                    </TouchableOpacity>
                  </View>
                </Card>
              ))}
            </View>
          </View>

          <Button
            title={isGenerating ? 'Generating...' : 'Generate Meal Plan'}
            onPress={handleGenerate}
            loading={isGenerating}
            fullWidth
            size="lg"
            style={{ marginTop: Spacing.xxl, marginBottom: Spacing.huge }}
          />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {questToast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.questToast,
            {
              backgroundColor: theme.primary,
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }),
                },
              ],
            },
          ]}
        >
          <Ionicons name="trophy" size={14} color="#fff" />
          <Text style={styles.questToastText}>{questToast}</Text>
        </Animated.View>
      ) : null}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.planHeader}>
          <View>
            <Text style={[styles.title, { color: theme.text, marginBottom: 0 }]}>Meal Plan</Text>
            <Text style={[styles.planDate, { color: theme.textSecondary }]}>
              Week of {currentPlan.week_start || 'This Week'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Button title="Browse" variant="outline" size="sm" onPress={() => router.push('/browse')} />
            <Button title="New Plan" variant="outline" size="sm" onPress={() => setShowPrefs(true)} />
          </View>
        </View>

        {/* Day Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
          <View style={styles.dayRow}>
            {DAYS.map((day, index) => {
              const isSelected = day === selectedDay;
              const hasMeals = currentPlan.items?.some((i) => i.day_of_week === day);
              return (
                <TouchableOpacity
                  key={day}
                  onPress={() => setSelectedDay(day)}
                  activeOpacity={0.7}
                  style={styles.dayBtn}
                >
                  {isSelected ? (
                    <LinearGradient
                      colors={theme.gradient.primary}
                      style={styles.dayBtnInner}
                    >
                      <Text style={styles.dayBtnTextActive}>{DAY_SHORT[index]}</Text>
                    </LinearGradient>
                  ) : (
                    <View
                      style={[
                        styles.dayBtnInner,
                        { backgroundColor: theme.surfaceElevated },
                      ]}
                    >
                      <Text style={[styles.dayBtnText, { color: theme.textSecondary }]}>
                        {DAY_SHORT[index]}
                      </Text>
                      {hasMeals && (
                        <View style={[styles.dayDot, { backgroundColor: theme.primary }]} />
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Meals for selected day */}
        <Text style={[styles.sectionLabel, { color: theme.text }]}>{selectedDay}'s Meals</Text>

        {todayMeals.length === 0 ? (
          <Card padding={Spacing.xxl}>
            <View style={styles.emptyDay}>
              <Ionicons name="restaurant-outline" size={40} color={theme.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No meals planned for this day
              </Text>
            </View>
          </Card>
        ) : (
          todayMeals.map((meal, index) => {
            const recipe = meal.recipe_data || {};
            const cat = CATEGORY_COLORS[meal.meal_category] || CATEGORY_COLORS.quick;
            return (
              <Card key={index} style={styles.mealCard} padding={Spacing.lg}>
                <View style={styles.mealHeader}>
                  <View>
                    <Text style={[styles.mealType, { color: theme.textTertiary }]}>
                      {meal.meal_type.charAt(0).toUpperCase() + meal.meal_type.slice(1)}
                    </Text>
                    <Text style={[styles.mealName, { color: theme.text }]}>
                      {recipe.title || 'Meal'}
                    </Text>
                  </View>
                  <View style={[styles.categoryBadge, { backgroundColor: cat.bg }]}>
                    <Text style={[styles.categoryText, { color: cat.text }]}>{cat.label}</Text>
                  </View>
                </View>
                {recipe.description && (
                  <Text style={[styles.mealDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                    {recipe.description}
                  </Text>
                )}
                <View style={styles.mealMeta}>
                  {recipe.prep_time_min != null && (
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={14} color={theme.textTertiary} />
                      <Text style={[styles.metaText, { color: theme.textTertiary }]}>
                        {(recipe.prep_time_min || 0) + (recipe.cook_time_min || 0)} min
                      </Text>
                    </View>
                  )}
                  {meal.is_bulk_cook && (
                    <View style={styles.metaItem}>
                      <Ionicons name="layers-outline" size={14} color={theme.info} />
                      <Text style={[styles.metaText, { color: theme.info }]}>
                        {meal.servings} servings
                      </Text>
                    </View>
                  )}
                  {recipe.difficulty && (
                    <View style={styles.metaItem}>
                      <Ionicons name="speedometer-outline" size={14} color={theme.textTertiary} />
                      <Text style={[styles.metaText, { color: theme.textTertiary }]}>
                        {recipe.difficulty}
                      </Text>
                    </View>
                  )}
                </View>
              </Card>
            );
          })
        )}
        <View style={{ height: Spacing.huge }} />
      </ScrollView>
    </ScreenContainer>
  );
}

function generateSamplePlan() {
  const meals = [
    { type: 'breakfast', cat: 'quick', title: 'Overnight Oats with Berries', desc: 'Steel-cut oats soaked overnight with chia seeds, fresh berries, and raw honey.', prep: 5, cook: 0, diff: 'easy' },
    { type: 'lunch', cat: 'bulk_cook', title: 'Mediterranean Quinoa Bowl', desc: 'Quinoa with roasted vegetables, chickpeas, olive oil, lemon tahini dressing.', prep: 15, cook: 25, diff: 'easy', bulk: true, servings: 4 },
    { type: 'dinner', cat: 'quick', title: 'Grilled Salmon with Sweet Potato', desc: 'Wild-caught salmon with roasted sweet potato and steamed broccoli.', prep: 10, cook: 20, diff: 'medium' },
    { type: 'breakfast', cat: 'quick', title: 'Avocado Toast with Eggs', desc: 'Sourdough toast with mashed avocado, poached eggs, and everything seasoning.', prep: 5, cook: 8, diff: 'easy' },
    { type: 'lunch', cat: 'quick', title: 'Leftover Quinoa Bowl', desc: 'Enjoy your bulk-cooked Mediterranean quinoa bowl.', prep: 2, cook: 0, diff: 'easy' },
    { type: 'dinner', cat: 'sit_down', title: 'Herb-Crusted Chicken with Roasted Vegetables', desc: 'Free-range chicken breast with a fresh herb crust, roasted root vegetables.', prep: 20, cook: 40, diff: 'medium' },
  ];

  const items = [];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (const day of days) {
    for (let i = 0; i < 3; i++) {
      const meal = meals[Math.floor(Math.random() * meals.length)];
      items.push({
        id: `${day}-${i}`,
        day_of_week: day,
        meal_type: ['breakfast', 'lunch', 'dinner'][i],
        meal_category: meal.cat,
        is_bulk_cook: meal.bulk || false,
        servings: meal.servings || 1,
        recipe_data: {
          title: meal.title,
          description: meal.desc,
          prep_time_min: meal.prep,
          cook_time_min: meal.cook,
          difficulty: meal.diff,
          ingredients: [],
          steps: [],
        },
      });
    }
  }

  return {
    id: 'sample',
    week_start: new Date().toISOString().split('T')[0],
    items,
    created_at: new Date().toISOString(),
  };
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.md,
    lineHeight: 22,
    marginBottom: Spacing.xxl,
  },
  questToast: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
  },
  questToastText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  planDate: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  timeSection: {
    marginTop: Spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  timeCard: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  timeLabel: {
    fontSize: FontSize.xs,
    textAlign: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'center',
  },
  dayScroll: {
    marginBottom: Spacing.md,
  },
  dayRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  dayBtn: {},
  dayBtnInner: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  dayBtnTextActive: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  emptyDay: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  mealCard: {
    marginBottom: Spacing.md,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mealType: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealName: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginTop: 2,
  },
  categoryBadge: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  categoryText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  mealDesc: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
  mealMeta: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
});
