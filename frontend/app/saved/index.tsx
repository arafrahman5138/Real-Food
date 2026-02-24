import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Card } from '../../components/GradientCard';
import { useTheme } from '../../hooks/useTheme';
import { useSavedRecipesStore } from '../../stores/savedRecipesStore';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

export default function SavedRecipesScreen() {
  const theme = useTheme();
  const recipes = useSavedRecipesStore((s) => s.recipes);
  const loading = useSavedRecipesStore((s) => s.loading);
  const fetchSaved = useSavedRecipesStore((s) => s.fetchSaved);
  const removeRecipe = useSavedRecipesStore((s) => s.removeRecipe);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: Spacing.huge }} />
        ) : recipes.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="bookmark-outline" size={42} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No saved recipes yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Save a recipe from Healthify or Browse and it will appear here.</Text>
          </View>
        ) : (
          recipes.map((recipe) => (
            <Card key={recipe.id} style={styles.recipeCard} padding={Spacing.md}>
              <TouchableOpacity onPress={() => router.push(`/browse/${recipe.id}`)} activeOpacity={0.75}>
                <Text style={[styles.title, { color: theme.text }]}>{recipe.title}</Text>
                {!!recipe.description && (
                  <Text style={[styles.desc, { color: theme.textSecondary }]} numberOfLines={2}>
                    {recipe.description}
                  </Text>
                )}
                <View style={styles.metaRow}>
                  {!!recipe.total_time_min && (
                    <View style={[styles.metaChip, { backgroundColor: theme.surfaceHighlight }]}>
                      <Ionicons name="time-outline" size={12} color={theme.textTertiary} />
                      <Text style={[styles.metaText, { color: theme.textTertiary }]}>{recipe.total_time_min} min</Text>
                    </View>
                  )}
                  {!!recipe.difficulty && (
                    <View style={[styles.metaChip, { backgroundColor: theme.surfaceHighlight }]}>
                      <Text style={[styles.metaText, { color: theme.textTertiary }]}>{recipe.difficulty}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.removeBtn, { backgroundColor: theme.surfaceHighlight }]}
                onPress={() => removeRecipe(recipe.id)}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={16} color={theme.error} />
                <Text style={[styles.removeText, { color: theme.error }]}>Remove</Text>
              </TouchableOpacity>
            </Card>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  emptyWrap: {
    marginTop: Spacing.huge,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  recipeCard: {
    borderRadius: BorderRadius.lg,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  desc: {
    marginTop: Spacing.xs,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  metaText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  removeBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  removeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});
