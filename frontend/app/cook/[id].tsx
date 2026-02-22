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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Card } from '../../components/GradientCard';
import { Button } from '../../components/Button';
import { useTheme } from '../../hooks/useTheme';
import { recipeApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

type Ingredient = {
  name: string;
  quantity?: string | number;
  unit?: string;
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

export default function CookModeScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [viewMode, setViewMode] = useState<'interactive' | 'list'>('interactive');
  const [ingredientsChecked, setIngredientsChecked] = useState<Set<number>>(new Set());

  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // AI assistant state
  const [showAssistant, setShowAssistant] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState('');
  const [userQuestion, setUserQuestion] = useState('');

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

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (timerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((s) => {
          if (s <= 1) {
            setTimerRunning(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerRunning, timerSeconds]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

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
        <Text style={[styles.recipeTitle, { color: theme.text }]}>{recipe.title}</Text>

        <View style={[styles.modeToggle, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          <TouchableOpacity
            onPress={() => setViewMode('interactive')}
            style={[styles.modeBtn, viewMode === 'interactive' && { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.modeBtnText, { color: viewMode === 'interactive' ? '#fff' : theme.textSecondary }]}>
              Cook Mode
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode('list')}
            style={[styles.modeBtn, viewMode === 'list' && { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.modeBtnText, { color: viewMode === 'list' ? '#fff' : theme.textSecondary }]}>
              List View
            </Text>
          </TouchableOpacity>
        </View>

        {/* Timer */}
        <Card style={styles.timerCard}>
          <View style={styles.timerRow}>
            <Ionicons name="timer" size={22} color={theme.accent} />
            <Text style={[styles.timerDisplay, { color: theme.text }]}>{formatTime(timerSeconds)}</Text>
            <View style={styles.timerButtons}>
              {[60, 300, 900].map((seconds) => (
                <TouchableOpacity
                  key={seconds}
                  onPress={() => setTimerSeconds(seconds)}
                  style={[styles.timerPreset, { backgroundColor: theme.surfaceHighlight }]}
                >
                  <Text style={[styles.timerPresetText, { color: theme.textSecondary }]}>{seconds / 60}m</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.timerActions}>
            <Button
              title={timerRunning ? 'Pause' : 'Start'}
              variant={timerRunning ? 'outline' : 'primary'}
              size="sm"
              onPress={() => setTimerRunning((v) => !v)}
            />
            <Button
              title="Reset"
              variant="ghost"
              size="sm"
              onPress={() => { setTimerSeconds(0); setTimerRunning(false); }}
            />
          </View>
        </Card>

        {/* Ingredients */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Ingredients</Text>
        {recipe.ingredients.map((item, index) => {
          const checked = ingredientsChecked.has(index);
          return (
            <TouchableOpacity
              key={`${item.name}-${index}`}
              onPress={() => {
                setIngredientsChecked((prev) => {
                  const next = new Set(prev);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  return next;
                });
              }}
              style={[styles.ingredientRow, { borderBottomColor: theme.border }]}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.checkCircle,
                  {
                    borderColor: checked ? theme.primary : theme.borderLight,
                    backgroundColor: checked ? theme.primary : 'transparent',
                  },
                ]}
              >
                {checked ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
              </View>
              <Text
                style={[
                  styles.ingredientName,
                  { color: checked ? theme.textTertiary : theme.text, textDecorationLine: checked ? 'line-through' : 'none' },
                ]}
              >
                {item.quantity || ''} {item.unit || ''} {item.name}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Instructions */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.xl }]}>Instructions</Text>

        {viewMode === 'interactive' ? (
          <>
            <Text style={[styles.stepCounter, { color: theme.textTertiary }]}>
              Step {currentStep + 1} of {recipe.steps.length}
            </Text>
            <LinearGradient colors={theme.gradient.primary} style={styles.stepCard}>
              <Text style={styles.stepNumber}>Step {currentStep + 1}</Text>
              <Text style={styles.stepText}>{recipe.steps[currentStep]}</Text>
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
                onPress={() => onStepChange(Math.min(recipe.steps.length - 1, currentStep + 1))}
              />
            </View>
          </>
        ) : (
          <View style={styles.listStepsWrap}>
            {recipe.steps.map((step, i) => (
              <View key={i} style={styles.stepListRow}>
                <View style={[styles.stepBadge, { backgroundColor: theme.primaryMuted }]}>
                  <Text style={[styles.stepBadgeText, { color: theme.primary }]}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepListText, { color: theme.text }]}>{step}</Text>
              </View>
            ))}
          </View>
        )}
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
  recipeTitle: { fontSize: FontSize.xxl, fontWeight: '800', marginBottom: Spacing.md },
  modeToggle: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    padding: 4,
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  modeBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
  timerCard: { marginBottom: Spacing.lg },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  timerDisplay: { fontSize: FontSize.xxl, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timerButtons: { flexDirection: 'row', gap: Spacing.xs, marginLeft: 'auto' },
  timerPreset: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  timerPresetText: { fontSize: FontSize.xs, fontWeight: '600' },
  timerActions: { flexDirection: 'row', gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', marginBottom: Spacing.sm },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
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
  navRow: { flexDirection: 'row', justifyContent: 'space-between' },
  listStepsWrap: { gap: Spacing.md },
  stepListRow: { flexDirection: 'row', gap: Spacing.sm },
  stepBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  stepBadgeText: { fontSize: FontSize.sm, fontWeight: '800' },
  stepListText: { flex: 1, fontSize: FontSize.sm, lineHeight: 22 },
});
