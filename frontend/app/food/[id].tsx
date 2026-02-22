import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Card } from '../../components/GradientCard';
import { useTheme } from '../../hooks/useTheme';
import { foodApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

interface FoodResult {
  id: string;
  name: string;
  category: string;
  nutrients: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fiber?: number;
  };
}

const SAMPLE_FOODS: FoodResult[] = [
  { id: '1', name: 'Sweet Potato', category: 'Vegetables', nutrients: { calories: 86, protein: 1.6, carbs: 20, fat: 0.1, fiber: 3 } },
  { id: '2', name: 'Salmon (Wild-Caught)', category: 'Fish', nutrients: { calories: 208, protein: 20, carbs: 0, fat: 13, fiber: 0 } },
  { id: '3', name: 'Quinoa', category: 'Grains', nutrients: { calories: 120, protein: 4.4, carbs: 21, fat: 1.9, fiber: 2.8 } },
  { id: '4', name: 'Avocado', category: 'Fruits', nutrients: { calories: 160, protein: 2, carbs: 8.5, fat: 14.7, fiber: 6.7 } },
  { id: '5', name: 'Blueberries', category: 'Fruits', nutrients: { calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3, fiber: 2.4 } },
  { id: '6', name: 'Chickpeas', category: 'Legumes', nutrients: { calories: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6 } },
  { id: '7', name: 'Spinach', category: 'Vegetables', nutrients: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 } },
  { id: '8', name: 'Almonds', category: 'Nuts', nutrients: { calories: 579, protein: 21, carbs: 22, fat: 49.9, fiber: 12.5 } },
  { id: '9', name: 'Extra Virgin Olive Oil', category: 'Oils', nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 } },
  { id: '10', name: 'Eggs (Pasture-Raised)', category: 'Protein', nutrients: { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0 } },
];

const HEALTH_FACTS: Record<string, string[]> = {
  'Sweet Potato': ['Rich in beta-carotene for eye health', 'High in vitamin A and C', 'Great complex carb source for sustained energy'],
  'Salmon (Wild-Caught)': ['Excellent source of omega-3 fatty acids', 'Supports heart and brain health', 'High-quality complete protein'],
  'Avocado': ['Rich in healthy monounsaturated fats', 'Great source of potassium', 'Supports nutrient absorption'],
  default: ['Whole, unprocessed food', 'Rich in natural nutrients', 'Part of a balanced whole-food diet'],
};

export default function FoodDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<FoodResult[]>(SAMPLE_FOODS);
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null);

  const isSearchMode = id === 'search';

  const filteredResults = search
    ? results.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : results;

  const handleSearch = async () => {
    if (!search.trim()) return;
    try {
      const data = await foodApi.search(search);
      if (data.foods?.length > 0) {
        setResults(data.foods);
      }
    } catch {}
  };

  const food = selectedFood || SAMPLE_FOODS.find((f) => f.id === id) || SAMPLE_FOODS[0];
  const facts = HEALTH_FACTS[food.name] || HEALTH_FACTS.default;

  if (isSearchMode && !selectedFood) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.searchBar, { paddingHorizontal: Spacing.xl }]}>
          <View style={[styles.searchInput, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <Ionicons name="search" size={18} color={theme.textTertiary} />
            <TextInput
              style={[styles.searchText, { color: theme.text }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search whole foods..."
              placeholderTextColor={theme.textTertiary}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoFocus
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <FlatList
          data={filteredResults}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: Spacing.huge }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSelectedFood(item)}
              activeOpacity={0.7}
            >
              <Card style={styles.foodCard} padding={Spacing.lg}>
                <View style={styles.foodCardHeader}>
                  <View style={[styles.foodCategoryBadge, { backgroundColor: theme.primaryMuted }]}>
                    <Text style={[styles.foodCategoryText, { color: theme.primary }]}>
                      {item.category}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.foodName, { color: theme.text }]}>{item.name}</Text>
                <View style={styles.nutrientRow}>
                  <View style={styles.nutrientItem}>
                    <Text style={[styles.nutrientValue, { color: theme.text }]}>{item.nutrients.calories}</Text>
                    <Text style={[styles.nutrientLabel, { color: theme.textTertiary }]}>cal</Text>
                  </View>
                  <View style={styles.nutrientItem}>
                    <Text style={[styles.nutrientValue, { color: theme.primary }]}>{item.nutrients.protein}g</Text>
                    <Text style={[styles.nutrientLabel, { color: theme.textTertiary }]}>protein</Text>
                  </View>
                  <View style={styles.nutrientItem}>
                    <Text style={[styles.nutrientValue, { color: theme.accent }]}>{item.nutrients.carbs}g</Text>
                    <Text style={[styles.nutrientLabel, { color: theme.textTertiary }]}>carbs</Text>
                  </View>
                  <View style={styles.nutrientItem}>
                    <Text style={[styles.nutrientValue, { color: theme.info }]}>{item.nutrients.fat}g</Text>
                    <Text style={[styles.nutrientLabel, { color: theme.textTertiary }]}>fat</Text>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {selectedFood && (
        <TouchableOpacity
          onPress={() => setSelectedFood(null)}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={20} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back to search</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.title, { color: theme.text }]}>{food.name}</Text>
      <View style={[styles.categoryChip, { backgroundColor: theme.primaryMuted }]}>
        <Text style={[styles.categoryChipText, { color: theme.primary }]}>{food.category}</Text>
      </View>

      {/* Nutrition Ring */}
      <Card style={styles.nutritionCard}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Nutrition per 100g</Text>
        <View style={styles.macroGrid}>
          {[
            { label: 'Calories', value: `${food.nutrients.calories}`, unit: 'kcal', color: theme.text },
            { label: 'Protein', value: `${food.nutrients.protein}`, unit: 'g', color: theme.primary },
            { label: 'Carbs', value: `${food.nutrients.carbs}`, unit: 'g', color: theme.accent },
            { label: 'Fat', value: `${food.nutrients.fat}`, unit: 'g', color: theme.info },
            { label: 'Fiber', value: `${food.nutrients.fiber}`, unit: 'g', color: '#8B5CF6' },
          ].map((macro, index) => (
            <View key={index} style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: macro.color }]}>
                {macro.value}
                <Text style={styles.macroUnit}>{macro.unit}</Text>
              </Text>
              <Text style={[styles.macroLabel, { color: theme.textTertiary }]}>{macro.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Health Facts */}
      <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.xl }]}>
        Health Benefits
      </Text>
      {facts.map((fact, index) => (
        <Card key={index} style={styles.factCard} padding={Spacing.md}>
          <View style={styles.factRow}>
            <LinearGradient
              colors={theme.gradient.primary}
              style={styles.factIcon}
            >
              <Ionicons name="checkmark" size={14} color="#FFF" />
            </LinearGradient>
            <Text style={[styles.factText, { color: theme.textSecondary }]}>{fact}</Text>
          </View>
        </Card>
      ))}

      <View style={{ height: Spacing.huge }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
  },
  searchBar: {
    paddingVertical: Spacing.md,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  searchText: {
    flex: 1,
    fontSize: FontSize.md,
  },
  foodCard: {
    marginBottom: Spacing.md,
  },
  foodCardHeader: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  foodCategoryBadge: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  foodCategoryText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  foodName: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  nutrientRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  nutrientItem: {
    alignItems: 'center',
  },
  nutrientValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  nutrientLabel: {
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  backText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  categoryChipText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
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
  factCard: {
    marginBottom: Spacing.sm,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  factIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factText: {
    flex: 1,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
});
