import React, { useEffect, useRef, useState } from 'react';
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
  Modal,
  ScrollView as RNScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { cleanRecipeDescription } from '../../utils/recipeDescription';
import { ProjectedMESCard } from '../ProjectedMESCard';
import { getTierConfig, useMetabolicBudgetStore } from '../../stores/metabolicBudgetStore';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FLOATING_TAB_BAR_HEIGHT = 68;
const PLANNER_CARD_BG = '#FFFFFF';
const PLANNER_SUBTLE_BG = '#FBFAF6';
const PLANNER_BORDER = '#ECE9E2';

const FLAVOR_LABELS = Object.fromEntries(FLAVOR_OPTIONS.map((option) => [option.id, option.label]));
const DIETARY_LABELS = Object.fromEntries(DIETARY_OPTIONS.map((option) => [option.id, option.label]));
const ALLERGY_LABELS = Object.fromEntries(ALLERGY_OPTIONS.map((option) => [option.id, option.label]));
const PLAN_STYLE_OPTIONS = [
  {
    id: 'prep_heavy',
    title: 'Meal Prep',
    subtitle: 'Fewer recipes, more repeats, easier batching',
    icon: 'layers-outline' as const,
  },
  {
    id: 'balanced',
    title: 'Balanced',
    subtitle: 'Some repeats, some variety',
    icon: 'sparkles-outline' as const,
  },
  {
    id: 'variety_heavy',
    title: 'Variety',
    subtitle: 'More unique meals, less repetition',
    icon: 'shuffle-outline' as const,
  },
] as const;

type PlannerStep = 'preferences' | 'shortlist';

