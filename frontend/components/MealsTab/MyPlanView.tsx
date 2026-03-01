import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  RefreshControl,
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
import { ScreenContainer } from '../ScreenContainer';
import { Card } from '../GradientCard';
import { Button } from '../Button';
import { ChipSelector } from '../ChipSelector';
import { useTheme } from '../../hooks/useTheme';
import { useMealPlanStore } from '../../stores/mealPlanStore';
import { useAuthStore } from '../../stores/authStore';
import { useGamificationStore } from '../../stores/gamificationStore';
import { mealPlanApi, nutritionApi } from '../../services/api';
import { FLAVOR_OPTIONS, DIETARY_OPTIONS, ALLERGY_OPTIONS } from '../../constants/Config';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  bulk_cook: { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6', label: 'Bulk Cook' },
  quick: { bg: 'rgba(34,197,94,0.12)', text: '#22C55E', label: 'Quick' },
  sit_down: { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B', label: 'Sit-Down' },
};

export function MyPlanView() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const addXp = useAuthStore((s) => s.addXp);
  const awardXP = useGamificationStore((s) => s.awardXP);
  const { currentPlan, isGenerating, selectedDay, setCurrentPlan, setGenerating, setSelectedDay } =
    useMealPlanStore();
  const loadCurrentPlan = useMealPlanStore((s) => s.loadCurrentPlan);
  const isLoadingPlan = useMealPlanStore((s) => s.isLoading);
  const [showPrefs, setShowPrefs] = useState(false);

  useEffect(() => {
    loadCurrentPlan();
  }, []);
  const [flavors, setFlavors] = useState<string[]>(user?.flavor_preferences || []);
  const [dietary, setDietary] = useState<string[]>(user?.dietary_preferences || []);
  const [allergies, setAllergies] = useState<string[]>(user?.allergies || []);
  const [applySubstitutions, setApplySubstitutions] = useState(false);
  const [timePrefs, setTimePrefs] = useState({ quick: 4, medium: 2, long: 1 });
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
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
        apply_substitutions: applySubstitutions,
        preferences: {
          flavor_preferences: flavors,
          dietary_restrictions: dietary,
          allergies: allergies,
          liked_ingredients: user?.liked_ingredients || [],
          disliked_ingredients: user?.disliked_ingredients || [],
          protein_preferences: user?.protein_preferences || { liked: [], disliked: [] },
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
      // Award XP for generating a meal plan
      awardXP(500, 'weekly_meal_plan').then((res) => {
        if (res.xp_gained > 0) {
          showQuestToast(`+${res.xp_gained} XP · Weekly Plan`);
        }
      });
    } catch (err: any) {
      setError(err?.message || 'Unable to generate meal plan. Please try again.');
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

  if (isLoadingPlan && !currentPlan) {
    return (
      <ScreenContainer safeArea={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ color: theme.textSecondary, marginTop: Spacing.md, fontSize: FontSize.md }}>Loading your meal plan...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (showPrefs || !currentPlan) {
    return (
      <ScreenContainer safeArea={false}>
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

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setApplySubstitutions((v) => !v)}
            style={[styles.personalizeToggle, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
          >
            <View style={styles.personalizeToggleLeft}>
              <Ionicons name="sparkles" size={18} color={theme.primary} />
              <View>
                <Text style={[styles.personalizeTitle, { color: theme.text }]}>Personalize ingredients</Text>
                <Text style={[styles.personalizeSubtitle, { color: theme.textSecondary }]}>Opt-in AI substitutions for dislikes and allergies</Text>
              </View>
            </View>
            <View
              style={[
                styles.personalizeCheck,
                {
                  borderColor: applySubstitutions ? theme.primary : theme.border,
                  backgroundColor: applySubstitutions ? theme.primary : 'transparent',
                },
              ]}
            >
              {applySubstitutions ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
            </View>
          </TouchableOpacity>

          {error ? (
            <View style={{ backgroundColor: theme.errorMuted, borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <Ionicons name="alert-circle" size={20} color={theme.error} />
              <Text style={{ color: theme.error, fontSize: FontSize.sm, flex: 1 }}>{error}</Text>
            </View>
          ) : null}

          <Button
            title={isGenerating ? 'Generating...' : 'Generate Meal Plan'}
            onPress={handleGenerate}
            loading={isGenerating}
            fullWidth
            size="lg"
            style={{ marginTop: error ? Spacing.md : Spacing.xxl, marginBottom: Spacing.huge }}
          />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer safeArea={false}>
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                const plan = await mealPlanApi.getCurrent();
                if (plan?.items?.length) setCurrentPlan(plan);
              } catch {}
              setRefreshing(false);
            }}
            tintColor={theme.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.planHeader}>
          <View>
            <Text style={[styles.title, { color: theme.text, marginBottom: 0 }]}>Meal Plan</Text>
            <Text style={[styles.planDate, { color: theme.textSecondary }]}>
              Week of {currentPlan.week_start || 'This Week'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
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
            const recipeId = recipe.id;
            return (
              <Card 
                key={index}
                style={styles.mealCard} 
                padding={Spacing.lg}
                onPress={() => recipeId && router.push(`/browse/${recipeId}`)}
              >
                <View style={styles.mealHeader}>
                  <View style={styles.mealHeaderLeft}>
                    <Text style={[styles.mealType, { color: theme.textTertiary }]}>
                      {meal.meal_type.charAt(0).toUpperCase() + meal.meal_type.slice(1)}
                    </Text>
                    <Text style={[styles.mealName, { color: theme.text }]} numberOfLines={2}>
                      {recipe.title || 'Meal'}
                    </Text>
                  </View>
                  <View style={[styles.categoryBadge, { backgroundColor: cat.bg }]}>
                    <Text style={[styles.categoryText, { color: cat.text }]}>{cat.label}</Text>
                  </View>
                </View>
                {recipe.is_personalized && (
                  <View style={[styles.personalizedBadge, { backgroundColor: theme.primaryMuted }]}> 
                    <Ionicons name="sparkles" size={12} color={theme.primary} />
                    <Text style={[styles.personalizedText, { color: theme.primary }]}>Personalized</Text>
                  </View>
                )}
                  {recipe.description && (
                    <Text style={[styles.mealDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                      {recipe.description}
                    </Text>
                  )}
                <View style={styles.mealMeta}>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        await nutritionApi.createLog({
                          source_type: 'meal_plan',
                          source_id: meal.id,
                          meal_type: meal.meal_type,
                          servings: 1,
                          quantity: 1,
                        });
                        Alert.alert('Logged!', `"${recipe.title || meal.meal_type}" added to today's nutrition log.`);
                      } catch (e) {
                        Alert.alert('Error', 'Failed to log meal. Please try again.');
                      }
                    }}
                    style={[styles.metaItem, { backgroundColor: theme.infoMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }]}
                  >
                    <Ionicons name="add-circle-outline" size={13} color={theme.info} />
                    <Text style={[styles.metaText, { color: theme.info }]}>Log</Text>
                  </TouchableOpacity>
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
  personalizeToggle: {
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  personalizeToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    marginRight: Spacing.md,
  },
  personalizeTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  personalizeSubtitle: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  personalizeCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: Spacing.sm,
  },
  mealHeaderLeft: {
    flex: 1,
    minWidth: 0,
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
    flexShrink: 0,
  },
  categoryText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textAlign: 'center',
  },
  mealDesc: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
  personalizedBadge: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  personalizedText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
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
