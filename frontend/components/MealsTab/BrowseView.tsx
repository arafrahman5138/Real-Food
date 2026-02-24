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
import { CUISINE_OPTIONS, COOK_TIME_OPTIONS, HEALTH_BENEFIT_OPTIONS } from '../../constants/Config';
import { CUISINE_EMOJI } from '../../constants/Recipes';

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
  cuisine?: string;
  meal_type?: string;
  flavor?: string;
  dietary?: string;
  cook_time?: string;
  difficulty?: string;
  health_benefit?: string;
}

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRecipes = useCallback(
    async (p: number = 1, append: boolean = false) => {
      setLoading(true);
      if (!append) setError(null);
      try {
        const params: Record<string, string | number> = { page: p, page_size: 20 };
        if (query) params.q = query;
        if (filters.cuisine) params.cuisine = filters.cuisine;
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
    [query, filters],
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
  }, [query, filters]);

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

  const clearFilters = () => {
    setFilters({});
    setQuery('');
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const getBenefitInfo = (id: string) =>
    HEALTH_BENEFIT_OPTIONS.find((h) => h.id === id);

  const getCuisineLabel = (id: string) =>
    CUISINE_OPTIONS.find((c) => c.id === id)?.label || id.replace(/_/g, ' ');

  const renderRecipeCard = ({ item }: { item: RecipeCard }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      activeOpacity={0.7}
      onPress={() => router.push(`/browse/${item.id}`)}
    >
      <View style={[styles.cardCuisineBadge, { backgroundColor: theme.primaryMuted }]}>
        <Text style={styles.cardCuisineEmoji}>
          {CUISINE_EMOJI[item.cuisine] || '🍽️'}
        </Text>
        <Text style={[styles.cardCuisineText, { color: theme.primary }]} numberOfLines={1}>
          {getCuisineLabel(item.cuisine)}
        </Text>
      </View>

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

  const renderFilterChip = (label: string, key: keyof Filters) => {
    const activeValue = filters[key];
    const isActive = !!activeValue;
    let displayLabel = label;
    if (isActive) {
      if (key === 'cuisine') displayLabel = getCuisineLabel(activeValue!);
      else if (key === 'health_benefit') displayLabel = getBenefitInfo(activeValue!)?.label || activeValue!;
      else if (key === 'cook_time') displayLabel = COOK_TIME_OPTIONS.find((c) => c.id === activeValue)?.label || activeValue!;
      else displayLabel = activeValue!.charAt(0).toUpperCase() + activeValue!.slice(1);
    }

    return (
      <TouchableOpacity
        key={key}
        style={[
          styles.filterChip,
          {
            backgroundColor: isActive ? theme.primary : theme.surfaceElevated,
            borderColor: isActive ? theme.primary : theme.border,
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
    let filterKey: keyof Filters = 'cuisine';

    switch (filterModal) {
      case 'cuisine':
        title = 'Cuisine';
        filterKey = 'cuisine';
        options = filterOptions.cuisines || [];
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

    return (
      <Modal transparent animationType="slide" visible onRequestClose={() => setFilterModal(null)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setFilterModal(null)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{title}</Text>
              <TouchableOpacity onPress={() => setFilterModal(null)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {options.map((opt) => {
                const isActive = filters[filterKey] === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.modalOption,
                      {
                        backgroundColor: isActive ? theme.primaryMuted : 'transparent',
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() => toggleFilter(filterKey, opt.value)}
                  >
                    <Text style={[styles.modalOptionText, { color: theme.text }]}>
                      {filterKey === 'cuisine' && CUISINE_EMOJI[opt.value]
                        ? `${CUISINE_EMOJI[opt.value]}  `
                        : ''}
                      {opt.label}
                    </Text>
                    {opt.count > 0 && (
                      <Text style={[styles.modalOptionCount, { color: theme.textTertiary }]}>
                        {opt.count}
                      </Text>
                    )}
                    {isActive && <Ionicons name="checkmark" size={20} color={theme.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
      >
        {renderFilterChip('Cuisine', 'cuisine')}
        {renderFilterChip('Meal Type', 'meal_type')}
        {renderFilterChip('Flavor', 'flavor')}
        {renderFilterChip('Cook Time', 'cook_time')}
        {renderFilterChip('Dietary', 'dietary')}
        {renderFilterChip('Difficulty', 'difficulty')}
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
            let label = value;
            if (key === 'cuisine') label = getCuisineLabel(value);
            else if (key === 'health_benefit') label = getBenefitInfo(value)?.label || value;
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
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
  cardCuisineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  cardCuisineEmoji: {
    fontSize: 12,
  },
  cardCuisineText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    maxHeight: '70%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  modalScroll: {
    paddingHorizontal: Spacing.xl,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: 4,
    borderBottomWidth: 0.5,
  },
  modalOptionText: {
    fontSize: FontSize.md,
    fontWeight: '500',
    flex: 1,
  },
  modalOptionCount: {
    fontSize: FontSize.sm,
    marginRight: Spacing.sm,
  },
});