const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  bulk_cook: { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6', label: 'Bulk Cook' },
  quick: { bg: 'rgba(34,197,94,0.12)', text: '#22C55E', label: 'Quick' },
  sit_down: { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B', label: 'Meals' },
};

export function MyPlanView({ plannerMode = false }: { plannerMode?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const awardXP = useGamificationStore((s) => s.awardXP);
  const { currentPlan, isGenerating, selectedDay, setCurrentPlan, setGenerating, setSelectedDay } =
    useMealPlanStore();
  const loadCurrentPlan = useMealPlanStore((s) => s.loadCurrentPlan);
  const isLoadingPlan = useMealPlanStore((s) => s.isLoading);

  // MES projected scores
  const mesBudget = useMetabolicBudgetStore((s) => s.budget);
  const fetchBudget = useMetabolicBudgetStore((s) => s.fetchBudget);

  useEffect(() => {
    loadCurrentPlan();
    if (!mesBudget) fetchBudget();
  }, []);
  const [flavors, setFlavors] = useState<string[]>(user?.flavor_preferences || []);
  const [dietary, setDietary] = useState<string[]>(user?.dietary_preferences || []);
  const [allergies, setAllergies] = useState<string[]>(user?.allergies || []);
  const [planStyle, setPlanStyle] = useState<'prep_heavy' | 'balanced' | 'variety_heavy'>('balanced');
  const [plannerStep, setPlannerStep] = useState<PlannerStep>('preferences');
  const [shortlist, setShortlist] = useState<Array<{ meal_type: string; items: any[] }>>([]);
  const [shortlistLoading, setShortlistLoading] = useState(false);
  const [preferredRecipeIds, setPreferredRecipeIds] = useState<string[]>([]);
  const [avoidedRecipeIds, setAvoidedRecipeIds] = useState<string[]>([]);
  const [replaceMeal, setReplaceMeal] = useState<any | null>(null);
  const [replacementOptions, setReplacementOptions] = useState<any[]>([]);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacingRecipeId, setReplacingRecipeId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [questToast, setQuestToast] = useState<string | null>(null);
  const [expandedEditor, setExpandedEditor] = useState<'flavors' | 'dietary' | 'allergies' | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const plannerEnterAnim = useRef(new Animated.Value(plannerMode ? 1 : 0)).current;
  const stepContentAnim = useRef(new Animated.Value(1)).current;
  const plannerScrollRef = useRef<RNScrollView | null>(null);
  const ctaBottomOffset = Math.max(insets.bottom, 12) + FLOATING_TAB_BAR_HEIGHT + 18;
  const createPlanBottomPadding = ctaBottomOffset + Spacing.xl;

  useEffect(() => {
    Animated.timing(plannerEnterAnim, {
      toValue: plannerMode ? 1 : 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [plannerMode, plannerEnterAnim]);

  const buildPreferencePayload = () => ({
    flavor_preferences: flavors,
    dietary_restrictions: dietary,
    allergies,
    liked_ingredients: user?.liked_ingredients || [],
    disliked_ingredients: user?.disliked_ingredients || [],
    protein_preferences: user?.protein_preferences || { liked: [], disliked: [] },
    cooking_time_budget: { quick: 4, medium: 2, long: 1 },
    household_size: user?.household_size || 1,
    budget_level: user?.budget_level || 'medium',
    bulk_cook_preference: true,
    meals_per_day: 3,
    variety_mode: planStyle,
    preferred_recipe_ids: preferredRecipeIds,
    avoided_recipe_ids: avoidedRecipeIds,
  });

  const showQuestToast = (message: string) => {
    setQuestToast(message);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setQuestToast(null));
  };

  const animatePlannerStep = (nextStep: PlannerStep) => {
    Animated.sequence([
      Animated.timing(stepContentAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(stepContentAnim, {
        toValue: 0,
        duration: 0,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setPlannerStep(nextStep);
      plannerScrollRef.current?.scrollTo({ y: 0, animated: false });
      Animated.timing(stepContentAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const result = await mealPlanApi.generate({
        preferences: buildPreferencePayload(),
      });
      if (!result?.items?.length) {
        throw new Error('Plan returned with no meals');
      }
      setCurrentPlan(result);
      setPlannerStep('preferences');
      setShortlist([]);
      setPreferredRecipeIds([]);
      setAvoidedRecipeIds([]);
      // Award XP for generating a meal plan
      awardXP(500, 'weekly_meal_plan').then((res) => {
        if (res.xp_gained > 0) {
          showQuestToast(`+${res.xp_gained} XP · Weekly Plan`);
        }
      });
      if (plannerMode) {
        router.back();
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to generate meal plan. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleLoadShortlist = async () => {
    setShortlistLoading(true);
    setError('');
    try {
      const result = await mealPlanApi.shortlist({
        preferences: buildPreferencePayload(),
      });
      setShortlist(result?.sections || []);
      animatePlannerStep('shortlist');
    } catch (err: any) {
      setError(err?.message || 'Unable to load meal picks. Please try again.');
    } finally {
      setShortlistLoading(false);
    }
  };

  const toggleShortlistSelection = (recipeId: string, mode: 'include' | 'avoid') => {
    if (mode === 'include') {
      setPreferredRecipeIds((prev) =>
        prev.includes(recipeId) ? prev.filter((id) => id !== recipeId) : [...prev, recipeId]
      );
      setAvoidedRecipeIds((prev) => prev.filter((id) => id !== recipeId));
      return;
    }
    setAvoidedRecipeIds((prev) =>
      prev.includes(recipeId) ? prev.filter((id) => id !== recipeId) : [...prev, recipeId]
    );
    setPreferredRecipeIds((prev) => prev.filter((id) => id !== recipeId));
  };

  const openReplaceModal = async (meal: any) => {
    setReplaceMeal(meal);
    setReplacementLoading(true);
    setReplacementOptions([]);
    try {
      const result = await mealPlanApi.getAlternatives(meal.id);
      setReplacementOptions(result?.options || []);
    } catch (err: any) {
      Alert.alert('Unable to load replacements', err?.message || 'Please try again.');
      setReplaceMeal(null);
    } finally {
      setReplacementLoading(false);
    }
  };

  const handleReplaceMeal = async (itemId: string, recipeId: string) => {
    setReplacingRecipeId(recipeId);
    try {
      const plan = await mealPlanApi.replaceMeal(itemId, recipeId);
      setCurrentPlan(plan);
      setReplaceMeal(null);
      setReplacementOptions([]);
    } catch (err: any) {
      Alert.alert('Unable to replace meal', err?.message || 'Please try again.');
    } finally {
      setReplacingRecipeId(null);
    }
  };

  const toggleFlavor = (id: string) => {
    setFlavors((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const toggleDietary = (id: string) => {
    setDietary((prev) => {
      if (id === 'none') {
        return prev.includes('none') ? [] : ['none'];
      }
      const withoutNone = prev.filter((item) => item !== 'none');
      return withoutNone.includes(id)
        ? withoutNone.filter((item) => item !== id)
        : [...withoutNone, id];
    });
  };

  const toggleAllergy = (id: string) => {
    setAllergies((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const todayMeals = currentPlan?.items?.filter((item) => item.day_of_week === selectedDay) || [];

  // Compute projected MES per day from plan (client-side)
  const dayProjections = React.useMemo(() => {
    if (!currentPlan?.items?.length || !mesBudget) return { projections: [], weeklyScore: 0, weeklyTier: 'crash_risk' };
    const projections = DAYS.map((day) => {
      const dayMeals = currentPlan.items.filter((m: any) => m.day_of_week === day);
      const serverScores = dayMeals
        .map((meal: any) => Number(meal.recipe_data?.mes_display_score))
        .filter((score: number) => Number.isFinite(score) && score > 0);

      let displayScore = 0;
      if (serverScores.length === dayMeals.length && serverScores.length > 0) {
        displayScore = serverScores.reduce((sum: number, score: number) => sum + score, 0) / serverScores.length;
      } else {
        let totalProtein = 0, totalFiber = 0, totalSugar = 0;
        dayMeals.forEach((meal: any) => {
          const n = meal.recipe_data?.nutrition_estimate || meal.recipe_data?.nutrition_info || {};
          totalProtein += n.protein || n.protein_g || 0;
          totalFiber += n.fiber || n.fiber_g || 0;
          totalSugar += n.carbs || n.carbs_g || n.sugar || n.sugar_g || 0;
        });
        const pTarget = Math.max(1, mesBudget.protein_target_g);
        const fFloor = Math.max(1, mesBudget.fiber_floor_g);
        const sCeiling = Math.max(1, mesBudget.sugar_ceiling_g);
        const pScore = Math.min(totalProtein / pTarget, 1) * 100;
        const fScore = Math.min(totalFiber / fFloor, 1) * 100;
        const sugarRatio = totalSugar / sCeiling;
        const sScore = Math.max(0, 100 - Math.max(0, (sugarRatio - 1)) * 200);
        const wp = mesBudget.weight_protein || 0.30;
        const wf = mesBudget.weight_fiber || 0.20;
        const ws = mesBudget.weight_sugar || 0.35;
        const total = wp * pScore + wf * fScore + ws * sScore;
        displayScore = total;  // No +10 inflation
      }
      const displayTier = displayScore >= 85 ? 'optimal' : displayScore >= 70 ? 'good' : displayScore >= 55 ? 'moderate' : displayScore >= 40 ? 'low' : 'critical';
      return { day, score: Math.round(displayScore * 10) / 10, tier: displayTier };
    });
    const avgScore = projections.reduce((sum, p) => sum + p.score, 0) / (projections.length || 1);
    const avgTier = avgScore >= 85 ? 'optimal' : avgScore >= 70 ? 'good' : avgScore >= 55 ? 'moderate' : avgScore >= 40 ? 'low' : 'critical';
    return { projections, weeklyScore: Math.round(avgScore * 10) / 10, weeklyTier: avgTier };
  }, [currentPlan, mesBudget]);

  const selectedFlavorLabels = flavors.length ? flavors.map((id) => FLAVOR_LABELS[id] || id) : ['Any Flavor'];
  const selectedDietaryLabels = dietary.length
    ? dietary.map((id) => DIETARY_LABELS[id] || id)
    : ['No Restrictions'];
  const selectedAllergyLabels = allergies.length
    ? allergies.map((id) => ALLERGY_LABELS[id] || id)
    : ['None Added'];
  const prepTimeline = currentPlan?.prep_timeline || [];

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

  if (plannerMode) {
    const plannerTranslateY = plannerEnterAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [10, 0],
    });
    const stepTranslateX = stepContentAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [10, 0],
    });
    return (
      <ScreenContainer safeArea={false}>
        <Animated.View
          style={[
            styles.plannerShell,
            {
              backgroundColor: '#FCFCFA',
              opacity: plannerEnterAnim,
              transform: [{ translateY: plannerTranslateY }],
            },
          ]}
        >
          <ScrollView
            ref={plannerScrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scroll,
              { paddingTop: Math.max(insets.top, 10), paddingBottom: createPlanBottomPadding },
            ]}
          >
            <View style={styles.plannerContent}>
            <View style={styles.plannerHeaderRow}>
              <TouchableOpacity
                onPress={() => {
                  if (plannerStep === 'shortlist') {
                    animatePlannerStep('preferences');
                    return;
                  }
                  router.back();
                }}
                style={styles.plannerHeaderIconButton}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={plannerStep === 'shortlist' ? 'chevron-back' : 'close'}
                  size={30}
                  color={theme.text}
                />
              </TouchableOpacity>
              <Text style={[styles.plannerHeaderTitle, { color: theme.text }]}>Meal Plan</Text>
              <View style={styles.plannerHeaderIconSpacer} />
            </View>
            <View style={styles.plannerTop}>
              <View style={styles.stepBadgeRow}>
                <View style={[styles.stepBadge, { backgroundColor: theme.primaryMuted }]}>
                  <Text style={[styles.stepBadgeText, { color: theme.primary }]}>
                    Step {plannerStep === 'preferences' ? '1' : '2'} of 2
                  </Text>
                </View>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: theme.primary, width: plannerStep === 'preferences' ? '50%' : '100%' },
                  ]}
                />
              </View>

              <Text style={[styles.title, { color: theme.text }]}>
                {plannerStep === 'preferences' ? 'Build your week' : 'Pick meals for your week'}
              </Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                {plannerStep === 'preferences'
                  ? "Tell us your preferences and we'll build a personalized week of whole-food meals."
                  : 'Include the meals you want to see and avoid the ones you do not want in this week.'}
              </Text>
            </View>

            <Animated.View
              style={{
                opacity: stepContentAnim,
                transform: [{ translateX: stepTranslateX }],
              }}
            >
            {plannerStep === 'preferences' ? (
              <>
                <View style={styles.preferenceStack}>
                  <View
                    style={[
                      styles.preferenceCard,
                      {
                        backgroundColor: PLANNER_CARD_BG,
                        borderColor: PLANNER_BORDER,
                      },
                    ]}
                  >
                    <View style={styles.preferenceHeaderRow}>
                      <View>
                        <Text style={[styles.preferenceTitle, { color: theme.text }]}>Flavor Preferences</Text>
                        <Text style={[styles.preferenceSubtitle, { color: theme.textSecondary }]}>
                          {selectedFlavorLabels.length} selected
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setExpandedEditor((current) => (current === 'flavors' ? null : 'flavors'))}
                        style={[styles.preferenceEditButton, { backgroundColor: theme.primaryMuted }]}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.preferenceEditText, { color: theme.primary }]}>
                          {expandedEditor === 'flavors' ? 'Done' : 'Edit'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {expandedEditor === 'flavors' ? (
                      <ChipSelector
                        options={FLAVOR_OPTIONS}
                        selected={flavors}
                        onToggle={toggleFlavor}
                      />
                    ) : (
                      <View style={styles.summaryChipWrap}>
                        {selectedFlavorLabels.map((label) => (
                          <View key={label} style={[styles.summaryChip, { backgroundColor: theme.primaryMuted }]}>
                            <Text style={[styles.summaryChipText, { color: theme.primary }]}>{label}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  <View
                    style={[
                      styles.preferenceCard,
                      {
                        backgroundColor: PLANNER_CARD_BG,
                        borderColor: PLANNER_BORDER,
                      },
                    ]}
                  >
                    <View style={styles.preferenceHeaderRow}>
                      <View>
                        <Text style={[styles.preferenceTitle, { color: theme.text }]}>Dietary Restrictions</Text>
                        <Text style={[styles.preferenceSubtitle, { color: theme.textSecondary }]}>
                          {selectedDietaryLabels.join(' • ')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setExpandedEditor((current) => (current === 'dietary' ? null : 'dietary'))}
                        style={[styles.preferenceEditButton, { backgroundColor: theme.primaryMuted }]}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.preferenceEditText, { color: theme.primary }]}>
                          {expandedEditor === 'dietary' ? 'Done' : 'Edit'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {expandedEditor === 'dietary' ? (
                      <ChipSelector
                        options={DIETARY_OPTIONS}
                        selected={dietary}
                        onToggle={toggleDietary}
                      />
                    ) : (
                      <View style={styles.summaryChipWrap}>
                        {selectedDietaryLabels.map((label) => (
                          <View key={label} style={[styles.summaryChip, { backgroundColor: theme.primaryMuted }]}>
                            <Text style={[styles.summaryChipText, { color: theme.primary }]}>{label}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  <View
                    style={[
                      styles.preferenceCard,
                      {
                        backgroundColor: PLANNER_CARD_BG,
                        borderColor: PLANNER_BORDER,
                      },
                    ]}
                  >
                    <View style={styles.preferenceHeaderRow}>
                      <View>
                        <Text style={[styles.preferenceTitle, { color: theme.text }]}>Allergies</Text>
                        <Text style={[styles.preferenceSubtitle, { color: theme.textSecondary }]}>
                          {allergies.length ? `${allergies.length} protected` : 'No allergies added'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setExpandedEditor((current) => (current === 'allergies' ? null : 'allergies'))}
                        style={[styles.preferenceEditButton, { backgroundColor: theme.primaryMuted }]}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.preferenceEditText, { color: theme.primary }]}>
                          {expandedEditor === 'allergies' ? 'Done' : 'Edit'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {expandedEditor === 'allergies' ? (
                      <ChipSelector
                        options={ALLERGY_OPTIONS}
                        selected={allergies}
                        onToggle={toggleAllergy}
                      />
                    ) : (
                      <View style={styles.summaryChipWrap}>
                        {selectedAllergyLabels.map((label) => (
                          <View
                            key={label}
                            style={[
                              styles.summaryChip,
                              {
                                backgroundColor: allergies.length ? 'rgba(245,158,11,0.12)' : PLANNER_SUBTLE_BG,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.summaryChipText,
                                { color: allergies.length ? theme.warning : theme.textSecondary },
                              ]}
                            >
                              {label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.planStyleSection}>
                  <Text style={[styles.sectionLabel, { color: theme.text }]}>Plan Style</Text>
                  <View style={styles.planStyleGrid}>
                    {PLAN_STYLE_OPTIONS.map((option) => {
                      const selected = option.id === planStyle;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          activeOpacity={0.8}
                          onPress={() => setPlanStyle(option.id)}
                          style={[
                            styles.planStyleCard,
                            {
                              backgroundColor: selected ? theme.primaryMuted : PLANNER_CARD_BG,
                              borderColor: selected ? theme.primary : PLANNER_BORDER,
                            },
                          ]}
                        >
                          <View style={[styles.planStyleIcon, { backgroundColor: selected ? '#FFFFFF' : PLANNER_SUBTLE_BG }]}>
                            <Ionicons name={option.icon} size={18} color={theme.primary} />
                          </View>
                          <Text style={[styles.planStyleTitle, { color: theme.text }]}>{option.title}</Text>
                          <Text style={[styles.planStyleSubtitle, { color: theme.textSecondary }]}>{option.subtitle}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.shortlistSection}>
                {shortlist.map((section) => (
                  <View key={section.meal_type} style={styles.shortlistGroup}>
                    <Text style={[styles.shortlistGroupLabel, { color: theme.text }]}>
                      {section.meal_type.charAt(0).toUpperCase() + section.meal_type.slice(1)}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortlistCardsRow}>
                      {section.items.map((item) => {
                        const included = preferredRecipeIds.includes(item.id);
                        const avoided = avoidedRecipeIds.includes(item.id);
                        const tierColor = getTierConfig(item.mes_display_tier || 'critical').color;
                        return (
                          <View
                            key={item.id}
                            style={[
                              styles.shortlistCard,
                              {
                                backgroundColor: PLANNER_CARD_BG,
                                borderColor: included ? theme.primary : avoided ? theme.warning : PLANNER_BORDER,
                              },
                            ]}
                          >
                            <View style={styles.shortlistCardTop}>
                              <Text style={[styles.shortlistCardTitle, { color: theme.text }]} numberOfLines={2}>
                                {item.title}
                              </Text>
                              <View style={[styles.shortlistScoreRing, { borderColor: tierColor + '50', backgroundColor: tierColor + '10' }]}>
                                <Text style={[styles.shortlistScoreText, { color: tierColor }]}>{Math.round(item.mes_display_score || 0)}</Text>
                              </View>
                            </View>
                            <Text style={[styles.shortlistCardMeta, { color: theme.textSecondary }]}>
                              {item.total_time_min || 0} min • {item.difficulty || 'easy'}
                            </Text>
                            {!!item.description && (
                              <Text style={[styles.shortlistCardDescription, { color: theme.textSecondary }]} numberOfLines={3}>
                                {cleanRecipeDescription(item.description)}
                              </Text>
                            )}
                            <View style={styles.shortlistActionRow}>
                              <TouchableOpacity
                                onPress={() => toggleShortlistSelection(item.id, 'include')}
                                style={[
                                  styles.shortlistAction,
                                  { backgroundColor: included ? theme.primaryMuted : PLANNER_SUBTLE_BG, borderColor: included ? theme.primary : PLANNER_BORDER },
                                ]}
                              >
                                <Text style={[styles.shortlistActionText, { color: included ? theme.primary : theme.textSecondary }]}>
                                  {included ? 'Included' : 'Include'}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => toggleShortlistSelection(item.id, 'avoid')}
                                style={[
                                  styles.shortlistAction,
                                  { backgroundColor: avoided ? 'rgba(245,158,11,0.14)' : PLANNER_SUBTLE_BG, borderColor: avoided ? theme.warning : PLANNER_BORDER },
                                ]}
                              >
                                <Text style={[styles.shortlistActionText, { color: avoided ? theme.warning : theme.textSecondary }]}>
                                  {avoided ? 'Avoiding' : 'Avoid'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                ))}
              </View>
            )}
            </Animated.View>

            {error ? (
              <View style={{ backgroundColor: theme.errorMuted, borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <Ionicons name="alert-circle" size={20} color={theme.error} />
                <Text style={{ color: theme.error, fontSize: FontSize.sm, flex: 1 }}>{error}</Text>
              </View>
            ) : null}
            {plannerStep === 'preferences' ? (
              <View style={styles.simpleStepAction}>
                <Button
                  title={shortlistLoading ? 'Loading meal picks...' : 'Continue'}
                  onPress={handleLoadShortlist}
                  loading={shortlistLoading}
                  fullWidth
                  size="lg"
                />
              </View>
            ) : (
              <View style={[styles.inlineCtaCard, { backgroundColor: PLANNER_CARD_BG, borderColor: PLANNER_BORDER }]}>
                <View style={styles.inlineCtaHeader}>
                  <View style={styles.inlineCtaCopy}>
                    <Text style={[styles.inlineCtaEyebrow, { color: theme.primary }]}>Weekly Plan Builder</Text>
                    <Text style={[styles.inlineCtaHeadline, { color: theme.text }]}>
                      Lock in your picks and generate the week
                    </Text>
                  </View>
                  <View style={[styles.inlineCtaSpark, { backgroundColor: theme.primaryMuted }]}>
                    <Ionicons name="sparkles" size={16} color={theme.primary} />
                  </View>
                </View>

                <View style={styles.inlineCtaMetrics}>
                  <View style={[styles.inlineCtaPill, { backgroundColor: PLANNER_SUBTLE_BG }]}>
                    <Ionicons name="flash" size={13} color={theme.primary} />
                    <Text style={[styles.inlineCtaPillText, { color: theme.textSecondary }]}>70+ MES target</Text>
                  </View>
                  <View style={[styles.inlineCtaPill, { backgroundColor: PLANNER_SUBTLE_BG }]}>
                    <Ionicons name="restaurant-outline" size={13} color={theme.primary} />
                    <Text style={[styles.inlineCtaPillText, { color: theme.textSecondary }]}>
                      {planStyle === 'prep_heavy' ? 'Meal prep' : planStyle === 'balanced' ? 'Balanced week' : 'More variety'}
                    </Text>
                  </View>
                </View>

                <Button
                  title={isGenerating ? 'Generating...' : 'Generate Meal Plan'}
                  onPress={handleGenerate}
                  loading={isGenerating}
                  fullWidth
                  size="lg"
                />
              </View>
            )}
            </View>
          </ScrollView>
        </Animated.View>
      </ScreenContainer>
    );
  }

  if (!currentPlan) {
    return (
      <ScreenContainer safeArea={false}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: ctaBottomOffset + Spacing.xl }]}
        >
          <View style={styles.planHeader}>
            <View>
              <Text style={[styles.title, { color: theme.text, marginBottom: 0 }]}>Meal Plan</Text>
              <Text style={[styles.planDate, { color: theme.textSecondary }]}>Build your first week of meals</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Button title="New Plan" variant="outline" size="sm" onPress={() => router.push('/meal-plan-builder' as any)} />
            </View>
          </View>

          <Card
            style={[styles.emptyPlanCard, { borderColor: theme.border, backgroundColor: theme.surface }]}
            padding={Spacing.xl}
          >
            <View style={[styles.emptyPlanIcon, { backgroundColor: theme.primaryMuted }]}>
              <Ionicons name="calendar-outline" size={24} color={theme.primary} />
            </View>
            <Text style={[styles.emptyPlanTitle, { color: theme.text }]}>No meal plan yet</Text>
            <Text style={[styles.emptyPlanText, { color: theme.textSecondary }]}>
              Create a week with low-carb breakfasts, higher-MES lunches and dinners, and built-in prep guidance.
            </Text>
            <Button title="Create Meal Plan" onPress={() => router.push('/meal-plan-builder' as any)} fullWidth size="lg" />
          </Card>
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
        contentContainerStyle={[styles.scroll, { paddingBottom: ctaBottomOffset + Spacing.xl }]}
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
            <Button
              title="New Plan"
              variant="outline"
              size="sm"
              onPress={() => router.push('/meal-plan-builder' as any)}
            />
          </View>
        </View>

        {/* Day Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
          <View style={styles.dayRow}>
            {DAYS.map((day, index) => {
              const isSelected = day === selectedDay;
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
                      style={[styles.dayBtnInner, styles.dayBtnInnerActive]}
                    >
                      <Text style={styles.dayBtnTextActive}>{DAY_SHORT[index]}</Text>
                    </LinearGradient>
                  ) : (
                    <View
                      style={[
                        styles.dayBtnInner,
                        {
                          backgroundColor: '#FFFFFF',
                          borderColor: theme.border,
                          shadowColor: '#0F172A',
                        },
                      ]}
                    >
                      <Text style={[styles.dayBtnText, { color: theme.textSecondary }]}>
                        {DAY_SHORT[index]}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {prepTimeline.length > 0 ? (
          <View style={styles.prepTimelineSection}>
            <Text style={[styles.sectionLabel, { color: theme.text }]}>Prep Timeline</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.prepTimelineRow}>
              {prepTimeline.map((entry) => (
                <View
                  key={entry.prep_group_id}
                  style={[
                    styles.prepTimelineCard,
                    {
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.prepTimelineDay, { color: theme.primary }]}>{entry.prep_day}</Text>
                  <Text style={[styles.prepTimelineTitle, { color: theme.text }]} numberOfLines={2}>
                    {entry.recipe_title}
                  </Text>
                  <Text style={[styles.prepTimelineSummary, { color: theme.textSecondary }]} numberOfLines={2}>
                    {entry.summary_text}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Projected MES Card */}
        {dayProjections.projections.length > 0 && (
          <View style={{ marginBottom: Spacing.md }}>
            <ProjectedMESCard
              weeklyScore={dayProjections.weeklyScore}
              weeklyTier={dayProjections.weeklyTier}
              dayProjections={dayProjections.projections}
            />
          </View>
        )}

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
            const mesScore = Number(recipe.mes_display_score || 0);
            const totalMinutes = (recipe.prep_time_min || 0) + (recipe.cook_time_min || 0);
            const prepStatus = recipe.prep_status;
            const mesTier =
              mesScore >= 85 ? 'optimal' :
              mesScore >= 70 ? 'good' :
              mesScore >= 55 ? 'moderate' :
              mesScore >= 40 ? 'low' :
              'critical';
            const mesTierColor = getTierConfig(mesTier).color;
            return (
              <Card 
                key={index}
                style={[styles.mealCard, { borderColor: theme.border, backgroundColor: theme.surface }]} 
                padding={Spacing.lg}
                onPress={() => recipeId && router.push(`/browse/${recipeId}`)}
              >
                <View style={styles.mealTopRow}>
                  <Text style={[styles.mealType, { color: theme.textTertiary }]}>
                    {meal.meal_type.charAt(0).toUpperCase() + meal.meal_type.slice(1)}
                  </Text>
                  {mesScore > 0 ? (
                    <View
                      style={[
                        styles.scoreRing,
                        {
                          borderColor: mesTierColor + '55',
                          backgroundColor: mesTierColor + '08',
                        },
                      ]}
                    >
                      <Text style={[styles.scoreRingText, { color: mesTierColor }]}>
                        {Math.round(mesScore)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.mealHeader}>
                  <View style={styles.mealHeaderLeft}>
                    <Text style={[styles.mealName, { color: theme.text }]} numberOfLines={2}>
                      {recipe.title || 'Meal'}
                    </Text>
                  </View>
                </View>
                  {cleanRecipeDescription(recipe.description) && (
                    <Text style={[styles.mealDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                      {cleanRecipeDescription(recipe.description)}
                    </Text>
                  )}

                <View style={[styles.metaStrip, { backgroundColor: '#FFFFFF', borderColor: theme.border }]}>
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
                    style={[styles.logBtn, { backgroundColor: theme.infoMuted, borderColor: theme.info + '22' }]}
                  >
                    <Ionicons name="add" size={13} color={theme.info} />
                  </TouchableOpacity>

                  {prepStatus ? (
                    <View
                      style={[
                        styles.categoryBadge,
                        {
                          backgroundColor: prepStatus === 'reheat' ? theme.surfaceHighlight : theme.primaryMuted,
                          borderColor: prepStatus === 'reheat' ? theme.border : theme.primary + '20',
                        },
                      ]}
                    >
                      <View style={[styles.categoryBadgeDot, { backgroundColor: prepStatus === 'reheat' ? theme.textSecondary : theme.primary }]} />
                      <Text style={[styles.categoryText, { color: prepStatus === 'reheat' ? theme.textSecondary : theme.primary }]}>
                        {prepStatus === 'reheat' ? 'Reheat' : 'Prepped'}
                      </Text>
                    </View>
                  ) : null}

                  <View style={[styles.categoryBadge, { backgroundColor: cat.bg, borderColor: cat.text + '18' }]}>
                    <View style={[styles.categoryBadgeDot, { backgroundColor: cat.text }]} />
                    <Text style={[styles.categoryText, { color: cat.text }]}>{cat.label}</Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => openReplaceModal(meal)}
                    style={[styles.replaceBtn, { backgroundColor: theme.surfaceHighlight, borderColor: theme.border }]}
                  >
                    <Ionicons name="swap-horizontal" size={13} color={theme.textSecondary} />
                    <Text style={[styles.replaceBtnText, { color: theme.textSecondary }]}>Replace</Text>
                  </TouchableOpacity>

                  {totalMinutes > 0 ? (
                    <View style={styles.metaPill}>
                      <Ionicons name="time-outline" size={14} color={theme.textTertiary} />
                      <Text style={[styles.metaPillText, { color: theme.textTertiary }]}>
                        {totalMinutes} min
                      </Text>
                    </View>
                  ) : null}

                  {recipe.difficulty ? (
                    <View style={styles.metaPill}>
                      <Ionicons name="sparkles-outline" size={13} color={theme.textTertiary} />
                      <Text style={[styles.metaPillText, { color: theme.textTertiary }]}>
                        {recipe.difficulty}
                      </Text>
                    </View>
                  ) : null}

                  {meal.is_bulk_cook ? (
                    <View style={styles.metaPill}>
                      <Ionicons name="layers-outline" size={13} color={theme.info} />
                      <Text style={[styles.metaPillText, { color: theme.info }]}>
                        {meal.servings} servings
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            );
          })
        )}
        <View style={{ height: Spacing.huge }} />
      </ScrollView>

      <Modal
        visible={!!replaceMeal}
        transparent
        animationType="slide"
        onRequestClose={() => setReplaceMeal(null)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalDismissArea} activeOpacity={1} onPress={() => setReplaceMeal(null)} />
          <View style={[styles.replaceSheet, { backgroundColor: theme.surface }]}>
            <View style={styles.replaceSheetHandle} />
            <View style={styles.replaceSheetHeader}>
              <View>
                <Text style={[styles.replaceSheetTitle, { color: theme.text }]}>Replace meal</Text>
                <Text style={[styles.replaceSheetSubtitle, { color: theme.textSecondary }]}>
                  Pick a better fit for this slot without rebuilding the week.
                </Text>
              </View>
            </View>
            {replacementLoading ? (
              <View style={styles.replaceSheetLoading}>
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.replaceOptions}>
                {replacementOptions.map((option) => {
                  const tierColor = getTierConfig(option.mes_display_tier || 'critical').color;
                  return (
                    <TouchableOpacity
                      key={option.recipe_id}
                      activeOpacity={0.85}
                      disabled={replacingRecipeId === option.recipe_id}
                      onPress={() => replaceMeal && handleReplaceMeal(replaceMeal.id, option.recipe_id)}
                      style={[styles.replaceOptionCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                    >
                      <View style={styles.replaceOptionTop}>
                        <Text style={[styles.replaceOptionTitle, { color: theme.text }]} numberOfLines={2}>
                          {option.title}
                        </Text>
                        <View style={[styles.shortlistScoreRing, { borderColor: tierColor + '50', backgroundColor: tierColor + '10' }]}>
                          <Text style={[styles.shortlistScoreText, { color: tierColor }]}>{Math.round(option.mes_display_score || 0)}</Text>
                        </View>
                      </View>
                      <Text style={[styles.replaceOptionMeta, { color: theme.textSecondary }]}>
                        {option.total_time_min || 0} min • {option.difficulty || 'easy'}
                      </Text>
                      {!!option.description && (
                        <Text style={[styles.replaceOptionDescription, { color: theme.textSecondary }]} numberOfLines={2}>
                          {cleanRecipeDescription(option.description)}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  plannerShell: {
    flex: 1,
  },
  scroll: {
    paddingTop: Spacing.lg,
  },
  plannerContent: {
    paddingHorizontal: Spacing.lg,
  },
  plannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: 0,
    marginBottom: Spacing.md,
  },
  plannerHeaderIconButton: {
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plannerHeaderIconSpacer: {
    width: 38,
    height: 44,
  },
  plannerHeaderTitle: {
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  plannerTop: {
    marginBottom: Spacing.lg,
  },
  stepBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  stepBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
  },
  stepBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  inlineBackLink: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  inlineBackLinkText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: '#ECE9E2',
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  progressFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.md,
    lineHeight: 22,
    marginBottom: Spacing.sm,
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
  emptyPlanCard: {
    borderWidth: 1,
    borderRadius: 24,
    alignItems: 'center',
  },
  emptyPlanIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyPlanTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  emptyPlanText: {
    fontSize: FontSize.sm,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  planStyleSection: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  planStyleGrid: {
    gap: Spacing.sm,
  },
  planStyleCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.md,
  },
  planStyleIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  planStyleTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  planStyleSubtitle: {
    marginTop: 4,
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  preferenceStack: {
    gap: Spacing.sm + 2,
    marginBottom: Spacing.sm,
  },
  preferenceCard: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  preferenceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  preferenceTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  preferenceSubtitle: {
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  preferenceEditButton: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 5,
  },
  preferenceEditText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  summaryChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  summaryChip: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
  },
  summaryChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  shortlistSection: {
    marginTop: 0,
  },
  shortlistSubtitle: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    maxWidth: 260,
  },
  shortlistGroup: {
    marginTop: Spacing.md,
  },
  shortlistGroupLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  shortlistCardsRow: {
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
  },
  shortlistCard: {
    width: 228,
    borderRadius: 22,
    borderWidth: 1,
    padding: Spacing.md,
  },
  shortlistCardTop: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  shortlistCardTitle: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    lineHeight: 22,
  },
  shortlistScoreRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  shortlistScoreText: {
    fontSize: 11,
    fontWeight: '800',
  },
  shortlistCardMeta: {
    marginTop: Spacing.xs,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  shortlistCardDescription: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    lineHeight: 20,
    minHeight: 60,
  },
  shortlistActionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  shortlistAction: {
    flex: 1,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingVertical: 9,
    alignItems: 'center',
  },
  shortlistActionText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  inlineCtaCard: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: 24,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  simpleStepAction: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  inlineCtaHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  inlineCtaCopy: {
    flex: 1,
  },
  inlineCtaEyebrow: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  inlineCtaHeadline: {
    marginTop: 4,
    fontSize: FontSize.md,
    fontWeight: '700',
    lineHeight: 22,
  },
  inlineCtaSpark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineCtaMetrics: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  inlineCtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 7,
  },
  inlineCtaPillText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
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
  prepTimelineSection: {
    marginBottom: Spacing.md,
  },
  prepTimelineRow: {
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
  },
  prepTimelineCard: {
    width: 230,
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.md,
  },
  prepTimelineDay: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  prepTimelineTitle: {
    marginTop: 6,
    fontSize: FontSize.sm,
    fontWeight: '700',
    lineHeight: 20,
  },
  prepTimelineSummary: {
    marginTop: 6,
    fontSize: FontSize.xs,
    lineHeight: 18,
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  dayBtnInnerActive: {
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
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
    borderWidth: 1,
    borderRadius: 24,
  },
  mealTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  scoreRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scoreRingText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  mealHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  mealType: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  mealName: {
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    flexShrink: 0,
    borderWidth: 1,
  },
  categoryBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  categoryText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textAlign: 'center',
  },
  mealDesc: {
    fontSize: FontSize.sm,
    lineHeight: 21,
    marginTop: Spacing.md,
  },
  metaStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Spacing.md,
    padding: 10,
    borderRadius: 18,
    borderWidth: 1,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  logBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  metaPillText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  replaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  replaceBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.18)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  replaceSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    maxHeight: '70%',
  },
  replaceSheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(148,163,184,0.5)',
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  replaceSheetHeader: {
    marginBottom: Spacing.md,
  },
  replaceSheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  replaceSheetSubtitle: {
    marginTop: 4,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  replaceSheetLoading: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  replaceOptions: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  replaceOptionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.md,
  },
  replaceOptionTop: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  replaceOptionTitle: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    lineHeight: 22,
  },
  replaceOptionMeta: {
    marginTop: Spacing.xs,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  replaceOptionDescription: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
