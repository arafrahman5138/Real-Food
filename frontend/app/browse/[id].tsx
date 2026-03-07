import React, { useEffect, useState, useRef } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Pressable,
  Animated,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import LogoHeader from '../../components/LogoHeader';
import { ChronometerSuccessModal } from '../../components/ChronometerSuccessModal';
import { nutritionApi, recipeApi, metabolicApi, gameApi } from '../../services/api';
import { useSavedRecipesStore } from '../../stores/savedRecipesStore';
import { usePlateStore } from '../../stores/plateStore';
import { MetabolicRing } from '../../components/MetabolicRing';
import { MealMESBadge } from '../../components/MealMESBadge';
import { getTierConfig } from '../../stores/metabolicBudgetStore';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';
import { HEALTH_BENEFIT_OPTIONS } from '../../constants/Config';
import { cleanRecipeDescription } from '../../utils/recipeDescription';


interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
  category?: string;
}

interface ComponentDetail {
  id: string;
  title: string;
  recipe_role: string;
  steps: string[];
  ingredients: Ingredient[];
}

interface RecipeDetail {
  id: string;
  title: string;
  description: string;
  cuisine: string;
  ingredients: Ingredient[];
  steps: string[];
  prep_time_min: number;
  cook_time_min: number;
  total_time_min: number;
  servings: number;
  difficulty: string;
  nutrition_info: Record<string, number>;
  flavor_profile: string[];
  dietary_tags: string[];
  health_benefits: string[];
  tags: string[];
  // Composition fields
  recipe_role?: string;
  is_component?: boolean;
  default_pairing_ids?: string[];
  needs_default_pairing?: boolean | null;
  is_mes_scoreable?: boolean;
  components?: ComponentDetail[];
  component_composition?: Record<string, any> | null;
}

interface PairingSuggestion {
  recipe_id: string;
  title: string;
  recipe_role: string;
  cuisine: string;
  total_time_min: number;
  nutrition_info: Record<string, number>;
  combined_mes_score: number;
  combined_display_score: number;
  combined_tier: string;
  mes_delta: number;
  is_default_pairing: boolean;
}

interface MESPreviewResult {
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

const MACRO_COLORS = {
  protein: '#22C55E',
  carbs: '#3B82F6',
  fat: '#F59E0B',
  fiber: '#8B5CF6',
};

const INGREDIENT_CATEGORIES: Record<string, { label: string; icon: string; color: string; order: number }> = {
  protein: { label: 'Protein', icon: 'fish-outline', color: '#EF4444', order: 0 },
  produce: { label: 'Produce', icon: 'leaf-outline', color: '#22C55E', order: 1 },
  dairy:   { label: 'Dairy', icon: 'water-outline', color: '#3B82F6', order: 2 },
  grains:  { label: 'Grains', icon: 'nutrition-outline', color: '#F59E0B', order: 3 },
  fats:    { label: 'Fats & Oils', icon: 'flask-outline', color: '#A855F7', order: 4 },
  spices:  { label: 'Spices & Seasonings', icon: 'flame-outline', color: '#F97316', order: 5 },
  sweetener: { label: 'Sweeteners', icon: 'cafe-outline', color: '#EC4899', order: 6 },
  other:   { label: 'Other', icon: 'cube-outline', color: '#6B7280', order: 7 },
};

const ROLE_BADGE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  full_meal:    { label: 'Meal',    icon: 'restaurant-outline', color: '#2563EB', bg: '#DBEAFE' },
  protein_base: { label: 'Protein', icon: 'flame-outline',    color: '#DC2626', bg: '#FEE2E2' },
  carb_base:    { label: 'Carb',    icon: 'nutrition-outline', color: '#D97706', bg: '#FEF3C7' },
  veg_side:     { label: 'Veggie',  icon: 'leaf-outline',      color: '#16A34A', bg: '#DCFCE7' },
  sauce:        { label: 'Sauce',   icon: 'water-outline',     color: '#7C3AED', bg: '#EDE9FE' },
  dessert:      { label: 'Dessert', icon: 'ice-cream-outline', color: '#DB2777', bg: '#FCE7F3' },
  default:      { label: 'Item',    icon: 'cube-outline',      color: '#6B7280', bg: '#F3F4F6' },
};

const DEFAULT_SERVINGS_OVERRIDES: Record<string, number> = {
  'greek yogurt chia protein bowl': 4,
};

