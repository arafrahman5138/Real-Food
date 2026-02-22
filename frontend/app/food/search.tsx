import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Card } from '../../components/GradientCard';
import { useTheme } from '../../hooks/useTheme';
import { foodApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

type FoodItem = {
  fdc_id?: number;
  id?: number;
  description?: string;
  brand_owner?: string;
  data_type?: string;
  calories_kcal?: number;
};

export default function FoodSearchScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSearch = useMemo(() => query.trim().length >= 2, [query]);

  const runSearch = async () => {
    if (!canSearch || loading) return;
    setLoading(true);
    setError('');
    try {
      const data = await foodApi.search(query.trim(), 1);
      const foods = Array.isArray(data?.foods) ? data.foods : Array.isArray(data) ? data : [];
      setResults(foods);
    } catch (e: any) {
      setError(e?.message || 'Failed to search foods.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Food Database</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Search whole and packaged foods instantly</Text>
      </View>

      <View style={[styles.searchRow, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}>
        <Ionicons name="search" size={18} color={theme.textTertiary} />
        <TextInput
          style={[styles.input, { color: theme.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search: chicken breast, avocado, greek yogurt..."
          placeholderTextColor={theme.textTertiary}
          returnKeyType="search"
          onSubmitEditing={runSearch}
        />
        <TouchableOpacity
          onPress={runSearch}
          disabled={!canSearch || loading}
          style={[styles.searchBtn, { backgroundColor: canSearch ? theme.primary : theme.surfaceHighlight }]}
        >
          <Ionicons name="arrow-forward" size={16} color={canSearch ? '#fff' : theme.textTertiary} />
        </TouchableOpacity>
      </View>

      {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Searching foods...</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item, idx) => String(item.fdc_id || item.id || idx)}
          contentContainerStyle={{ paddingTop: Spacing.md, paddingBottom: Spacing.huge }}
          ListEmptyComponent={
            <Card padding={Spacing.lg}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No results yet</Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Search any ingredient or food to view details and nutrition.</Text>
            </Card>
          }
          renderItem={({ item }) => {
            const id = String(item.fdc_id || item.id || '');
            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => id && router.push(`/food/${id}`)}
              >
                <Card style={{ marginBottom: Spacing.sm }} padding={Spacing.md}>
                  <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={2}>
                    {item.description || 'Unnamed food'}
                  </Text>
                  <View style={styles.metaRow}>
                    {!!item.brand_owner && (
                      <Text style={[styles.meta, { color: theme.textTertiary }]} numberOfLines={1}>
                        {item.brand_owner}
                      </Text>
                    )}
                    {!!item.data_type && (
                      <Text style={[styles.meta, { color: theme.textTertiary }]}>{item.data_type}</Text>
                    )}
                    {typeof item.calories_kcal === 'number' && (
                      <Text style={[styles.meta, { color: theme.primary }]}>{item.calories_kcal} kcal</Text>
                    )}
                  </View>
                </Card>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 2,
    fontSize: FontSize.sm,
  },
  searchRow: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
  },
  searchBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
  },
  center: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSize.sm,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  itemTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  meta: {
    fontSize: FontSize.xs,
    maxWidth: 180,
  },
});
