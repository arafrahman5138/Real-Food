import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { recipeApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';
import { COOK_TIME_OPTIONS, HEALTH_BENEFIT_OPTIONS, PROTEIN_OPTIONS, CARB_OPTIONS } from '../../constants/Config';
import { MealMESBadge } from '../MealMESBadge';
import { PlateComposer } from '../PlateComposer';
import { useMetabolicBudgetStore } from '../../stores/metabolicBudgetStore';
import { usePlateStore } from '../../stores/plateStore';
import {
  classifyMealContext,
  isScoreable,
  contextLabel,
  type MealContext,
  MEAL_CONTEXT_FULL,
  MEAL_CONTEXT_COMPONENT_PROTEIN,
  MEAL_CONTEXT_COMPONENT_CARB,
  MEAL_CONTEXT_COMPONENT_VEG,
  MEAL_CONTEXT_SAUCE,
  MEAL_CONTEXT_DESSERT,
} from '../../utils/mealContext';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - Spacing.xl * 2 - Spacing.md) / 2;

interface RecipeCard {
  id: string;
  title: string;
  description: string;
  cuisine: string;
  cook_time_min: number;
  total_time_min: number;
  difficulty: string;
  flavor_profile: string[];
  dietary_tags: string[];
  health_benefits: string[];
  nutrition_info: Record<string, number>;
  servings: number;
  // Composition fields
  recipe_role?: string;
  is_component?: boolean;
  meal_group_id?: string | null;
  default_pairing_ids?: string[];
  needs_default_pairing?: boolean | null;
  is_mes_scoreable?: boolean;
  composite_display_score?: number;
  composite_display_tier?: string;
}

interface BrowseResult {
  items: RecipeCard[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface Filters {
  protein_type?: string;
  carb_type?: string;
  meal_type?: string;
  flavor?: string;
  dietary?: string;
  cook_time?: string;
  difficulty?: string;
  health_benefit?: string;
}

const MULTI_SELECT_FILTERS: (keyof Filters)[] = ['protein_type', 'carb_type'];

type TopCategory = 'meals' | 'desserts';
type MealsSubTab = 'full' | 'components';
type DessertFilterKey = 'cookies' | 'cake' | 'pie' | 'bars' | 'pastries' | 'frozen';

const TOP_CATEGORIES: { key: TopCategory; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'meals', label: 'Meals', icon: 'restaurant-outline' },
  { key: 'desserts', label: 'Desserts', icon: 'ice-cream-outline' },
];

const MEALS_SUB_TABS: { key: MealsSubTab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'full', label: 'Full Meals', icon: 'flame-outline' },
  { key: 'components', label: 'Meal Prep', icon: 'layers-outline' },
];

const DESSERT_FILTERS: { key: DessertFilterKey; label: string; terms: string[] }[] = [
  { key: 'cookies', label: 'Cookies', terms: ['cookie', 'cookies'] },
  { key: 'cake', label: 'Cake', terms: ['cake', 'loaf'] },
  { key: 'pie', label: 'Pie', terms: ['pie', 'pies', 'tart'] },
  { key: 'bars', label: 'Bars', terms: ['bar', 'bars', 'brownie', 'blondie'] },
  { key: 'pastries', label: 'Pastries', terms: ['scone', 'scones', 'beignet', 'beignets', 'baklava', 'pastry', 'pastries', 'muffin', 'muffins'] },
  { key: 'frozen', label: 'Frozen', terms: ['ice cream', 'sorbet', 'popsicle', 'gelato'] },
];

interface BrowseViewProps {
  /** Pre-select top category (hides the Meals/Desserts toggle). */
  initialCategory?: TopCategory;
  /** Pre-select sub-tab (only relevant when category is 'meals'). */
  initialSubTab?: MealsSubTab;
}