const tierFromDisplayScore = (score: number): string => {
  if (score >= 80) return 'optimal';
  if (score >= 60) return 'stable';
  if (score >= 40) return 'shaky';
  return 'crash_risk';
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getDefaultServings = (recipe: Pick<RecipeDetail, 'title' | 'servings'> | null | undefined): number => {
  if (!recipe) return 1;
  const override = DEFAULT_SERVINGS_OVERRIDES[recipe.title.trim().toLowerCase()];
  if (override && override > 0) return override;
  return recipe.servings && recipe.servings > 0 ? recipe.servings : 1;
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingMeal, setLoggingMeal] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);
  const [successModal, setSuccessModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [popoverServings, setPopoverServings] = useState(1);
  const [collapsedComponents, setCollapsedComponents] = useState<Set<string>>(new Set());
  const [servings, setServings] = useState(1);
  const [showServingsHint, setShowServingsHint] = useState(true);
  const hintOpacity = useRef(new Animated.Value(1)).current;
  const menuFade = useRef(new Animated.Value(0)).current;
  const { isSaved, saveRecipe, removeRecipe } = useSavedRecipesStore();
  const saved = id ? isSaved(id) : false;
  const addToPlate = usePlateStore((s) => s.addItem);
  const plateItems = usePlateStore((s) => s.items);
  const isOnPlate = id ? plateItems.some((i) => i.id === id) : false;

  // Pairing state
  const [pairings, setPairings] = useState<PairingSuggestion[]>([]);
  const [selectedSide, setSelectedSide] = useState<PairingSuggestion | null>(null);
  const [selectedSideDetail, setSelectedSideDetail] = useState<RecipeDetail | null>(null);
  const [showSwapSheet, setShowSwapSheet] = useState(false);
  const [loadingPairings, setLoadingPairings] = useState(false);
  const [baseMES, setBaseMES] = useState<{ score: number; display: number; tier: string } | null>(null);
  const [mesPreview, setMesPreview] = useState<MESPreviewResult | null>(null);
  const [loadingMesPreview, setLoadingMesPreview] = useState(false);
  const [showMESBreakdown, setShowMESBreakdown] = useState(false);

  const showDefaultPairingForMeal =
    !!recipe && !recipe.is_component && recipe.needs_default_pairing === true;

  useEffect(() => {
    if (id) {
      recipeApi
        .getDetail(id)
        .then((data) => {
          setRecipe(data);
          setServings(getDefaultServings(data));
          // Award XP for browsing a recipe detail (fire-and-forget)
          gameApi.awardXP(5, 'browse_recipe').catch(() => {});
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [id]);

  // Auto-dismiss the servings hint after 4 seconds
  useEffect(() => {
    if (!showServingsHint) return;
    const timer = setTimeout(() => {
      Animated.timing(hintOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
        setShowServingsHint(false);
      });
    }, 4000);
    return () => clearTimeout(timer);
  }, [showServingsHint]);

  // Fetch pairing suggestions for full_meal recipes
  useEffect(() => {
    if (!recipe || !id) return;
    const role = recipe.recipe_role || 'full_meal';
    const isFullMeal = role === 'full_meal' && !recipe.is_component;
    const isComponentRecipe = recipe.is_component;
    const shouldFetchMealPairings = isFullMeal && recipe.needs_default_pairing === true;

    if (shouldFetchMealPairings || isComponentRecipe) {
      setLoadingPairings(true);
      recipeApi
        .getPairingSuggestions(id, 6, shouldFetchMealPairings ? 'veg_side' : undefined)
        .then((data: PairingSuggestion[]) => {
          setPairings(data);
          // Auto-select the default pairing
          const defaultPairing = data.find((p) => p.is_default_pairing);
          if (defaultPairing) setSelectedSide(defaultPairing);

          // Get base MES from the composite preview with just this recipe
          metabolicApi
            .previewCompositeMES([id])
            .then((preview: any) => {
              setBaseMES({
                score: preview.total_score,
                display: preview.display_score,
                tier: preview.tier,
              });
            })
            .catch(() => {});
        })
        .catch(console.error)
        .finally(() => setLoadingPairings(false));
    } else {
      setPairings([]);
      setSelectedSide(null);
      setLoadingPairings(false);
    }
  }, [recipe, id]);

  useEffect(() => {
    if (!selectedSide?.recipe_id) {
      setSelectedSideDetail(null);
      return;
    }
    // If the selected side already exists in expanded component payload,
    // reuse local data and skip an extra detail API request.
    if ((recipe?.components || []).some((c) => c.id === selectedSide.recipe_id)) {
      setSelectedSideDetail(null);
      return;
    }
    let cancelled = false;
    recipeApi
      .getDetail(selectedSide.recipe_id)
      .then((data) => {
        if (!cancelled) setSelectedSideDetail(data);
      })
      .catch(() => {
        if (!cancelled) setSelectedSideDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSide?.recipe_id, recipe?.components]);

  useEffect(() => {
    setCheckedIngredients(new Set());
    setCollapsedCategories(new Set());
  }, [selectedSide?.recipe_id]);

  useEffect(() => {
    const target = recipe;
    const nutrition = target?.nutrition_info as any;
    if (!nutrition) {
      setMesPreview(null);
      return;
    }

    const storedDisplayMes = Number(nutrition.mes_display_score ?? nutrition.mes_score);
    const hasStoredMes = Number.isFinite(storedDisplayMes);
    const hasStoredBreakdown = !!nutrition.mes_breakdown;
    if (hasStoredMes && hasStoredBreakdown) {
      setMesPreview(null);
      setLoadingMesPreview(false);
      return;
    }

    let cancelled = false;
    setLoadingMesPreview(true);
    metabolicApi
      .previewMeal({
        protein_g: nutrition.protein || 0,
        fiber_g: nutrition.fiber || 0,
        carbs_g: nutrition.carbs || 0,
        sugar_g: nutrition.sugar || 0,
        calories: nutrition.calories || 0,
      })
      .then((data: MESPreviewResult) => {
        if (!cancelled) setMesPreview(data);
      })
      .catch(() => {
        if (!cancelled) setMesPreview(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingMesPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    recipe?.id,
    recipe?.nutrition_info?.protein,
    recipe?.nutrition_info?.fiber,
    recipe?.nutrition_info?.carbs,
    recipe?.nutrition_info?.sugar,
    recipe?.nutrition_info?.calories,
  ]);

  const toggleIngredient = (index: number, categoryKey: string, groupIndices: number[]) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      // Auto-collapse when all items in this category are checked
      const allChecked = groupIndices.every((i) => next.has(i));
      if (allChecked) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setCollapsedCategories((p) => new Set(p).add(categoryKey));
      }
      return next;
    });
  };

  const toggleCategory = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getBenefitInfo = (hbId: string) =>
    HEALTH_BENEFIT_OPTIONS.find((h) => h.id === hbId);

  const openPlusMenu = () => {
    setPopoverServings(1);
    setShowPlusMenu(true);
    Animated.timing(menuFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  };

  const closePlusMenu = () => {
    Animated.timing(menuFade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setShowPlusMenu(false);
    });
  };

  const handleLogMeal = async (logServings: number = 1) => {
    closePlusMenu();
    const target = recipe;
    if (!target?.id || loggingMeal) return;
    setLoggingMeal(true);
    try {
      // Generate a group_id if there's a selected veggie side
      const hasSide = !!selectedSide?.recipe_id;
      const groupId = hasSide
        ? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        : undefined;

      // Log the main meal — store the SAME canonical composite display MES shown on this detail page.
      let combinedScore: number | undefined;
      let combinedTier: string | undefined;
      if (hasSide) {
        combinedScore = selectedSide!.combined_display_score ?? selectedSide!.combined_mes_score ?? undefined;
        combinedTier = combinedScore != null
          ? (combinedScore >= 80 ? 'optimal' : combinedScore >= 60 ? 'stable' : combinedScore >= 40 ? 'shaky' : 'crash_risk')
          : undefined;
      }

      await nutritionApi.createLog({
        source_type: 'recipe',
        source_id: target.id,
        meal_type: 'meal',
        servings: logServings,
        quantity: logServings,
        group_id: groupId,
        group_mes_score: combinedScore,
        group_mes_tier: combinedTier,
      });

      // Log the veggie side if one is selected
      if (hasSide && groupId) {
        await nutritionApi.createLog({
          source_type: 'recipe',
          source_id: selectedSide!.recipe_id,
          meal_type: 'meal',
          servings: 1,
          quantity: 1,
          group_id: groupId,
          group_mes_score: combinedScore,
          group_mes_tier: combinedTier,
        });
      }

      setLogSuccess(true);
      setTimeout(() => setLogSuccess(false), 3000);
      const servingsLabel = logServings > 1 ? ` (${logServings} servings)` : '';
      const sideLabel = hasSide ? ` + ${selectedSide!.title}` : '';
      setSuccessModal({
        visible: true,
        message: `"${target.title}"${sideLabel}${servingsLabel} has been added to today's nutrition log.`,
      });
    } catch (e) {
      console.error('Log meal failed', e);
      Alert.alert('Error', 'Failed to log meal. Please try again.');
    } finally {
      setLoggingMeal(false);
    }
  };

  const handleAddToPlate = (fromMenu = false) => {
    if (fromMenu) closePlusMenu();
    const target = recipe;
    if (!target?.id || !target.is_component) return;
    if (isOnPlate) {
      Alert.alert('Already on Plate', `"${target.title}" is already on your plate.`);
      return;
    }
    addToPlate({
      id: target.id,
      title: target.title,
      nutrition: target.nutrition_info || {},
      context: 'component',
    });
    Alert.alert(
      'Added to Plate ✓',
      `"${target.title}" has been added to your plate.`,
      [{ text: 'OK' }],
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.textTertiary} />
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>Recipe not found</Text>
      </View>
    );
  }

  const activeRecipe = recipe;
  const canAddToPlate = !!activeRecipe.is_component;
  const nutrition = activeRecipe.nutrition_info || {};
  const storedDisplayMesRaw = Number((nutrition as any).mes_display_score ?? (nutrition as any).mes_score);
  const hasStoredDisplayMes = Number.isFinite(storedDisplayMesRaw);
  const storedDisplayMes = hasStoredDisplayMes ? storedDisplayMesRaw : null;
  const storedBreakdown = (nutrition as any).mes_breakdown as
    | { protein_score?: number; fiber_score?: number; sugar_score?: number }
    | undefined;

  const mesBaseScore = storedDisplayMes ?? mesPreview?.meal_score.display_score ?? mesPreview?.meal_score.total_score ?? null;
  const mesBreakdown = hasStoredDisplayMes && storedBreakdown
    ? [
        { label: 'Protein', value: Number(storedBreakdown.protein_score || 0), color: '#22C55E' },
        { label: 'Fiber', value: Number(storedBreakdown.fiber_score || 0), color: '#8B5CF6' },
        { label: 'Carbs', value: Number(storedBreakdown.sugar_score || 0), color: '#F59E0B' },
      ]
    : mesPreview
      ? [
          { label: 'Protein', value: mesPreview.meal_score.protein_score, color: '#22C55E' },
          { label: 'Fiber', value: mesPreview.meal_score.fiber_score, color: '#8B5CF6' },
          { label: 'Carbs', value: mesPreview.meal_score.sugar_score, color: '#F59E0B' },
        ]
      : [];
  const baseMesImpactScore = hasStoredDisplayMes ? storedDisplayMes : (baseMES?.score ?? null);
  const selectedSideImpactScore = selectedSide
    ? (selectedSide.combined_display_score ?? selectedSide.combined_mes_score)
    : null;
  const mesDisplayScore = selectedSideImpactScore ?? mesBaseScore;
  const mesTier = mesDisplayScore !== null
    ? tierFromDisplayScore(mesDisplayScore)
    : 'crash_risk';
  const mesTierConfig = getTierConfig(mesTier);
  const baseComponents = activeRecipe.components || [];
  const baseVegComponent = baseComponents.find((component) => component.recipe_role === 'veg_side');
  const replacementVegTitle = selectedSideDetail?.title || selectedSide?.title;
  const canSwapVegComponent =
    !!selectedSide &&
    selectedSide.recipe_role === 'veg_side' &&
    !!baseVegComponent &&
    !!replacementVegTitle;
  const displayedComponents = baseComponents.length > 0
    ? baseComponents.map((component) => {
        if (!canSwapVegComponent || component.recipe_role !== 'veg_side') return component;
        if (selectedSideDetail) {
          return {
            id: selectedSideDetail.id,
            title: selectedSideDetail.title,
            recipe_role: 'veg_side',
            steps: selectedSideDetail.steps || [],
            ingredients: selectedSideDetail.ingredients || [],
          };
        }
        return {
          ...component,
          title: replacementVegTitle || component.title,
        };
      })
    : [];
  const selectedSideComponent = selectedSide
    ? (
        selectedSideDetail
          ? {
              id: selectedSideDetail.id,
              title: selectedSideDetail.title,
              recipe_role: selectedSide.recipe_role,
              steps: selectedSideDetail.steps || [],
              ingredients: selectedSideDetail.ingredients || [],
            }
          : displayedComponents.find((component) => component.id === selectedSide.recipe_id)
            || {
              id: selectedSide.recipe_id,
              title: selectedSide.title,
              recipe_role: selectedSide.recipe_role,
              steps: [],
              ingredients: [],
            }
      )
    : null;
  const hasStructuredComponents =
    displayedComponents.length > 0 &&
    (
      !!activeRecipe.component_composition
      || displayedComponents.some((component) => component.recipe_role !== 'veg_side')
    );
  const pairingSections = showDefaultPairingForMeal && selectedSideComponent && !hasStructuredComponents
    ? [
        {
          id: activeRecipe.id,
          title: activeRecipe.title,
          recipe_role: activeRecipe.recipe_role || 'full_meal',
          steps: activeRecipe.steps || [],
          ingredients: activeRecipe.ingredients || [],
        },
        selectedSideComponent,
      ]
    : [];
  const stepSections = hasStructuredComponents
    ? displayedComponents
    : (pairingSections.length > 0 ? pairingSections : displayedComponents);
  const displayedIngredients = pairingSections.length > 0
    ? pairingSections.flatMap((section) => section.ingredients || [])
    : displayedComponents.length > 0
      ? displayedComponents.flatMap((component) => component.ingredients || [])
      : activeRecipe.ingredients;
  const ingredientGroups = (() => {
    const groups: Record<string, { ing: Ingredient; idx: number }[]> = {};
    displayedIngredients.forEach((ing, idx) => {
      const cat = ing.category && INGREDIENT_CATEGORIES[ing.category] ? ing.category : 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ ing, idx });
    });
    return Object.keys(groups)
      .sort((a, b) => (INGREDIENT_CATEGORIES[a]?.order ?? 99) - (INGREDIENT_CATEGORIES[b]?.order ?? 99))
      .map((catKey) => ({
        catKey,
        catInfo: INGREDIENT_CATEGORIES[catKey] || INGREDIENT_CATEGORIES.other,
        items: groups[catKey],
      }));
  })();
  const assemblyStepRaw = activeRecipe.steps.find((step) => /^assembly:/i.test(step)) || null;
  const displayedAssemblyStep = (() => {
    if (!assemblyStepRaw) return null;
    let text = assemblyStepRaw.replace(/^Assembly:\s*/i, '');
    if (canSwapVegComponent && baseVegComponent?.title && replacementVegTitle) {
      text = text.replace(new RegExp(escapeRegExp(baseVegComponent.title), 'ig'), replacementVegTitle);
    }
    return text;
  })();
  const macros = [
    { label: 'Protein', value: nutrition.protein, unit: 'g', color: MACRO_COLORS.protein },
    { label: 'Carbs', value: nutrition.carbs, unit: 'g', color: MACRO_COLORS.carbs },
    { label: 'Fat', value: nutrition.fat, unit: 'g', color: MACRO_COLORS.fat },
    { label: 'Fiber', value: nutrition.fiber, unit: 'g', color: MACRO_COLORS.fiber },
  ].filter((m) => m.value !== undefined);

  const micronutrients = Object.entries(nutrition)
    .filter(([key]) => key.endsWith('_pct') || key.endsWith('_mg'))
    .map(([key, value]) => {
      const name = key
        .replace('_pct', '')
        .replace('_mg', '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const unit = key.endsWith('_mg') ? 'mg' : '% DV';
      return { name, value, unit };
    })
    .filter((m) => m.value > 0);

  const goodForSummary = activeRecipe.health_benefits
    ?.slice(0, 4)
    .map((hb) => getBenefitInfo(hb)?.label || hb.replace('_', ' '))
    .join(', ');

  return (
    <>
      <ChronometerSuccessModal
        visible={successModal.visible}
        message={successModal.message}
        onPrimary={() => {
          setSuccessModal({ visible: false, message: '' });
          router.push('/(tabs)/chronometer' as any);
        }}
        onSecondary={() => setSuccessModal({ visible: false, message: '' })}
      />
      <Stack.Screen options={{
        headerTitle: () => (
          <View style={styles.navTitleWrap}>
            <LogoHeader />
          </View>
        ),
        headerTitleAlign: 'center',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.background },
        headerLeft: () => (
          <TouchableOpacity
            style={[styles.navBackBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={theme.primary}
              style={styles.navBackIcon}
            />
          </TouchableOpacity>
        ),
        headerRight: () => (
          <View style={[styles.headerActionCapsule, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <TouchableOpacity
              onPress={openPlusMenu}
              activeOpacity={0.7}
              style={[styles.headerIconBtn, { backgroundColor: isOnPlate ? theme.primaryMuted : logSuccess ? theme.primaryMuted : theme.infoMuted }]}
            >
              <Ionicons
                name={isOnPlate ? 'checkmark-circle' : loggingMeal ? 'time-outline' : logSuccess ? 'checkmark-circle' : 'add-circle-outline'}
                size={22}
                color={isOnPlate ? theme.primary : logSuccess ? theme.primary : theme.info}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => (saved ? removeRecipe(id!) : saveRecipe(id!))}
              activeOpacity={0.7}
              style={[styles.headerIconBtn, { backgroundColor: saved ? theme.primaryMuted : theme.surface }]}
            >
              <Ionicons
                name={saved ? 'bookmark' : 'bookmark-outline'}
                size={19}
                color={saved ? theme.primary : theme.textSecondary}
              />
            </TouchableOpacity>
          </View>
        ),
      }} />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.text, flex: 1 }]}>{activeRecipe.title}</Text>
          </View>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {cleanRecipeDescription(activeRecipe.description)}
          </Text>

          {/* Meta Row */}
          <View style={styles.metaRow}>
            {/* Servings — interactive stepper card */}
            <View style={[styles.metaBox, styles.servingsMetaBox, { backgroundColor: theme.primary + '0C', borderColor: theme.primary + '30' }]}>
              <Ionicons name="people-outline" size={18} color={theme.primary} />
              <View style={styles.servingsStepperInline}>
                <TouchableOpacity
                  onPress={() => { setServings((s) => Math.max(1, s - 1)); setShowServingsHint(false); }}
                  hitSlop={8}
                  activeOpacity={0.5}
                >
                  <Ionicons name="remove-circle" size={20} color={servings <= 1 ? theme.textTertiary : theme.primary} />
                </TouchableOpacity>
                <Text style={[styles.metaValue, { color: theme.primary }]}>{servings}</Text>
                <TouchableOpacity
                  onPress={() => { setServings((s) => Math.min(10, s + 1)); setShowServingsHint(false); }}
                  hitSlop={8}
                  activeOpacity={0.5}
                >
                  <Ionicons name="add-circle" size={20} color={theme.primary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.metaLabel, { color: theme.primary }]}>Servings</Text>
              {showServingsHint && (
                <Animated.View style={[styles.servingsHintBubble, { backgroundColor: theme.primary, opacity: hintOpacity }]}>
                  <Ionicons name="layers-outline" size={10} color="#fff" />
                  <Text style={styles.servingsHintText}>Tap to meal prep</Text>
                  <View style={[styles.servingsHintArrow, { borderBottomColor: theme.primary }]} />
                </Animated.View>
              )}
              {servings > (activeRecipe.servings || 1) && !showServingsHint && (
                <View style={[styles.mealPrepBadge, { backgroundColor: theme.primary + '18' }]}>
                  <Ionicons name="layers-outline" size={10} color={theme.primary} />
                  <Text style={{ fontSize: 9, fontWeight: '700', color: theme.primary }}>Meal prep</Text>
                </View>
              )}
            </View>

            <View style={[styles.metaBox, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="time-outline" size={18} color={theme.primary} />
              <Text style={[styles.metaValue, { color: theme.text }]}>{activeRecipe.total_time_min}m</Text>
              <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>Total</Text>
            </View>
            <View style={[styles.metaBox, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="flame-outline" size={18} color={theme.accent} />
              <Text style={[styles.metaValue, { color: theme.text }]}>{nutrition.calories || '-'}</Text>
              <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>Calories</Text>
            </View>
            <View style={[styles.metaBox, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="speedometer-outline" size={18} color={theme.accent} />
              <Text style={[styles.metaValue, { color: theme.text }]}>{activeRecipe.difficulty}</Text>
              <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>Level</Text>
            </View>
          </View>

          {/* Flavor & Dietary Tags */}
          {(activeRecipe.flavor_profile?.length > 0 || activeRecipe.dietary_tags?.length > 0) && (
            <View style={styles.tagRow}>
              {activeRecipe.flavor_profile?.map((f) => (
                <View key={f} style={[styles.tag, { backgroundColor: theme.accentMuted }]}>
                  <Text style={[styles.tagText, { color: theme.accent }]}>{f}</Text>
                </View>
              ))}
              {activeRecipe.dietary_tags?.map((d) => (
                <View key={d} style={[styles.tag, { backgroundColor: theme.infoMuted }]}>
                  <Text style={[styles.tagText, { color: theme.info }]}>{d}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Nutrition Breakdown */}
        {(macros.length > 0 || micronutrients.length > 0) && (
          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Nutrition</Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textTertiary }}>per serving</Text>
            </View>

            {/* Macros */}
            {macros.length > 0 && (
              <View style={styles.macroRow}>
                {macros.map((m) => (
                  <View key={m.label} style={styles.macroItem}>
                    <View style={[styles.macroCircle, { borderColor: m.color }]}>
                      <Text style={[styles.macroValue, { color: m.color }]}>{m.value}</Text>
                      <Text style={[styles.macroUnit, { color: m.color }]}>{m.unit}</Text>
                    </View>
                    <Text style={[styles.macroLabel, { color: theme.textSecondary }]}>{m.label}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Micronutrients */}
            {micronutrients.length > 0 && (
              <View style={styles.microSection}>
                <Text style={[styles.microTitle, { color: theme.textSecondary }]}>
                  Vitamins & Minerals
                </Text>
                {micronutrients.map((m) => (
                  <View key={m.name} style={styles.microRow}>
                    <Text style={[styles.microName, { color: theme.text }]}>{m.name}</Text>
                    <View style={styles.microBarContainer}>
                      <View
                        style={[
                          styles.microBar,
                          {
                            backgroundColor: theme.primary,
                            width: `${Math.min(m.value, 100)}%`,
                          },
                        ]}
                      />
                      <View style={[styles.microBarBg, { backgroundColor: theme.surfaceHighlight }]} />
                    </View>
                    <Text style={[styles.microValue, { color: theme.textSecondary }]}>
                      {m.value}{m.unit}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* MES Score */}
        {loadingMesPreview && mesDisplayScore === null ? (
          <View style={[styles.mesCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : mesDisplayScore !== null ? (
          <TouchableOpacity
            style={[styles.mesCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            activeOpacity={0.75}
            onPress={() => setShowMESBreakdown(true)}
          >
            <View style={styles.mesCardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="analytics-outline" size={16} color={theme.primary} />
                <Text style={[styles.mesCardTitle, { color: theme.text }]}>MES Score</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.mesTapHint, { color: theme.textTertiary }]}>Tap for breakdown</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
              </View>
            </View>
            <View style={styles.mesCardBody}>
              <MetabolicRing
                score={mesDisplayScore}
                tier={mesTier}
                size={62}
                showLabel={false}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.mesTierLabel, { color: mesTierConfig.color }]}>{mesTierConfig.label}</Text>
                <Text style={[styles.mesTierSubtext, { color: theme.textSecondary }]}>Per-meal metabolic energy score</Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* ── Default Pairing Card (full_meal with pairings) ── */}
        {showDefaultPairingForMeal && pairings.length > 0 && (
          <View style={[styles.section, styles.pairingSection, { backgroundColor: theme.surface, borderColor: theme.primary + '30' }]}>
            <View style={styles.pairingSectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 2 }]}>
                  Default Pairing
                </Text>
                <Text style={{ fontSize: FontSize.xs, color: theme.textSecondary, lineHeight: 16 }}>
                  Paired side to boost your MES score
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.swapSideBtn, { backgroundColor: theme.primary + '14', borderColor: theme.primary + '30' }]}
                onPress={() => setShowSwapSheet(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="swap-horizontal" size={14} color={theme.primary} />
                <Text style={[styles.swapSideBtnText, { color: theme.primary }]}>Swap Side</Text>
              </TouchableOpacity>
            </View>

            {selectedSide ? (
              <TouchableOpacity
                style={[styles.pairingCard, { backgroundColor: theme.background, borderColor: theme.border }]}
                activeOpacity={0.7}
                onPress={() => router.push(`/browse/${selectedSide.recipe_id}`)}
              >
                <View style={styles.pairingCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pairingCardTitle, { color: theme.text }]} numberOfLines={1}>
                      {selectedSide.title}
                    </Text>
                    <View style={styles.pairingCardMeta}>
                      <Text style={{ fontSize: FontSize.xs, color: theme.textTertiary }}>
                        {selectedSide.recipe_role === 'veg_side' ? '🥗 Veggie Side' :
                         selectedSide.recipe_role === 'carb_base' ? '🍚 Carb Base' :
                         selectedSide.recipe_role === 'protein_base' ? '🥩 Protein' :
                         selectedSide.recipe_role === 'sauce' ? '🫙 Sauce' : selectedSide.recipe_role}
                      </Text>
                      {selectedSide.total_time_min > 0 && (
                        <Text style={{ fontSize: FontSize.xs, color: theme.textTertiary }}>
                          · {selectedSide.total_time_min}m
                        </Text>
                      )}
                      {selectedSide.is_default_pairing && (
                        <View style={[styles.defaultBadge, { backgroundColor: theme.primaryMuted }]}>
                          <Text style={{ fontSize: 8, fontWeight: '800', color: theme.primary, letterSpacing: 0.3 }}>DEFAULT</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {/* MES Delta */}
                {baseMesImpactScore !== null && selectedSideImpactScore !== null && (
                  <View style={[styles.mesDeltaRow, { backgroundColor: theme.primary + '0A' }]}>
                    <Text style={{ fontSize: FontSize.xs, fontWeight: '600', color: theme.textSecondary }}>MES Impact</Text>
                    <View style={styles.mesDeltaValues}>
                      <Text style={[styles.mesDeltaBase, { color: theme.textTertiary }]}>
                        {Math.round(baseMesImpactScore)}
                      </Text>
                      <Ionicons name="arrow-forward" size={12} color={theme.primary} />
                      <Text style={[styles.mesDeltaCombined, { color: theme.primary }]}>
                        {Math.round(selectedSideImpactScore)}
                      </Text>
                      {selectedSide.mes_delta > 0 && (
                        <View style={[styles.mesDeltaBadge, { backgroundColor: '#22C55E' + '20' }]}>
                          <Ionicons name="trending-up" size={10} color="#22C55E" />
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#22C55E' }}>
                            +{Math.round(selectedSide.mes_delta)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ) : loadingPairings ? (
              <ActivityIndicator size="small" color={theme.primary} style={{ padding: Spacing.md }} />
            ) : null}
          </View>
        )}

        {/* ── Best Paired With (components) ── */}
        {recipe?.is_component && pairings.length > 0 && (
          <View style={[styles.section, styles.pairingSection, { backgroundColor: theme.surface, borderColor: theme.info + '30' }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Best Paired With</Text>
            <Text style={{ fontSize: FontSize.xs, color: theme.textSecondary, marginBottom: Spacing.md, marginTop: -8 }}>
              Combine this {recipe.recipe_role === 'veg_side' ? 'side' : recipe.recipe_role === 'sauce' ? 'sauce' : 'base'} with a main for a complete meal
            </Text>
            {pairings.slice(0, 3).map((p) => (
              <TouchableOpacity
                key={p.recipe_id}
                style={[styles.pairingListItem, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                activeOpacity={0.7}
                onPress={() => router.push(`/browse/${p.recipe_id}`)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pairingCardTitle, { color: theme.text }]} numberOfLines={1}>{p.title}</Text>
                  <Text style={{ fontSize: FontSize.xs, color: theme.textTertiary }}>{p.cuisine}</Text>
                </View>
                {p.recipe_role !== 'full_meal' && (
                  <TouchableOpacity
                    style={[styles.addToPlateBtn, { backgroundColor: theme.primary }]}
                    onPress={() => {
                      addToPlate({
                        id: p.recipe_id,
                        title: p.title,
                        nutrition: p.nutrition_info || {},
                        context: 'component',
                      });
                      Alert.alert('Added to Plate', `"${p.title}" added to plate.`);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="restaurant-outline" size={12} color="#fff" />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>Plate</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Ingredients */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.ingredientHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
              Ingredients
            </Text>
            <Text style={[styles.ingredientCounter, { color: theme.textTertiary }]}>
              {checkedIngredients.size}/{displayedIngredients.length}
            </Text>
          </View>

          {ingredientGroups.map(({ catKey, catInfo, items }) => {
            const groupIndices = items.map((i) => i.idx);
            const checkedCount = groupIndices.filter((i) => checkedIngredients.has(i)).length;
            const allDone = checkedCount === items.length;
            const isCollapsed = collapsedCategories.has(catKey);

            return (
              <View key={catKey} style={styles.ingredientGroup}>
                  <TouchableOpacity
                    style={styles.categoryHeader}
                    onPress={() => toggleCategory(catKey)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.categoryPill, { backgroundColor: catInfo.color + '18' }]}>
                      <Ionicons name={catInfo.icon as any} size={14} color={catInfo.color} />
                      <Text style={[styles.categoryLabel, { color: catInfo.color }]}>
                        {catInfo.label}
                      </Text>
                    </View>
                    <View style={styles.categoryRight}>
                      <Text
                        style={[
                          styles.categoryCount,
                          { color: allDone ? theme.primary : theme.textTertiary },
                        ]}
                      >
                        {checkedCount}/{items.length}
                      </Text>
                      {allDone && (
                        <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                      )}
                      <Ionicons
                        name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                        size={16}
                        color={theme.textTertiary}
                      />
                    </View>
                  </TouchableOpacity>

                  {!isCollapsed &&
                    items.map(({ ing, idx }) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.ingredientRow}
                        onPress={() => toggleIngredient(idx, catKey, groupIndices)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            {
                              borderColor: checkedIngredients.has(idx)
                                ? theme.primary
                                : theme.border,
                              backgroundColor: checkedIngredients.has(idx)
                                ? theme.primary
                                : 'transparent',
                            },
                          ]}
                        >
                          {checkedIngredients.has(idx) && (
                            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                          )}
                        </View>
                        <Text
                          style={[
                            styles.ingredientText,
                            {
                              color: checkedIngredients.has(idx)
                                ? theme.textTertiary
                                : theme.text,
                              textDecorationLine: checkedIngredients.has(idx)
                                ? 'line-through'
                                : 'none',
                            },
                          ]}
                        >
                          {(() => {
                            const baseServings = activeRecipe.servings || 1;
                            const rawQty = parseFloat(ing.quantity);
                            if (!isNaN(rawQty) && baseServings > 0) {
                              const scaled = (rawQty / baseServings) * servings;
                              const display = scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1).replace(/\.0$/, '');
                              return `${display} ${ing.unit} ${ing.name}`;
                            }
                            return `${ing.quantity} ${ing.unit} ${ing.name}`;
                          })()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              );
          })}
        </View>

        {/* Steps */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          <View style={styles.stepHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Steps</Text>
            <TouchableOpacity
              style={[styles.cookModeBtn, { backgroundColor: theme.primaryMuted }]}
              onPress={() => router.push(`/cook/${recipe.id}`)}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles" size={13} color={theme.primary} />
              <Text style={[styles.cookModeBtnText, { color: theme.primary }]}>Open Cook Mode</Text>
            </TouchableOpacity>
          </View>

          {stepSections.length > 0 ? (
            /* ── Grouped step sections for composed meals or default pairings ── */
            <View style={{ gap: Spacing.sm }}>
              {stepSections.map((comp, compIdx) => {
                const componentKey = `${comp.id}-${compIdx}`;
                const isCollapsed = collapsedComponents.has(componentKey);
                const roleConfig = ROLE_BADGE_CONFIG[comp.recipe_role] || ROLE_BADGE_CONFIG.default;
                return (
                  <View key={componentKey} style={[styles.componentCard, { borderColor: theme.border }]}> 
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setCollapsedComponents((prev) => {
                          const next = new Set(prev);
                          if (next.has(componentKey)) next.delete(componentKey);
                          else next.add(componentKey);
                          return next;
                        });
                      }}
                      style={styles.componentHeader}
                    >
                      <View style={styles.componentHeaderLeft}>
                        <View style={[styles.componentIndex, { backgroundColor: roleConfig.bg }]}>
                          <Text style={[styles.componentIndexText, { color: roleConfig.color }]}>{compIdx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.componentTitle, { color: theme.text }]}>{comp.title}</Text>
                          <View style={[styles.roleBadge, { backgroundColor: roleConfig.bg }]}>
                            <Ionicons name={roleConfig.icon as any} size={10} color={roleConfig.color} />
                            <Text style={[styles.roleBadgeText, { color: roleConfig.color }]}>{roleConfig.label}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.componentHeaderRight}>
                        <Text style={[styles.componentStepCount, { color: theme.textSecondary }]}>
                          {comp.steps.length} step{comp.steps.length !== 1 ? 's' : ''}
                        </Text>
                        <Ionicons
                          name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                          size={16}
                          color={theme.textTertiary}
                        />
                      </View>
                    </TouchableOpacity>
                    {!isCollapsed && (
                      <View style={styles.componentSteps}>
                        {comp.steps.map((step, stepIdx) => (
                          <View key={stepIdx} style={styles.stepRow}>
                            <View style={[styles.stepNumber, { backgroundColor: roleConfig.bg }]}>
                              <Text style={[styles.stepNumberText, { color: roleConfig.color }]}>{stepIdx + 1}</Text>
                            </View>
                            <Text style={[styles.stepText, { color: theme.text }]}>
                              {step.replace(/^Step\s*\d+\s*:\s*/i, '')}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Assembly step — extracted from the bowl's own steps */}
              {(() => {
                if (pairingSections.length > 0) return null;
                if (!displayedAssemblyStep) return null;
                return (
                  <View style={[styles.componentCard, { borderColor: theme.border }]}>
                    <View style={styles.componentHeader}>
                      <View style={styles.componentHeaderLeft}>
                        <View style={[styles.componentIndex, { backgroundColor: theme.primaryMuted }]}>
                          <Ionicons name="layers-outline" size={14} color={theme.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.componentTitle, { color: theme.text }]}>Assembly</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.componentSteps}>
                      <View style={styles.stepRow}>
                        <View style={[styles.stepNumber, { backgroundColor: theme.primaryMuted }]}>
                          <Text style={[styles.stepNumberText, { color: theme.primary }]}>1</Text>
                        </View>
                        <Text style={[styles.stepText, { color: theme.text }]}>
                          {displayedAssemblyStep}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>
          ) : (
            /* ── Flat step list for regular recipes ── */
            activeRecipe.steps.map((step, idx) => (
              <View key={idx} style={styles.stepRow}>
                <View style={[styles.stepNumber, { backgroundColor: theme.primaryMuted }]}>
                  <Text style={[styles.stepNumberText, { color: theme.primary }]}>{idx + 1}</Text>
                </View>
                <Text style={[styles.stepText, { color: theme.text }]}>{step.replace(/^Step\s*\d+\s*:\s*/i, '')}</Text>
              </View>
            ))
          )}
        </View>

        {/* Good For / Health Benefits */}
        {activeRecipe.health_benefits?.length > 0 && (
          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Good For</Text>
            {goodForSummary && (
              <Text style={[styles.goodForSummary, { color: theme.textSecondary }]}> 
                This meal supports {goodForSummary}.
              </Text>
            )}
            <View style={styles.benefitGrid}>
              {activeRecipe.health_benefits.map((hb) => {
                const info = getBenefitInfo(hb);
                return (
                  <View
                    key={hb}
                    style={[styles.benefitCard, { backgroundColor: (info?.color || '#666') + '14' }]}
                  >
                    <Ionicons
                      name={(info?.icon as any) || 'leaf'}
                      size={20}
                      color={info?.color || '#666'}
                    />
                    <Text style={[styles.benefitLabel, { color: info?.color || '#666' }]}> 
                      {info?.label || hb}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {showPlusMenu && (
        <>
          <Pressable style={styles.menuBackdrop} onPress={closePlusMenu} />
          <Animated.View
            style={[
              styles.popoverMenu,
              {
                top: 8,
                right: Spacing.lg,
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: '#000',
                opacity: menuFade,
                transform: [{ scale: menuFade.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
              },
            ]}
          >
            <View style={styles.popoverServingsRow}>
              <Text style={[styles.popoverServingsLabel, { color: theme.textSecondary }]}>Servings</Text>
              <View style={[styles.popoverStepper, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <TouchableOpacity
                  onPress={() => setPopoverServings((s) => Math.max(1, s - 1))}
                  style={styles.popoverStepperBtn}
                  activeOpacity={0.5}
                >
                  <Ionicons name="remove" size={16} color={popoverServings <= 1 ? theme.textTertiary : theme.text} />
                </TouchableOpacity>
                <Text style={[styles.popoverStepperValue, { color: theme.text }]}>{popoverServings}</Text>
                <TouchableOpacity
                  onPress={() => setPopoverServings((s) => Math.min(10, s + 1))}
                  style={styles.popoverStepperBtn}
                  activeOpacity={0.5}
                >
                  <Ionicons name="add" size={16} color={theme.text} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={[styles.popoverDivider, { backgroundColor: theme.border }]} />
            <TouchableOpacity
              style={styles.popoverItem}
              activeOpacity={0.6}
              onPress={() => handleLogMeal(popoverServings)}
            >
              <View style={[styles.popoverIcon, { backgroundColor: theme.primaryMuted }]}>
                <Ionicons name="nutrition-outline" size={16} color={theme.primary} />
              </View>
              <Text style={[styles.popoverLabel, { color: theme.text }]}>Log to Chronometer</Text>
            </TouchableOpacity>
            {canAddToPlate && (
              <>
                <View style={[styles.popoverDivider, { backgroundColor: theme.border }]} />
                <TouchableOpacity
                  style={styles.popoverItem}
                  activeOpacity={0.6}
                  onPress={() => handleAddToPlate(true)}
                >
                  <View style={[styles.popoverIcon, { backgroundColor: theme.accentMuted }]}>
                    <Ionicons name={isOnPlate ? 'checkmark-circle' : 'restaurant-outline'} size={16} color={theme.accent} />
                  </View>
                  <Text style={[styles.popoverLabel, { color: theme.text }]}>
                    {isOnPlate ? 'Already on Plate' : 'Add to Plate'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </>
      )}

      {/* ── MES Breakdown Sheet ── */}
      <Modal
        visible={showMESBreakdown}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMESBreakdown(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowMESBreakdown(false)}>
          <Pressable
            style={[styles.sheetContent, { backgroundColor: theme.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandleRow}>
              <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
            </View>

            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>MES Breakdown</Text>
              <TouchableOpacity
                style={[styles.sheetCloseBtn, { backgroundColor: theme.surfaceElevated }]}
                onPress={() => setShowMESBreakdown(false)}
              >
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {mesDisplayScore !== null && (
              <View style={{ paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.md }}>
                <View style={[styles.mesBreakdownSummary, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}> 
                  <MetabolicRing
                    score={mesDisplayScore}
                    tier={mesTier}
                    size={72}
                    showLabel={false}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mesTierLabel, { color: mesTierConfig.color }]}>{mesTierConfig.label}</Text>
                    <Text style={[styles.mesTierSubtext, { color: theme.textSecondary }]}>This meal's metabolic energy score</Text>
                  </View>
                </View>

                {mesBreakdown.map((item) => (
                  <View key={item.label} style={styles.mesBreakdownRow}>
                    <View style={styles.mesBreakdownLabelRow}>
                      <View style={[styles.mesBreakdownDot, { backgroundColor: item.color }]} />
                      <Text style={[styles.mesBreakdownLabel, { color: theme.text }]}>{item.label}</Text>
                    </View>
                    <View style={[styles.mesBreakdownTrack, { backgroundColor: theme.surfaceHighlight }]}> 
                      <View
                        style={[
                          styles.mesBreakdownFill,
                          { backgroundColor: item.color, width: `${Math.min(Math.max(item.value, 0), 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={[styles.mesBreakdownValue, { color: theme.textSecondary }]}>{Math.round(item.value)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Swap Side Bottom Sheet ── */}
      <Modal
        visible={showSwapSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSwapSheet(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowSwapSheet(false)}>
          <Pressable
            style={[styles.sheetContent, { backgroundColor: theme.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <View style={styles.sheetHandleRow}>
              <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
            </View>

            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>Swap Side</Text>
              <TouchableOpacity
                style={[styles.sheetCloseBtn, { backgroundColor: theme.surfaceElevated }]}
                onPress={() => setShowSwapSheet(false)}
              >
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: FontSize.xs, color: theme.textSecondary, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md }}>
              Choose an alternative side to pair with this meal
            </Text>

            <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl }}>
              {pairings.map((p) => {
                const isSelected = selectedSide?.recipe_id === p.recipe_id;
                return (
                  <TouchableOpacity
                    key={p.recipe_id}
                    style={[
                      styles.swapOption,
                      {
                        backgroundColor: isSelected ? theme.primary + '10' : theme.surfaceElevated,
                        borderColor: isSelected ? theme.primary + '40' : theme.border,
                      },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedSide(p);
                      setShowSwapSheet(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.swapOptionTitle, { color: theme.text }]} numberOfLines={1}>{p.title}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <Text style={{ fontSize: FontSize.xs, color: theme.textTertiary }}>
                          {p.recipe_role === 'veg_side' ? '🥗 Veggie' :
                           p.recipe_role === 'carb_base' ? '🍚 Carb' :
                           p.recipe_role === 'protein_base' ? '🥩 Protein' :
                           p.recipe_role === 'sauce' ? '🫙 Sauce' : p.recipe_role}
                        </Text>
                        {p.total_time_min > 0 && (
                          <Text style={{ fontSize: FontSize.xs, color: theme.textTertiary }}>· {p.total_time_min}m</Text>
                        )}
                        {p.nutrition_info?.calories && (
                          <Text style={{ fontSize: FontSize.xs, color: theme.textTertiary }}>· {p.nutrition_info.calories} cal</Text>
                        )}
                        {p.is_default_pairing && (
                          <View style={[styles.defaultBadge, { backgroundColor: theme.primaryMuted }]}>
                            <Text style={{ fontSize: 8, fontWeight: '800', color: theme.primary }}>DEFAULT</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', minWidth: 34 }}>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color:
                            p.mes_delta > 0
                              ? '#22C55E'
                              : p.mes_delta < 0
                                ? theme.warning
                                : theme.textTertiary,
                        }}
                      >
                        {`${p.mes_delta > 0 ? '+' : ''}${Math.round(p.mes_delta)}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>


    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.md,
  },
  navBackBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  navBackIcon: {
    transform: [{ translateX: 0 }],
  },
  navTitleWrap: {
    transform: [{ translateX: -10 }],
  },
  headerActionCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  titleRow: {
    marginTop: 2,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    lineHeight: 30,
  },
  description: {
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  metaBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  servingsMetaBox: {
    borderWidth: 1.5,
    position: 'relative',
    overflow: 'visible',
  },
  servingsStepperInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  servingsHintBubble: {
    position: 'absolute',
    bottom: -28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 10,
  },
  servingsHintText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  servingsHintArrow: {
    position: 'absolute',
    top: -5,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  mealPrepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  metaValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  metaLabel: {
    fontSize: FontSize.xs,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  tag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  tagText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  section: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    marginBottom: Spacing.md,
  },
  goodForSummary: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  benefitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  benefitLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.lg,
  },
  macroItem: {
    alignItems: 'center',
    gap: 6,
  },
  macroCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroValue: {
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  macroUnit: {
    fontSize: 9,
    fontWeight: '600',
  },
  macroLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  microSection: {
    gap: Spacing.sm,
  },
  microTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  microRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  microName: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    width: 80,
  },
  microBarContainer: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  microBarBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  microBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 3,
    zIndex: 1,
  },
  microValue: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    width: 55,
    textAlign: 'right',
  },
  ingredientHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  ingredientCounter: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  ingredientGroup: {
    marginBottom: Spacing.sm,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    marginBottom: 2,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  categoryLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryCount: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingredientText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  // ── Component Steps ──
  componentCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  componentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  componentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  componentHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  componentIndex: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  componentIndexText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  componentTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginTop: 3,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  componentStepCount: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  componentSteps: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.xs,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  cookModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  cookModeBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  stepRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumberText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: 22,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
  },
  popoverMenu: {
    position: 'absolute',
    width: 240,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    zIndex: 100,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  popoverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  popoverIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popoverLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  popoverDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  popoverServingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  popoverServingsLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  popoverStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  popoverStepperBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  popoverStepperValue: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    minWidth: 22,
    textAlign: 'center',
  },
  logBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
  },
  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  servingsLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stepperBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stepperValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
  logBarRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  logBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
  },
  logBarText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  plateBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  plateBarText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // ── Pairing Section ──
  pairingSection: {
    borderWidth: 1.5,
  },
  pairingSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  swapSideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  swapSideBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  pairingCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  pairingCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  pairingCardTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    lineHeight: 18,
  },
  pairingCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  defaultBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  mesDeltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  mesDeltaValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mesDeltaBase: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  mesDeltaCombined: {
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  mesDeltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pairingListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  addToPlateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  mesCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  mesCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mesCardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  mesTapHint: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  mesCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  mesTierLabel: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  mesTierSubtext: {
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginTop: 2,
  },
  mesBreakdownSummary: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  mesBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  mesBreakdownLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 70,
  },
  mesBreakdownDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  mesBreakdownLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  mesBreakdownTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  mesBreakdownFill: {
    height: '100%',
    borderRadius: 999,
  },
  mesBreakdownValue: {
    minWidth: 28,
    textAlign: 'right',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },

  // ── Swap Side Sheet ──
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '70%',
    paddingBottom: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  sheetHandleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  swapOptionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    flex: 1,
  },
});
