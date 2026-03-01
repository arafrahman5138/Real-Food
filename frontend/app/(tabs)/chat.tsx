import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Alert,
  Animated,
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Card } from '../../components/GradientCard';
import { Button } from '../../components/Button';
import { useTheme } from '../../hooks/useTheme';
import { useChatStore } from '../../stores/chatStore';
import { useSavedRecipesStore } from '../../stores/savedRecipesStore';
import { useGamificationStore } from '../../stores/gamificationStore';
import { useAuthStore } from '../../stores/authStore';
import { chatApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';
import {
  type RecipeIngredient,
  type RecipeData,
  type NormalizedAssistantPayload,
  type RecipeDraft,
  normalizeAssistantPayload,
  parseIngredientLine,
  recipeKeyFor,
  toStringValue,
} from '../../utils/chatParser';

const SUGGESTIONS = [
  'Mac and Cheese',
  'Pizza',
  'Fried Chicken',
  'Ice Cream',
  'Burger and Fries',
  'Chocolate Cake',
  'Ramen Noodles',
  'Pancakes',
];

export default function ChatScreen() {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft | null>(null);
  const [recipeOverrides, setRecipeOverrides] = useState<Record<string, RecipeData>>({});
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean[]>>({});
  const [showSavedRecipes, setShowSavedRecipes] = useState(false);
  const [questToast, setQuestToast] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const {
    messages,
    isLoading,
    streamingText,
    sessionId,
    addMessage,
    setSessionId,
    setLoading,
    setStreamingText,
  } = useChatStore();
  const clearChat = useChatStore((s) => s.clearChat);
  const loadLastSession = useChatStore((s) => s.loadLastSession);
  const savedRecipes = useSavedRecipesStore((s) => s.recipes);
  const awardXP = useGamificationStore((s) => s.awardXP);
  const saveRecipe = useSavedRecipesStore((s) => s.saveRecipe);
  const saveGeneratedRecipe = useSavedRecipesStore((s) => s.saveGeneratedRecipe);
  const removeRecipe = useSavedRecipesStore((s) => s.removeRecipe);
  const isSavedRecipe = useSavedRecipesStore((s) => s.isSaved);
  const fetchSaved = useSavedRecipesStore((s) => s.fetchSaved);

  useEffect(() => {
    fetchSaved();
    loadLastSession();
  }, [fetchSaved]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput('');
    addMessage({ role: 'user', content: userMessage });
    setLoading(true);
    setStreamingText('');

    try {
      const response = await chatApi.healthify(userMessage, sessionId || undefined);
      if (response.session_id) setSessionId(response.session_id);
      const normalized = normalizeAssistantPayload({
        content: response.message?.content || response.message || '',
        recipe: response.healthified_recipe,
        swaps: response.ingredient_swaps,
        nutrition: response.nutrition_comparison,
      });
      addMessage({
        role: 'assistant',
        content: normalized.message,
        recipe: normalized.recipe,
        swaps: normalized.swaps,
        nutrition: normalized.nutrition,
      });
      // Award XP for healthify usage
      awardXP(25, 'healthify').then((res) => {
        if (res.xp_gained > 0) showQuestToast(`+${res.xp_gained} XP · Healthify`);
      });
    } catch (err: any) {
      const rawMessage = String(err?.message || '');
      const friendlyMessage =
        /quota|rate.?limit|resourceexhausted|429/i.test(rawMessage)
          ? "The AI provider quota is currently exceeded. Please try again later, or switch the backend LLM provider/API key."
          : rawMessage || "I couldn't reach Healthify right now. Please try again in a moment.";
      addMessage({
        role: 'assistant',
        content: friendlyMessage,
      });
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  };

  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion);
    // Auto-send after a microtask to let state update
    setTimeout(() => {
      const userMessage = suggestion.trim();
      if (!userMessage || isLoading) return;
      setInput('');
      addMessage({ role: 'user', content: userMessage });
      setLoading(true);
      setStreamingText('');

      chatApi.healthify(userMessage, sessionId || undefined)
        .then((response) => {
          if (response.session_id) setSessionId(response.session_id);
          const normalized = normalizeAssistantPayload({
            content: response.message?.content || response.message || '',
            recipe: response.healthified_recipe,
            swaps: response.ingredient_swaps,
            nutrition: response.nutrition_comparison,
          });
          addMessage({
            role: 'assistant',
            content: normalized.message,
            recipe: normalized.recipe,
            swaps: normalized.swaps,
            nutrition: normalized.nutrition,
          });
          // Award XP for healthify usage
          awardXP(25, 'healthify').then((res) => {
            if (res.xp_gained > 0) showQuestToast(`+${res.xp_gained} XP · Healthify`);
          });
        })
        .catch((err: any) => {
          const rawMessage = String(err?.message || '');
          const friendlyMessage =
            /quota|rate.?limit|resourceexhausted|429/i.test(rawMessage)
              ? "The AI provider quota is currently exceeded. Please try again later, or switch the backend LLM provider/API key."
              : rawMessage || "I couldn't reach Healthify right now. Please try again in a moment.";
          addMessage({ role: 'assistant', content: friendlyMessage });
        })
        .finally(() => {
          setLoading(false);
          setStreamingText('');
        });
    }, 0);
  };

  const startRecipeEdit = (key: string, recipe: RecipeData) => {
    setEditingKey(key);
    setRecipeDraft({
      title: recipe.title || '',
      description: recipe.description || '',
      servings: recipe.servings ? String(recipe.servings) : '',
      prepTime: recipe.prep_time_min ? String(recipe.prep_time_min) : '',
      cookTime: recipe.cook_time_min ? String(recipe.cook_time_min) : '',
      ingredientsText: recipe.ingredients
        .map((ing) => `${toStringValue(ing.quantity)} ${toStringValue(ing.unit)} ${ing.name}`.trim())
        .join('\n'),
      stepsText: recipe.steps.join('\n'),
    });
  };

  const cancelRecipeEdit = () => {
    setEditingKey(null);
    setRecipeDraft(null);
  };

  const applyRecipeEdit = (key: string) => {
    if (!recipeDraft) return;
    const ingredients = recipeDraft.ingredientsText
      .split('\n')
      .map(parseIngredientLine)
      .filter((ing) => ing.name);
    const steps = recipeDraft.stepsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const updated: RecipeData = {
      title: recipeDraft.title.trim() || 'Custom Recipe',
      description: recipeDraft.description.trim(),
      ingredients,
      steps,
      servings: recipeDraft.servings ? Number(recipeDraft.servings) : undefined,
      prep_time_min: recipeDraft.prepTime ? Number(recipeDraft.prepTime) : undefined,
      cook_time_min: recipeDraft.cookTime ? Number(recipeDraft.cookTime) : undefined,
    };

    setRecipeOverrides((prev) => ({ ...prev, [key]: updated }));
    setEditingKey(null);
    setRecipeDraft(null);
    Alert.alert('Recipe updated', 'Your custom version is ready.');
  };

  const toggleSaveRecipe = async (key: string, recipe: RecipeData) => {
    const recipeId = recipe.id;

    if (recipeId && isSavedRecipe(recipeId)) {
      await removeRecipe(recipeId);
      Alert.alert('Removed', 'Recipe removed from your saved list.');
      return;
    }

    if (recipeId) {
      await saveRecipe(recipeId);
      Alert.alert('Saved', 'Recipe added to your saved list.');
      return;
    }

    const createdId = await saveGeneratedRecipe({
      title: recipe.title,
      description: recipe.description,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      servings: recipe.servings,
      prep_time_min: recipe.prep_time_min,
      cook_time_min: recipe.cook_time_min,
    });

    if (createdId) {
      setRecipeOverrides((prev) => ({
        ...prev,
        [key]: { ...recipe, id: createdId },
      }));
      Alert.alert('Saved', 'Recipe added to your saved list.');
      return;
    }

    Alert.alert('Save failed', 'Unable to save recipe right now. Please try again.');
  };

  const showQuestToast = (message: string) => {
    setQuestToast(message);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setQuestToast(null));
  };

  const normalizedMessages = useMemo(
    () =>
      messages.map((msg) =>
        msg.role === 'assistant'
          ? {
              ...msg,
              normalized: normalizeAssistantPayload({
                content: msg.content,
                recipe: msg.recipe,
                swaps: msg.swaps,
                nutrition: msg.nutrition,
              }),
            }
          : { ...msg, normalized: null }
      ),
    [messages]
  );

  return (
    <ScreenContainer padded={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={styles.headerContent}>
            <LinearGradient
              colors={theme.gradient.primary}
              style={styles.headerIcon}
            >
              <Ionicons name="sparkles" size={18} color="#FFFFFF" />
            </LinearGradient>
            <View style={styles.headerTextWrap}>
              <Text style={[styles.headerTitle, { color: theme.text }]}>Healthify</Text>
              <Text style={[styles.headerSubtitle, { color: theme.textTertiary }]} numberOfLines={1}>
                Transform any food into a whole-food version
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.savedPill, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
            onPress={() => router.push('/saved')}
            activeOpacity={0.75}
          >
            <Ionicons name="bookmark" size={14} color={theme.primary} />
            <Text style={[styles.savedPillText, { color: theme.text }]}>
              Saved {savedRecipes.length}
            </Text>
          </TouchableOpacity>
          {messages.length > 0 && (
            <TouchableOpacity
              style={[styles.savedPill, { backgroundColor: theme.surfaceElevated, borderColor: theme.border, marginLeft: Spacing.xs }]}
              onPress={clearChat}
              activeOpacity={0.75}
            >
              <Ionicons name="add" size={14} color={theme.primary} />
              <Text style={[styles.savedPillText, { color: theme.text }]}>New</Text>
            </TouchableOpacity>
          )}
        </View>

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
                    translateY: toastAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Ionicons name="trophy" size={14} color="#fff" />
            <Text style={styles.questToastText}>{questToast}</Text>
          </Animated.View>
        ) : null}

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {showSavedRecipes && savedRecipes.length > 0 && (
            <Card style={styles.savedListCard} padding={Spacing.md}>
              <Text style={[styles.savedListTitle, { color: theme.text }]}>Saved recipes</Text>
              {savedRecipes.map((saved) => (
                <View key={saved.id} style={[styles.savedListItem, { borderBottomColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.savedTitle, { color: theme.text }]}>{saved.title}</Text>
                    <Text style={[styles.savedMeta, { color: theme.textTertiary }]}>
                      {(saved.ingredients || []).length} ingredients
                      {saved.servings ? ` • ${saved.servings} servings` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeRecipe(saved.id)}
                    style={[styles.iconBtn, { backgroundColor: theme.surfaceHighlight }]}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </Card>
          )}

          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <LinearGradient
                colors={theme.gradient.hero}
                style={styles.emptyIcon}
              >
                <Ionicons name="nutrition" size={40} color="#FFFFFF" />
              </LinearGradient>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                What's your guilty pleasure?
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                Tell me your favorite unhealthy food and I'll create a delicious, whole-food version with all the flavor.
              </Text>

              <Text style={[styles.suggestionsTitle, { color: theme.textTertiary }]}>
                Try one of these:
              </Text>
              <View style={styles.suggestionsGrid}>
                {SUGGESTIONS.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => handleSuggestion(s)}
                    activeOpacity={0.7}
                    style={[styles.suggestionChip, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                  >
                    <Text style={[styles.suggestionText, { color: theme.textSecondary }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            normalizedMessages.map((msg, index) => {
              const payload = msg.normalized;
              const key = recipeKeyFor(index);
              const recipe = payload?.recipe ? recipeOverrides[key] || payload.recipe : null;
              const isEditing = editingKey === key;
              const isSaved = recipe?.id ? isSavedRecipe(recipe.id) : false;
              const ingredientState = checkedIngredients[key] || [];

              return (
              <View
                key={index}
                style={[
                  styles.messageBubble,
                  msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                {msg.role === 'assistant' && (
                  <View style={styles.assistantHeader}>
                    <LinearGradient colors={theme.gradient.primary} style={styles.miniIcon}>
                      <Ionicons name="sparkles" size={10} color="#FFF" />
                    </LinearGradient>
                    <Text style={[styles.assistantLabel, { color: theme.primary }]}>Healthify AI</Text>
                  </View>
                )}
                <View
                  style={[
                    styles.bubbleContent,
                    msg.role === 'user'
                      ? { backgroundColor: theme.primary }
                      : { backgroundColor: theme.surfaceElevated },
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      { color: msg.role === 'user' ? '#FFFFFF' : theme.text },
                    ]}
                  >
                    {payload?.message || msg.content}
                  </Text>
                </View>

                {/* Recipe Card */}
                {recipe && (
                  <Card style={styles.recipeCard} padding={Spacing.md}>
                    <View style={styles.recipeHeader}>
                      <View style={styles.recipeHeaderLeft}>
                        <Ionicons name="restaurant" size={16} color={theme.primary} style={{ marginTop: 3 }} />
                        <Text style={[styles.recipeName, { color: theme.text, flex: 1 }]}>
                          {recipe.title || 'Healthified Recipe'}
                        </Text>
                      </View>
                      <View style={styles.recipeActions}>
                        <TouchableOpacity
                          style={[styles.iconBtn, { backgroundColor: theme.surfaceHighlight }]}
                          onPress={() => toggleSaveRecipe(key, recipe)}
                        >
                          <Ionicons
                            name={isSaved ? 'bookmark' : 'bookmark-outline'}
                            size={16}
                            color={isSaved ? theme.primary : theme.textSecondary}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.iconBtn, { backgroundColor: theme.surfaceHighlight }]}
                          onPress={() =>
                            isEditing ? cancelRecipeEdit() : startRecipeEdit(key, recipe)
                          }
                        >
                          <Ionicons name="create-outline" size={16} color={theme.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {!!recipe.description && (
                      <Text style={[styles.recipeDescription, { color: theme.textSecondary }]}>
                        {recipe.description}
                      </Text>
                    )}

                    <View style={styles.metaRow}>
                      {recipe.servings ? (
                        <View style={[styles.metaChip, { backgroundColor: theme.surfaceHighlight }]}>
                          <Ionicons name="people-outline" size={12} color={theme.textTertiary} />
                          <Text style={[styles.metaChipText, { color: theme.textTertiary }]}>
                            {recipe.servings} servings
                          </Text>
                        </View>
                      ) : null}
                      {recipe.prep_time_min != null || recipe.cook_time_min != null ? (
                        <View style={[styles.metaChip, { backgroundColor: theme.surfaceHighlight }]}>
                          <Ionicons name="time-outline" size={12} color={theme.textTertiary} />
                          <Text style={[styles.metaChipText, { color: theme.textTertiary }]}>
                            {(recipe.prep_time_min || 0) + (recipe.cook_time_min || 0)} min
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {isEditing && recipeDraft ? (
                      <View style={styles.editPanel}>
                        <Text style={[styles.recipeSectionTitle, { color: theme.textSecondary }]}>Customize recipe</Text>
                        <TextInput
                          style={[styles.editInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceElevated }]}
                          value={recipeDraft.title}
                          onChangeText={(value) => setRecipeDraft((prev) => (prev ? { ...prev, title: value } : prev))}
                          placeholder="Recipe title"
                          placeholderTextColor={theme.textTertiary}
                        />
                        <TextInput
                          style={[styles.editInput, styles.editMultiline, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceElevated }]}
                          value={recipeDraft.description}
                          onChangeText={(value) => setRecipeDraft((prev) => (prev ? { ...prev, description: value } : prev))}
                          placeholder="Description"
                          placeholderTextColor={theme.textTertiary}
                          multiline
                        />
                        <View style={styles.editRow}>
                          <TextInput
                            style={[styles.editInput, styles.smallEdit, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceElevated }]}
                            value={recipeDraft.servings}
                            onChangeText={(value) => setRecipeDraft((prev) => (prev ? { ...prev, servings: value } : prev))}
                            placeholder="Servings"
                            placeholderTextColor={theme.textTertiary}
                            keyboardType="numeric"
                          />
                          <TextInput
                            style={[styles.editInput, styles.smallEdit, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceElevated }]}
                            value={recipeDraft.prepTime}
                            onChangeText={(value) => setRecipeDraft((prev) => (prev ? { ...prev, prepTime: value } : prev))}
                            placeholder="Prep min"
                            placeholderTextColor={theme.textTertiary}
                            keyboardType="numeric"
                          />
                          <TextInput
                            style={[styles.editInput, styles.smallEdit, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceElevated }]}
                            value={recipeDraft.cookTime}
                            onChangeText={(value) => setRecipeDraft((prev) => (prev ? { ...prev, cookTime: value } : prev))}
                            placeholder="Cook min"
                            placeholderTextColor={theme.textTertiary}
                            keyboardType="numeric"
                          />
                        </View>
                        <Text style={[styles.editHint, { color: theme.textTertiary }]}>
                          Ingredients: one item per line (example: 2 cups rolled oats)
                        </Text>
                        <TextInput
                          style={[styles.editInput, styles.editMultiline, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceElevated }]}
                          value={recipeDraft.ingredientsText}
                          onChangeText={(value) => setRecipeDraft((prev) => (prev ? { ...prev, ingredientsText: value } : prev))}
                          multiline
                        />
                        <Text style={[styles.editHint, { color: theme.textTertiary }]}>
                          Steps: one step per line
                        </Text>
                        <TextInput
                          style={[styles.editInput, styles.editMultiline, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceElevated }]}
                          value={recipeDraft.stepsText}
                          onChangeText={(value) => setRecipeDraft((prev) => (prev ? { ...prev, stepsText: value } : prev))}
                          multiline
                        />
                        <View style={styles.editActions}>
                          <Button title="Cancel" size="sm" variant="ghost" onPress={cancelRecipeEdit} />
                          <Button title="Apply changes" size="sm" onPress={() => applyRecipeEdit(key)} />
                        </View>
                      </View>
                    ) : null}

                    {recipe.ingredients.length > 0 && (
                      <View style={styles.recipeSection}>
                        <Text style={[styles.recipeSectionTitle, { color: theme.textSecondary }]}>
                          Ingredients
                        </Text>
                        {recipe.ingredients.map((ing, i) => {
                          const checked = !!ingredientState[i];
                          return (
                            <TouchableOpacity
                              key={i}
                              style={styles.ingredientRow}
                              onPress={() =>
                                setCheckedIngredients((prev) => {
                                  const arr = [...(prev[key] || [])];
                                  arr[i] = !arr[i];
                                  return { ...prev, [key]: arr };
                                })
                              }
                              activeOpacity={0.7}
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
                                {checked ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
                              </View>
                              <Text
                                style={[
                                  styles.ingredientItem,
                                  {
                                    color: checked ? theme.textTertiary : theme.textSecondary,
                                    textDecorationLine: checked ? 'line-through' : 'none',
                                  },
                                ]}
                              >
                                {toStringValue(ing.quantity)} {toStringValue(ing.unit)} {ing.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    {recipe.steps.length > 0 && (
                      <View style={styles.recipeSection}>
                        <Text style={[styles.recipeSectionTitle, { color: theme.textSecondary }]}>
                          Steps
                        </Text>
                        {recipe.steps.map((step: string, i: number) => (
                          <Text key={i} style={[styles.stepItem, { color: theme.textSecondary }]}>
                            {i + 1}. {step}
                          </Text>
                        ))}
                      </View>
                    )}
                  </Card>
                )}

                {/* Swaps */}
                {payload?.swaps && payload.swaps.length > 0 && (
                  <Card style={styles.swapsCard} padding={Spacing.md}>
                    <View style={styles.swapsHeader}>
                      <Ionicons name="swap-horizontal" size={16} color={theme.accent} />
                      <Text style={[styles.recipeName, { color: theme.text }]}>
                        Ingredient Swaps
                      </Text>
                    </View>
                    {payload.swaps.map((swap: any, i: number) => (
                      <View key={i} style={[styles.swapItem, { borderBottomColor: theme.border }]}>
                        <View style={styles.swapNames}>
                          <Text style={[styles.swapOld, { color: theme.error }]}>
                            {swap.original}
                          </Text>
                          <Ionicons name="arrow-down" size={14} color={theme.textTertiary} style={{ alignSelf: 'center' }} />
                          <Text style={[styles.swapNew, { color: theme.primary }]}>
                            {swap.replacement}
                          </Text>
                        </View>
                        <Text style={[styles.swapReason, { color: theme.textTertiary }]}>
                          {swap.reason}
                        </Text>
                      </View>
                    ))}
                  </Card>
                )}
              </View>
            );
            })
          )}

          {/* Streaming indicator */}
          {isLoading && (
            <View style={[styles.messageBubble, styles.assistantBubble]}>
              <View style={styles.assistantHeader}>
                <LinearGradient colors={theme.gradient.primary} style={styles.miniIcon}>
                  <Ionicons name="sparkles" size={10} color="#FFF" />
                </LinearGradient>
                <Text style={[styles.assistantLabel, { color: theme.primary }]}>Healthify AI</Text>
              </View>
              <View style={[styles.bubbleContent, { backgroundColor: theme.surfaceElevated }]}>
                <Text style={[styles.messageText, { color: theme.textTertiary }]}>
                  {streamingText || 'Analyzing and creating your healthy version...'}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: theme.surfaceElevated,
                color: theme.text,
                borderColor: theme.border,
              },
            ]}
            value={input}
            onChangeText={setInput}
            placeholder="Tell me your favorite food..."
            placeholderTextColor={theme.textTertiary}
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || isLoading}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={input.trim() ? theme.gradient.primary : [theme.surfaceHighlight, theme.surfaceHighlight]}
              style={styles.sendButton}
            >
              <Ionicons
                name="arrow-up"
                size={20}
                color={input.trim() ? '#FFFFFF' : theme.textTertiary}
              />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
    minWidth: 0,
    paddingRight: Spacing.sm,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  savedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 1,
    marginLeft: Spacing.sm,
  },
  savedPillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
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
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: FontSize.xs,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: Spacing.huge,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xxl,
  },
  suggestionsTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  suggestionChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  messageBubble: {
    marginBottom: Spacing.lg,
    maxWidth: '92%',
  },
  userBubble: {
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  miniIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  bubbleContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  messageText: {
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  recipeCard: {
    marginTop: Spacing.sm,
    maxWidth: '100%',
  },
  swapsCard: {
    marginTop: Spacing.sm,
    maxWidth: '100%',
  },
  swapsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  recipeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    flex: 1,
    paddingTop: 2,
  },
  recipeActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexShrink: 0,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeName: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  recipeDescription: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
  },
  metaChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  recipeSection: {
    marginTop: Spacing.sm,
  },
  recipeSectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  ingredientItem: {
    fontSize: FontSize.sm,
    lineHeight: 22,
    flex: 1,
  },
  stepItem: {
    fontSize: FontSize.sm,
    lineHeight: 22,
    paddingLeft: Spacing.sm,
    marginBottom: 4,
  },
  swapItem: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  swapNames: {
    gap: 4,
    marginBottom: 6,
  },
  swapOld: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    textDecorationLine: 'line-through',
    lineHeight: 20,
  },
  swapNew: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    lineHeight: 20,
  },
  swapReason: {
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  savedListCard: {
    marginBottom: Spacing.md,
  },
  savedListTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  savedListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderBottomWidth: 1,
    paddingVertical: Spacing.sm,
  },
  savedTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  savedMeta: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPanel: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
  },
  editMultiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  editRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  smallEdit: {
    flex: 1,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  editHint: {
    fontSize: FontSize.xs,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    gap: Spacing.sm,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: FontSize.md,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
