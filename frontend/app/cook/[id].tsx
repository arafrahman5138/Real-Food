import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  UIManager,
  LayoutAnimation,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Card } from '../../components/GradientCard';
import { Button } from '../../components/Button';
import { useTheme } from '../../hooks/useTheme';
import { nutritionApi, recipeApi, gameApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

type Ingredient = {
  name: string;
  quantity?: string | number;
  unit?: string;
  category?: string;
};

type RecipeDetail = {
  id: string;
  title: string;
  steps: string[];
  ingredients: Ingredient[];
  prep_time_min?: number;
  cook_time_min?: number;
  servings?: number;
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function CookModeScreen() {
  useKeepAwake();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [ingredientsChecked, setIngredientsChecked] = useState<Set<number>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const progressAnim = useRef(new Animated.Value(0)).current;

  // AI assistant state
  const [showAssistant, setShowAssistant] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState('');
  const [userQuestion, setUserQuestion] = useState('');
  const [loggedCook, setLoggedCook] = useState(false);

  const totalSteps = recipe?.steps?.length || 1;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    recipeApi
      .getDetail(id)
      .then((r) => {
        setRecipe({
          id: r.id,
          title: r.title,
          steps: r.steps || [],
          ingredients: r.ingredients || [],
          prep_time_min: r.prep_time_min,
          cook_time_min: r.cook_time_min,
          servings: r.servings,
        });
      })
      .catch(() => setRecipe(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: totalSteps > 0 ? (currentStep + 1) / totalSteps : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [currentStep, totalSteps, progressAnim]);

  const askAssistant = async (question?: string) => {
    if (!recipe?.id) return;
    setAiLoading(true);
    setShowAssistant(true);
    try {
      const res = await recipeApi.getCookHelp(recipe.id, currentStep, question);
      setAiAnswer(res.answer);
    } catch {
      setAiAnswer('Unable to connect to the cooking assistant. Try again in a moment.');
    } finally {
      setAiLoading(false);
      setUserQuestion('');
    }
  };

  const onStepChange = (newStep: number) => {
    setCurrentStep(newStep);
    setAiAnswer('');
    setShowAssistant(false);
  };

  const toggleIngredient = (index: number, categoryKey: string, groupIndices: number[]) => {
    setIngredientsChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
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

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!recipe || !recipe.steps?.length) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={44} color={theme.textTertiary} />
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          No cook steps found for this recipe.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <View style={[styles.progressBar, { backgroundColor: theme.surfaceElevated }]}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        >
          <LinearGradient colors={theme.gradient.primary} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Text style={[styles.recipeTitle, { color: theme.text, flex: 1 }]}>{recipe.title}</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.closeBtn, { backgroundColor: theme.surfaceHighlight }]}
          >
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Instructions */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Instructions</Text>

            <Text style={[styles.stepCounter, { color: theme.textTertiary }]}>
              Step {currentStep + 1} of {recipe.steps.length}
            </Text>
            <LinearGradient colors={theme.gradient.primary} style={styles.stepCard}>
              <Text style={styles.stepNumber}>Step {currentStep + 1}</Text>
              <Text style={styles.stepText}>{recipe.steps[currentStep].replace(/^Step\s*\d+\s*:\s*/i, '')}</Text>
            </LinearGradient>

            {/* AI Help Button */}
            <TouchableOpacity
              onPress={() => askAssistant()}
              style={[styles.helpButton, { backgroundColor: theme.accentMuted }]}
              activeOpacity={0.7}
            >
              <Ionicons name="bulb" size={18} color={theme.accent} />
              <Text style={[styles.helpButtonText, { color: theme.accent }]}>
                Get tips for this step
              </Text>
            </TouchableOpacity>

            {/* AI Answer */}
            {showAssistant && (
              <Card style={styles.aiCard}>
                {aiLoading ? (
                  <View style={styles.aiLoading}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={[styles.aiLoadingText, { color: theme.textSecondary }]}>
                      Thinking...
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.aiHeader}>
                      <Ionicons name="sparkles" size={16} color={theme.primary} />
                      <Text style={[styles.aiHeaderText, { color: theme.primary }]}>
                        Cooking Assistant
                      </Text>
                      <TouchableOpacity onPress={() => setShowAssistant(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="close" size={18} color={theme.textTertiary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.aiText, { color: theme.text }]}>{aiAnswer}</Text>

                    {/* Follow-up question */}
                    <View style={[styles.questionRow, { borderTopColor: theme.border }]}>
                      <TextInput
                        style={[styles.questionInput, { color: theme.text, backgroundColor: theme.surfaceHighlight }]}
                        placeholder="Ask a follow-up..."
                        placeholderTextColor={theme.textTertiary}
                        value={userQuestion}
                        onChangeText={setUserQuestion}
                        onSubmitEditing={() => { if (userQuestion.trim()) askAssistant(userQuestion); }}
                        returnKeyType="send"
                      />
                      <TouchableOpacity
                        onPress={() => { if (userQuestion.trim()) askAssistant(userQuestion); }}
                        style={[styles.sendBtn, { backgroundColor: theme.primary }]}
                      >
                        <Ionicons name="send" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </Card>
            )}

            {currentStep === recipe.steps.length - 1 ? (
              <Text style={[styles.doneHint, { color: theme.textSecondary }]}>
                Tap Done to log this cooked meal to Chronometer.
              </Text>
            ) : null}
            <View style={styles.navRow}>
              <Button
                title="Previous"
                variant="outline"
                size="sm"
                onPress={() => onStepChange(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              />
              <Button
                title={currentStep === recipe.steps.length - 1 ? 'Done' : 'Next'}
                size="sm"
                onPress={() => {
                  if (currentStep < recipe.steps.length - 1) {
                    onStepChange(Math.min(recipe.steps.length - 1, currentStep + 1));
                    return;
                  }
                  Alert.alert(
                    'Log This Meal?',
                    'Mark this recipe as cooked and log it to your Chronometer?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Log & Finish',
                        onPress: async () => {
                          if (!loggedCook) {
                            try {
                              await nutritionApi.createLog({
                                source_type: 'cook_mode',
                                source_id: recipe.id,
                                meal_type: 'dinner',
                                servings: 1,
                                quantity: 1,
                              });
                              setLoggedCook(true);
                              // Award XP for completing cook mode
                              gameApi.awardXP(50, 'cook_complete').catch(() => {});
                            } catch (e) {
                              console.error('cook log failed', e);
                            }
                          }
                          router.back();
                        },
                      },
                    ],
                  );
                }}
              />
            </View>

        {/* Ingredients */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm, marginTop: Spacing.xl }}>
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Ingredients</Text>
          <Text style={{ color: theme.textTertiary, fontSize: FontSize.xs, fontWeight: '600' }}>
            {ingredientsChecked.size}/{recipe.ingredients.length}
          </Text>
        </View>
        {(() => {
          const groups: Record<string, { ing: Ingredient; idx: number }[]> = {};
          recipe.ingredients.forEach((ing, idx) => {
            const cat = ing.category && INGREDIENT_CATEGORIES[ing.category] ? ing.category : 'other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push({ ing, idx });
          });
          const sortedKeys = Object.keys(groups).sort(
            (a, b) => (INGREDIENT_CATEGORIES[a]?.order ?? 99) - (INGREDIENT_CATEGORIES[b]?.order ?? 99)
          );
          return sortedKeys.map((catKey) => {
            const catInfo = INGREDIENT_CATEGORIES[catKey] || INGREDIENT_CATEGORIES.other;
            const items = groups[catKey];
            const groupIndices = items.map((i) => i.idx);
            const checkedCount = groupIndices.filter((i) => ingredientsChecked.has(i)).length;
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
                    <Text style={[styles.categoryLabel, { color: catInfo.color }]}>{catInfo.label}</Text>
                  </View>
                  <View style={styles.categoryRight}>
                    <Text style={[styles.categoryCount, { color: allDone ? theme.primary : theme.textTertiary }]}>
                      {checkedCount}/{items.length}
                    </Text>
                    {allDone && <Ionicons name="checkmark-circle" size={16} color={theme.primary} />}
                    <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={theme.textTertiary} />
                  </View>
                </TouchableOpacity>
                {!isCollapsed && items.map(({ ing, idx }) => {
                  const checked = ingredientsChecked.has(idx);
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={styles.ingredientRow}
                      onPress={() => toggleIngredient(idx, catKey, groupIndices)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkCircle, { borderColor: checked ? theme.primary : theme.borderLight, backgroundColor: checked ? theme.primary : 'transparent' }]}>
                        {checked && <Ionicons name="checkmark" size={12} color="#fff" />}
                      </View>
                      <Text style={[styles.ingredientName, { color: checked ? theme.textTertiary : theme.text, textDecorationLine: checked ? 'line-through' : 'none' }]}>
                        {ing.quantity || ''} {ing.unit || ''} {ing.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          });
        })()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  emptyText: { fontSize: FontSize.md },
  progressBar: { height: 4, overflow: 'hidden' },
  progressFill: { height: '100%' },
  content: { padding: Spacing.xl, paddingBottom: Spacing.huge },
  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: Spacing.sm },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  recipeTitle: { fontSize: FontSize.xxl, fontWeight: '800' },

  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', marginBottom: Spacing.sm },
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
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.sm,
    gap: Spacing.sm,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingredientName: { flex: 1, fontSize: FontSize.sm },
  stepCounter: { fontSize: FontSize.sm, marginBottom: Spacing.sm },
  stepCard: { borderRadius: BorderRadius.xl, padding: Spacing.xl, marginBottom: Spacing.md },
  stepNumber: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', marginBottom: Spacing.xs },
  stepText: { color: '#fff', fontSize: FontSize.md, lineHeight: 24, fontWeight: '600' },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  helpButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  aiCard: {
    marginBottom: Spacing.md,
  },
  aiLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  aiLoadingText: {
    fontSize: FontSize.sm,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  aiHeaderText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    flex: 1,
  },
  aiText: {
    fontSize: FontSize.sm,
    lineHeight: 22,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  questionInput: {
    flex: 1,
    fontSize: FontSize.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneHint: {
    fontSize: FontSize.xs,
    marginBottom: Spacing.sm,
  },
  navRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
