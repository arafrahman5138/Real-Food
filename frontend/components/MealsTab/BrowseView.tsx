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

const CATEGORY_OPTIONS = [
  { key: null, label: 'All', icon: 'grid-outline' as const },
  { key: 'quick', label: 'Quick', icon: 'flash-outline' as const },
  { key: 'meal-prep', label: 'Meal Prep', icon: 'layers-outline' as const },
  { key: 'sit-down', label: 'Sit-Down', icon: 'restaurant-outline' as const },
] as const;

export function BrowseView() {
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRecipes = useCallback(
    async (p: number = 1, append: boolean = false) => {
      setLoading(true);
      if (!append) setError(null);
      try {
        const params: Record<string, string | number> = { page: p, page_size: 20 };
        if (query) params.q = query;
        if (selectedCategory) params.category = selectedCategory;
        if (filters.protein_type) params.protein_type = filters.protein_type;
        if (filters.carb_type) params.carb_type = filters.carb_type;
        if (filters.meal_type) params.meal_type = filters.meal_type;
        if (filters.flavor) params.flavor = filters.flavor;
        if (filters.dietary) params.dietary = filters.dietary;
        if (filters.cook_time) params.cook_time = filters.cook_time;
        if (filters.difficulty) params.difficulty = filters.difficulty;
        if (filters.health_benefit) params.health_benefit = filters.health_benefit;

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
    [query, filters, selectedCategory],
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
  }, [query, filters, selectedCategory]);

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
    setSelectedCategory(null);
    setQuery('');
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (selectedCategory ? 1 : 0);

  const getBenefitInfo = (id: string) =>
    HEALTH_BENEFIT_OPTIONS.find((h) => h.id === id);

  const renderRecipeCard = ({ item }: { item: RecipeCard }) => (
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

      {/* Category Toggle */}
      <View style={styles.categoryRow}>
        {CATEGORY_OPTIONS.map((cat) => {
          const isActive = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.label}
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
              ]}
              onPress={() => setSelectedCategory(cat.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={cat.icon}
                size={22}
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

      {/* Filter Chips */}
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
              return value.split(',').map((v) => {
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

      {/* Result count */}
      {results && (
        <Text style={[styles.resultCount, { color: theme.textSecondary }]}>
          {results.total} recipe{results.total !== 1 ? 's' : ''} found
        </Text>
      )}

      {/* Recipe Grid */}
      <FlatList
        data={results?.items || []}
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 5,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
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
    paddingBottom: Spacing.huge,
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