export function BrowseView({ initialCategory, initialSubTab }: BrowseViewProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [results, setResults] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [filterModal, setFilterModal] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<TopCategory>(initialCategory ?? 'meals');
  const [mealsSubTab, setMealsSubTab] = useState<MealsSubTab>(initialSubTab ?? 'full');
  const [dessertFilter, setDessertFilter] = useState<DessertFilterKey | null>(null);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string | null>(null);
  const [fitsBudget, setFitsBudget] = useState(false);
  const [plateOpen, setPlateOpen] = useState(false);
  const plateItems = usePlateStore((s) => s.items);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** When launched from the menu, hide the top category toggle. */
  const hideTopCategoryToggle = !!initialCategory;

  // MES budget from store (for client-side badge computation)
  const mesBudget = useMetabolicBudgetStore((s) => s.budget);
  const fetchBudget = useMetabolicBudgetStore((s) => s.fetchBudget);
  const isFullMealsMode = selectedCategory === 'meals' && mealsSubTab === 'full';

  useEffect(() => {
    if (!mesBudget) fetchBudget();
  }, []);

  const fetchRecipes = useCallback(
    async (p: number = 1, append: boolean = false) => {
      setLoading(true);
      if (!append) setError(null);
      try {
        const params: Record<string, string | number> = { page: p, page_size: 20 };
        if (query) params.q = query;
        // Map top categories to backend composition filters
        if (selectedCategory === 'meals') {
          if (mealsSubTab === 'full') {
            params.view_mode = 'sit_down';
          } else {
            params.view_mode = 'meal_prep';
            if (selectedRoleFilter) params.recipe_role = selectedRoleFilter;
          }
        } else if (selectedCategory === 'desserts') {
          params.recipe_role = 'dessert';
        }
        if (isFullMealsMode) {
          if (filters.protein_type) params.protein_type = filters.protein_type;
          if (filters.carb_type) params.carb_type = filters.carb_type;
          if (filters.meal_type) params.meal_type = filters.meal_type;
          if (filters.flavor) params.flavor = filters.flavor;
          if (filters.dietary) params.dietary = filters.dietary;
          if (filters.cook_time) params.cook_time = filters.cook_time;
          if (filters.difficulty) params.difficulty = filters.difficulty;
          if (filters.health_benefit) params.health_benefit = filters.health_benefit;
        }

        const data: BrowseResult = await recipeApi.browse(params);
        if (append) {
          setResults((prev) =>
            prev ? { ...data, items: [...prev.items, ...data.items] } : data,
          );
        } else {
          setResults(data);
        }
        setPage(p);
      } catch (err: any) {
        if (!append) setError(err?.message || 'Unable to load recipes. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [query, filters, selectedCategory, mealsSubTab, selectedRoleFilter, isFullMealsMode],
  );

  useEffect(() => {
    recipeApi.getFilters().then(setFilterOptions).catch(console.error);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchRecipes(1, false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filters, selectedCategory, mealsSubTab, selectedRoleFilter]);

  const loadMore = () => {
    if (!loading && results && page < results.total_pages) {
      fetchRecipes(page + 1, true);
    }
  };

  const toggleFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? undefined : value,
    }));
    setFilterModal(null);
  };

  const toggleMultiValue = (key: keyof Filters, value: string) => {
    setFilters((prev) => {
      const current = prev[key] ? prev[key]!.split(',') : [];
      const idx = current.indexOf(value);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(value);
      }
      return { ...prev, [key]: current.length > 0 ? current.join(',') : undefined };
    });
  };

  const clearFilters = () => {
    setFilters({});
    setSelectedCategory('meals');
    setMealsSubTab('full');
    setDessertFilter(null);
    setSelectedRoleFilter(null);
    setQuery('');
    setFitsBudget(false);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (selectedRoleFilter ? 1 : 0) + (fitsBudget ? 1 : 0) + (dessertFilter ? 1 : 0);

  const getBenefitInfo = (id: string) =>
    HEALTH_BENEFIT_OPTIONS.find((h) => h.id === id);

  const getRecipeContext = (item: RecipeCard): MealContext => {
    // Prefer backend canonical taxonomy when available.
    if (item.recipe_role) {
      if (item.recipe_role === 'full_meal') return MEAL_CONTEXT_FULL;
      if (item.recipe_role === 'protein_base') return MEAL_CONTEXT_COMPONENT_PROTEIN;
      if (item.recipe_role === 'carb_base') return MEAL_CONTEXT_COMPONENT_CARB;
      if (item.recipe_role === 'veg_side') return MEAL_CONTEXT_COMPONENT_VEG;
      if (item.recipe_role === 'sauce') return MEAL_CONTEXT_SAUCE;
      if (item.recipe_role === 'dessert') return MEAL_CONTEXT_DESSERT;
    }

    // Safety fallback for older payloads.
    return classifyMealContext(item.title, null, item.nutrition_info);
  };

  const displayedItems = (() => {
    const base = results?.items || [];

    const modeFiltered = base.filter((item) => {
      const ctx = getRecipeContext(item);
      if (selectedCategory === 'desserts') return ctx === MEAL_CONTEXT_DESSERT;
      if (mealsSubTab === 'full') return isScoreable(ctx);
      if (mealsSubTab === 'components') {
        return [
          MEAL_CONTEXT_COMPONENT_PROTEIN,
          MEAL_CONTEXT_COMPONENT_CARB,
          MEAL_CONTEXT_COMPONENT_VEG,
          MEAL_CONTEXT_SAUCE,
        ].includes(ctx);
      }
      return true;
    });

    if (selectedCategory === 'desserts' && dessertFilter) {
      const activeDessertFilter = DESSERT_FILTERS.find((filter) => filter.key === dessertFilter);
      if (activeDessertFilter) {
        return modeFiltered.filter((item) => {
          const title = item.title.toLowerCase();
          return activeDessertFilter.terms.some((term) => title.includes(term));
        });
      }
    }

    if (isFullMealsMode && fitsBudget) {
      return modeFiltered.filter((item) => {
        const baseDisplayScore = Number(item.nutrition_info?.mes_display_score ?? item.nutrition_info?.mes_score ?? 0);
        const compositeDisplayScore =
          item.needs_default_pairing === true && typeof item.composite_display_score === 'number'
            ? Number(item.composite_display_score)
            : null;
        const displayScore = compositeDisplayScore ?? baseDisplayScore;
        return displayScore >= 60;
      });
    }

    return modeFiltered;
  })();

  const renderRecipeCard = ({ item }: { item: RecipeCard }) => {
    const ctx: MealContext = getRecipeContext(item);
    const baseDisplayScore = Number(item.nutrition_info?.mes_display_score ?? item.nutrition_info?.mes_score ?? 0);
    const baseDisplayTier = typeof item.nutrition_info?.mes_display_tier === 'string'
      ? item.nutrition_info.mes_display_tier
      : 'critical';
    const shouldUseCompositeScore =
      item.needs_default_pairing === true && typeof item.composite_display_score === 'number';
    const displayScore = shouldUseCompositeScore ? item.composite_display_score! : (baseDisplayScore > 0 ? baseDisplayScore : null);
    const displayTier = shouldUseCompositeScore
      ? (item.composite_display_tier || baseDisplayTier || 'critical')
      : (baseDisplayTier || 'critical');
    const hint = contextLabel(ctx);
    const hintTheme = ctx.includes('dessert')
      ? {
          bg: theme.accent + '14',
          border: theme.accent + '3D',
          text: theme.accent,
          icon: 'ice-cream-outline' as const,
        }
      : ctx.includes('sauce')
      ? {
          bg: theme.info + '14',
          border: theme.info + '3D',
          text: theme.info,
          icon: 'flask-outline' as const,
        }
      : {
          bg: theme.primary + '14',
          border: theme.primary + '3D',
          text: theme.primary,
          icon: 'layers-outline' as const,
        };

    return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      activeOpacity={0.7}
      onPress={() => router.push(`/browse/${item.id}`)}
    >
      <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
        {item.title}
      </Text>

      <View style={styles.cardMeta}>
        <View style={styles.cardMetaItem}>
          <Ionicons name="time-outline" size={12} color={theme.textSecondary} />
          <Text style={[styles.cardMetaText, { color: theme.textSecondary }]}>
            {item.total_time_min}m
          </Text>
        </View>
        <View style={styles.cardMetaItem}>
          <Ionicons name="speedometer-outline" size={12} color={theme.textSecondary} />
          <Text style={[styles.cardMetaText, { color: theme.textSecondary }]}>
            {item.difficulty}
          </Text>
        </View>
      </View>

      {displayScore !== null ? (
        <View style={{ gap: 4 }}>
          <MealMESBadge score={displayScore} tier={displayTier} compact />
          {item.needs_default_pairing === true && item.default_pairing_ids && item.default_pairing_ids.length > 0 && (
            <View style={styles.sideIndicatorRow}>
              <View style={[styles.sideIndicatorPill, { backgroundColor: theme.primary + '12', borderColor: theme.primary + '30' }]}>
                <Text style={{ fontSize: 10 }}>🥗</Text>
                <Text style={[styles.sideIndicatorText, { color: theme.primary }]}>+side included</Text>
              </View>
            </View>
          )}
        </View>
      ) : hint ? (
        <View style={styles.contextHintRow}>
          <View
            style={[
              styles.contextHintPill,
              {
                backgroundColor: hintTheme.bg,
                borderColor: hintTheme.border,
              },
            ]}
          >
            <Ionicons name={hintTheme.icon} size={10} color={hintTheme.text} />
            <Text style={[styles.contextHintText, { color: hintTheme.text }]} numberOfLines={1}>{hint}</Text>
          </View>
        </View>
      ) : null}

      {item.flavor_profile?.length > 0 && (
        <View style={styles.cardTags}>
          {item.flavor_profile.slice(0, 2).map((f) => (
            <View key={f} style={[styles.flavorTag, { backgroundColor: theme.accentMuted }]}>
              <Text style={[styles.flavorTagText, { color: theme.accent }]}>{f}</Text>
            </View>
          ))}
        </View>
      )}

      {item.health_benefits?.length > 0 && (
        <View style={styles.cardBenefits}>
          {item.health_benefits.slice(0, 2).map((hb) => {
            const info = getBenefitInfo(hb);
            return (
              <View
                key={hb}
                style={[
                  styles.benefitPill,
                  { backgroundColor: (info?.color || '#666') + '18' },
                ]}
              >
                <Ionicons
                  name={(info?.icon as any) || 'leaf'}
                  size={10}
                  color={info?.color || '#666'}
                />
                <Text
                  style={[styles.benefitPillText, { color: info?.color || '#666' }]}
                  numberOfLines={1}
                >
                  {info?.label || hb}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {item.nutrition_info?.calories && (
        <Text style={[styles.cardCalories, { color: theme.textTertiary }]}>
          {item.nutrition_info.calories} cal
        </Text>
      )}
    </TouchableOpacity>
  );
  };

  const getMultiSelectLabel = (key: keyof Filters, label: string): string => {
    const val = filters[key];
    if (!val) return label;
    const values = val.split(',');
    if (values.length === 1) {
      // Find a nice label from options
      if (key === 'protein_type') {
        return PROTEIN_OPTIONS.find((p) => p.id === values[0])?.label || values[0];
      }
      if (key === 'carb_type') {
        return CARB_OPTIONS.find((c) => c.id === values[0])?.label || values[0];
      }
    }
    return `${label} (${values.length})`;
  };

  const renderFilterChip = (label: string, key: keyof Filters) => {
    const activeValue = filters[key];
    const isActive = !!activeValue;
    const isMulti = MULTI_SELECT_FILTERS.includes(key);
    let displayLabel = label;
    if (isActive) {
      if (isMulti) {
        displayLabel = getMultiSelectLabel(key, label);
      } else if (key === 'health_benefit') displayLabel = getBenefitInfo(activeValue!)?.label || activeValue!;
      else if (key === 'cook_time') displayLabel = COOK_TIME_OPTIONS.find((c) => c.id === activeValue)?.label || activeValue!;
      else displayLabel = activeValue!.charAt(0).toUpperCase() + activeValue!.slice(1);
    }

    return (
      <TouchableOpacity
        key={key}
        style={[
          styles.filterChip,
          {
            backgroundColor: isActive ? theme.primary : theme.surfaceElevated + 'BB',
            borderColor: isActive ? theme.primary : theme.border + '55',
          },
        ]}
        onPress={() => {
          if (isActive) {
            setFilters((prev) => ({ ...prev, [key]: undefined }));
          } else {
            setFilterModal(key);
          }
        }}
      >
        <Text
          style={[
            styles.filterChipText,
            { color: isActive ? '#FFFFFF' : theme.textSecondary },
          ]}
        >
          {isActive ? displayLabel : label}
        </Text>
        {isActive ? (
          <Ionicons name="close-circle" size={14} color="#FFFFFF" style={{ marginLeft: 4 }} />
        ) : (
          <Ionicons name="chevron-down" size={12} color={theme.textTertiary} style={{ marginLeft: 3 }} />
        )}
      </TouchableOpacity>
    );
  };

  const renderFilterModal = () => {
    if (!filterModal || !filterOptions) return null;

    let title = '';
    let options: { value: string; label: string; count: number }[] = [];
    let filterKey: keyof Filters = 'meal_type';
    const isMulti = MULTI_SELECT_FILTERS.includes(filterModal as keyof Filters);

    switch (filterModal) {
      case 'protein_type':
        title = 'Protein';
        filterKey = 'protein_type';
        options = filterOptions.protein_types || PROTEIN_OPTIONS.map((p) => ({ value: p.id, label: p.label, count: 0 }));
        break;
      case 'carb_type':
        title = 'Carb';
        filterKey = 'carb_type';
        options = filterOptions.carb_types || CARB_OPTIONS.map((c) => ({ value: c.id, label: c.label, count: 0 }));
        break;
      case 'meal_type':
        title = 'Meal Type';
        filterKey = 'meal_type';
        options = filterOptions.meal_types || [];
        break;
      case 'flavor':
        title = 'Flavor';
        filterKey = 'flavor';
        options = filterOptions.flavors || [];
        break;
      case 'dietary':
        title = 'Dietary';
        filterKey = 'dietary';
        options = filterOptions.dietary || [];
        break;
      case 'difficulty':
        title = 'Difficulty';
        filterKey = 'difficulty';
        options = filterOptions.difficulties || [];
        break;
      case 'health_benefit':
        title = 'Health Benefit';
        filterKey = 'health_benefit';
        options = filterOptions.health_benefits || [];
        break;
      case 'cook_time':
        title = 'Cook Time';
        filterKey = 'cook_time';
        options = COOK_TIME_OPTIONS.map((c) => ({ value: c.id, label: c.label, count: 0 }));
        break;
    }

    const selectedValues = filters[filterKey] ? filters[filterKey]!.split(',') : [];

    return (
      <Modal transparent animationType="slide" visible onRequestClose={() => setFilterModal(null)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setFilterModal(null)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            {/* Drag handle */}
            <View style={styles.modalHandleRow}>
              <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />
            </View>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{title}</Text>
              <TouchableOpacity
                onPress={() => setFilterModal(null)}
                style={[styles.modalCloseBtn, { backgroundColor: theme.surfaceElevated }]}
              >
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {options.map((opt) => {
                const isActive = isMulti
                  ? selectedValues.includes(opt.value)
                  : filters[filterKey] === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.modalOption,
                      {
                        backgroundColor: isActive ? theme.primaryMuted : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      if (isMulti) {
                        toggleMultiValue(filterKey, opt.value);
                      } else {
                        toggleFilter(filterKey, opt.value);
                      }
                    }}
                    activeOpacity={0.6}
                  >
                    {isMulti && (
                      <View
                        style={[
                          styles.modalCheckbox,
                          {
                            borderColor: isActive ? theme.primary : theme.border,
                            backgroundColor: isActive ? theme.primary : 'transparent',
                          },
                        ]}
                      >
                        {isActive && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                      </View>
                    )}
                    <Text style={[styles.modalOptionText, { color: isActive ? theme.primary : theme.text }]}>
                      {opt.label}
                    </Text>
                    {opt.count > 0 && (
                      <View style={[styles.modalCountBadge, { backgroundColor: theme.surfaceElevated }]}>
                        <Text style={[styles.modalOptionCount, { color: theme.textTertiary }]}>
                          {opt.count}
                        </Text>
                      </View>
                    )}
                    {!isMulti && isActive && <Ionicons name="checkmark-circle" size={22} color={theme.primary} />}
                  </TouchableOpacity>
                );
              })}
              <View style={{ height: 8 }} />
            </ScrollView>
            {isMulti && (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalFooterBtn, styles.modalClearBtn, { borderColor: theme.border }]}
                  onPress={() => {
                    setFilters((prev) => ({ ...prev, [filterKey]: undefined }));
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modalFooterBtnText, { color: theme.textSecondary }]}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalFooterBtn, styles.modalApplyBtn, { backgroundColor: theme.primary }]}
                  onPress={() => setFilterModal(null)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modalFooterBtnText, { color: '#FFFFFF' }]}>
                    Apply{selectedValues.length > 0 ? ` (${selectedValues.length})` : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Search Bar */}
      <View style={[styles.searchBar, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.textTertiary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search recipes..."
          placeholderTextColor={theme.textTertiary}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Top Category Toggle (Meals / Desserts) — hidden when launched from menu ── */}
      {!hideTopCategoryToggle && (
      <View style={styles.categoryRow}>
        {TOP_CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.categoryCard,
                {
                  backgroundColor: isActive
                    ? theme.primary + '18'
                    : theme.surfaceElevated,
                  borderColor: isActive
                    ? theme.primary
                    : theme.border + '55',
                },
                isActive && {
                  shadowColor: theme.primary,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.18,
                  shadowRadius: 8,
                  elevation: 4,
                },
              ]}
              onPress={() => {
                setSelectedCategory(cat.key);
                setSelectedRoleFilter(null);
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={cat.icon}
                size={20}
                color={isActive ? theme.primary : theme.textSecondary}
              />
              <Text
                style={[
                  styles.categoryLabel,
                  { color: isActive ? theme.primary : theme.text },
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      )}

      {/* ── Sub-segment: Full Meals / Meal Prep (under Meals only) ── */}
      {selectedCategory === 'meals' && (
        <View style={styles.subSegmentRow}>
          {MEALS_SUB_TABS.map((tab) => {
            const isActive = mealsSubTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.subSegmentPill,
                  {
                    backgroundColor: isActive ? theme.primary : 'transparent',
                    borderColor: isActive ? theme.primary : theme.border + '55',
                  },
                ]}
                onPress={() => {
                  setMealsSubTab(tab.key);
                  setSelectedRoleFilter(null);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tab.icon}
                  size={14}
                  color={isActive ? '#FFFFFF' : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.subSegmentLabel,
                    { color: isActive ? '#FFFFFF' : theme.textSecondary },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Role sub-filter chips (Meal Prep components mode) ── */}
      {selectedCategory === 'meals' && mealsSubTab === 'components' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: Spacing.sm, marginBottom: Spacing.xs, flexGrow: 0, flexShrink: 0, height: 38 }}
          contentContainerStyle={{ paddingHorizontal: Spacing.xl, gap: 8, alignItems: 'center' }}
        >
          {([
            { key: null, label: 'All Components', icon: 'grid-outline' },
            { key: 'protein_base', label: 'Protein', icon: 'fish-outline' },
            { key: 'carb_base', label: 'Carbs', icon: 'nutrition-outline' },
            { key: 'veg_side', label: 'Veggies', icon: 'leaf-outline' },
            { key: 'sauce', label: 'Sauces', icon: 'flask-outline' },
          ] as const).map((role) => {
            const isActive = selectedRoleFilter === role.key;
            return (
              <TouchableOpacity
                key={role.label}
                onPress={() => setSelectedRoleFilter(role.key)}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: BorderRadius.full,
                  borderWidth: 1,
                  backgroundColor: isActive ? theme.primary + '18' : theme.surfaceElevated,
                  borderColor: isActive ? theme.primary + '40' : theme.border + '55',
                }}
              >
                <Ionicons
                  name={role.icon as any}
                  size={14}
                  color={isActive ? theme.primary : theme.textTertiary}
                />
                <Text style={{
                  fontSize: FontSize.xs,
                  fontWeight: isActive ? '700' : '600',
                  color: isActive ? theme.primary : theme.textSecondary,
                }}>
                  {role.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {selectedCategory === 'desserts' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterRowContent}
        >
          {DESSERT_FILTERS.map((filter) => {
            const isActive = dessertFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isActive ? theme.primary : theme.surfaceElevated + 'BB',
                    borderColor: isActive ? theme.primary : theme.border + '55',
                  },
                ]}
                onPress={() => setDessertFilter(dessertFilter === filter.key ? null : filter.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: isActive ? '#FFFFFF' : theme.textSecondary },
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Filter Chips (Full Meals only) */}
      {isFullMealsMode && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterRowContent}
          >
            {renderFilterChip('Protein', 'protein_type')}
            {renderFilterChip('Carb', 'carb_type')}
            {renderFilterChip('Cook Time', 'cook_time')}
            {renderFilterChip('Meal Type', 'meal_type')}
            {renderFilterChip('Dietary', 'dietary')}
            {renderFilterChip('Difficulty', 'difficulty')}
            {renderFilterChip('Flavor', 'flavor')}
            {renderFilterChip('Health Benefit', 'health_benefit')}
            {/* Fits My Budget toggle */}
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  backgroundColor: fitsBudget ? '#34C759' : theme.surfaceElevated + 'BB',
                  borderColor: fitsBudget ? '#34C759' : theme.border + '55',
                },
              ]}
              onPress={() => setFitsBudget((v) => !v)}
            >
              <Ionicons name="flash" size={12} color={fitsBudget ? '#FFFFFF' : theme.textSecondary} style={{ marginRight: 2 }} />
              <Text
                style={[
                  styles.filterChipText,
                  { color: fitsBudget ? '#FFFFFF' : theme.textSecondary },
                ]}
              >
                Fits Budget
              </Text>
              {fitsBudget && (
                <Ionicons name="close-circle" size={14} color="#FFFFFF" style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
            {activeFilterCount > 0 && (
              <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
                <Ionicons name="refresh" size={14} color={theme.error} />
                <Text style={[styles.clearBtnText, { color: theme.error }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Active Filters */}
          {activeFilterCount > 0 && (
            <View style={styles.activePills}>
          {Object.entries(filters).map(([key, value]) => {
            if (!value) return null;
            const isMulti = MULTI_SELECT_FILTERS.includes(key as keyof Filters);
            if (isMulti) {
              return value.split(',').map((v: string) => {
                let label = v;
                if (key === 'protein_type') label = PROTEIN_OPTIONS.find((p) => p.id === v)?.label || v;
                else if (key === 'carb_type') label = CARB_OPTIONS.find((c) => c.id === v)?.label || v;
                return (
                  <TouchableOpacity
                    key={`${key}-${v}`}
                    style={[styles.activePill, { backgroundColor: theme.primaryMuted }]}
                    onPress={() => toggleMultiValue(key as keyof Filters, v)}
                  >
                    <Text style={[styles.activePillText, { color: theme.primary }]}>{label}</Text>
                    <Ionicons name="close" size={12} color={theme.primary} />
                  </TouchableOpacity>
                );
              });
            }
            let label = value;
            if (key === 'health_benefit') label = getBenefitInfo(value)?.label || value;
            else if (key === 'cook_time') label = COOK_TIME_OPTIONS.find((c) => c.id === value)?.label || value;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.activePill, { backgroundColor: theme.primaryMuted }]}
                onPress={() => toggleFilter(key as keyof Filters, value)}
              >
                <Text style={[styles.activePillText, { color: theme.primary }]}>{label}</Text>
                <Ionicons name="close" size={12} color={theme.primary} />
              </TouchableOpacity>
            );
          })}
            </View>
          )}
        </>
      )}

      {/* Result count */}
      {results && (
        <Text style={[styles.resultCount, { color: theme.textSecondary }]}>
          {displayedItems.length} recipe{displayedItems.length !== 1 ? 's' : ''} found
        </Text>
      )}

      {/* Recipe Grid */}
      <FlatList
        data={displayedItems}
        renderItem={renderRecipeCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await fetchRecipes(1, false);
          setRefreshing(false);
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name={error ? 'cloud-offline-outline' : 'restaurant-outline'} size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {error
                  ? error
                  : activeFilterCount > 0 || query
                    ? 'No recipes match your filters'
                    : 'Loading recipes...'}
              </Text>
              {error && (
                <TouchableOpacity
                  onPress={() => fetchRecipes(1, false)}
                  style={{ backgroundColor: theme.primaryMuted, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, marginTop: Spacing.sm }}
                >
                  <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '700' }}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
        ListFooterComponent={
          loading ? (
            <ActivityIndicator size="small" color={theme.primary} style={{ padding: Spacing.lg }} />
          ) : null
        }
      />

      {renderFilterModal()}

      {/* ── Build Plate FAB ── */}
      {plateItems.length > 0 && (
        <TouchableOpacity
          style={[styles.plateFab, { backgroundColor: theme.primary }]}
          activeOpacity={0.85}
          onPress={() => setPlateOpen(true)}
        >
          <Ionicons name="restaurant" size={20} color="#fff" />
          <View style={styles.plateFabBadge}>
            <Text style={styles.plateFabCount}>{plateItems.length}</Text>
          </View>
        </TouchableOpacity>
      )}

      <PlateComposer visible={plateOpen} onClose={() => setPlateOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  categoryRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    gap: 10,
  },
  categoryCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 6,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subSegmentRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    gap: 10,
  },
  subSegmentPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  subSegmentLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    paddingVertical: Spacing.xs,
  },
  filterRow: {
    marginTop: Spacing.md,
    flexGrow: 0,
    flexShrink: 0,
    height: 48,
  },
  filterRowContent: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  filterChipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  clearBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  activePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  activePillText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  resultCount: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  gridContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
  },
  gridRow: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    lineHeight: 18,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardMetaText: {
    fontSize: FontSize.xs,
  },
  cardTags: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  flavorTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  flavorTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  cardBenefits: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  benefitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  benefitPillText: {
    fontSize: 9,
    fontWeight: '600',
  },
  cardCalories: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },

  // ── Side indicator ──
  sideIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  sideIndicatorText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // ── Context hint ──
  contextHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  contextHintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
    borderWidth: 1,
  },
  contextHintText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // ── Plate FAB ──
  plateFab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  plateFabBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF3B30',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateFabCount: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '65%',
    paddingBottom: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHandleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalScroll: {
    paddingHorizontal: Spacing.xl,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 4,
    gap: 10,
  },
  modalCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    flex: 1,
  },
  modalCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4,
  },
  modalOptionCount: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  modalFooterBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
  },
  modalClearBtn: {
    borderWidth: 1.5,
  },
  modalApplyBtn: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  modalFooterBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
