import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useMealPlanStore } from '../../stores/mealPlanStore';
import { useGamificationStore } from '../../stores/gamificationStore';
import { useAuthStore } from '../../stores/authStore';
import { groceryApi } from '../../services/api';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

interface GroceryItem {
  name: string;
  quantity: string;
  unit: string;
  category: string;
  checked: boolean;
}

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  produce: 'leaf',
  protein: 'fish',
  dairy: 'water',
  grains: 'nutrition',
  pantry: 'cube',
  spices: 'flame',
  other: 'ellipsis-horizontal',
};

export function GroceryView() {
  const theme = useTheme();
  const currentPlan = useMealPlanStore((s) => s.currentPlan);
  const completeAction = useGamificationStore((s) => s.completeAction);
  const addXp = useAuthStore((s) => s.addXp);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const GROCERY_CHECKED_KEY = `grocery_checked_${currentPlan?.id || 'none'}`;

  const loadGrocery = async () => {
    setLoading(true);
    setError(null);
    try {
      let fetchedItems: GroceryItem[] = [];
      if (currentPlan?.id) {
        const generated = await groceryApi.generate(currentPlan.id);
        fetchedItems = generated?.items || [];
      } else {
        const existing = await groceryApi.getCurrent();
        fetchedItems = existing?.items || [];
      }

      // Restore checked state from AsyncStorage
      try {
        const saved = await AsyncStorage.getItem(GROCERY_CHECKED_KEY);
        if (saved) {
          const checkedNames: string[] = JSON.parse(saved);
          fetchedItems = fetchedItems.map((item) => ({
            ...item,
            checked: checkedNames.includes(item.name),
          }));
        }
      } catch {}

      setItems(fetchedItems);
    } catch {
      setError('Unable to load grocery list.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGrocery();
  }, [currentPlan?.id]);

  const [questToast, setQuestToast] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  const showQuestToast = (message: string) => {
    setQuestToast(message);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setQuestToast(null));
  };

  const toggleItem = (index: number) => {
    const wasChecked = items[index]?.checked;
    const updated = items.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item
    );
    setItems(updated);

    // Persist checked names
    const checkedNames = updated.filter((i) => i.checked).map((i) => i.name);
    AsyncStorage.setItem(GROCERY_CHECKED_KEY, JSON.stringify(checkedNames)).catch(() => {});

    if (!wasChecked) {
      const questResult = completeAction('grocery', 1);
      if (questResult.gainedXp > 0) {
        addXp(questResult.gainedXp);
        showQuestToast(`Quest complete · +${questResult.gainedXp} XP`);
      }
    }
  };

  const categories = [...new Set(items.map((i) => i.category))];
  const sections = categories.map((cat) => ({
    title: cat.charAt(0).toUpperCase() + cat.slice(1),
    icon: CATEGORY_ICONS[cat] || CATEGORY_ICONS.other,
    data: items
      .map((item, index) => ({ ...item, originalIndex: index }))
      .filter((item) => item.category === cat),
  }));

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
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
                  translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }),
                },
              ],
            },
          ]}
        >
          <Ionicons name="trophy" size={14} color="#fff" />
          <Text style={styles.questToastText}>{questToast}</Text>
        </Animated.View>
      ) : null}

      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: Spacing.xl }]}>
        <Text style={[styles.title, { color: theme.text }]}>Grocery List</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {checkedCount}/{items.length} items collected
        </Text>
      </View>

      {/* Progress Summary */}
      <View style={{ paddingHorizontal: Spacing.xl }}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.costRow}>
            <View>
              <Text style={[styles.costLabel, { color: theme.textTertiary }]}>Items</Text>
              <Text style={[styles.costValue, { color: theme.text }]}>{items.length}</Text>
            </View>
            <View style={[styles.costDivider, { backgroundColor: theme.border }]} />
            <View>
              <Text style={[styles.costLabel, { color: theme.textTertiary }]}>Progress</Text>
              <Text style={[styles.costValue, { color: theme.accent }]}>
                {items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0}%
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={[styles.progressBg, { backgroundColor: theme.surfaceHighlight }]}>
            <LinearGradient
              colors={theme.gradient.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.progressFill,
                {
                  width: items.length > 0
                    ? `${(checkedCount / items.length) * 100}%`
                    : '0%',
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Grocery Sections */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : null}

      {error ? (
        <View style={{ alignItems: 'center', paddingTop: Spacing.huge, gap: Spacing.sm, paddingHorizontal: Spacing.xl }}>
          <Ionicons name="cloud-offline-outline" size={36} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, fontSize: FontSize.sm, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity
            onPress={loadGrocery}
            style={{ backgroundColor: theme.primaryMuted, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full }}
          >
            <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.category}-${item.name}-${item.originalIndex}`}
        contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: Spacing.huge }}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadGrocery();
              setRefreshing(false);
            }}
            tintColor={theme.primary}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Ionicons
              name={section.icon as keyof typeof Ionicons.glyphMap}
              size={16}
              color={theme.primary}
            />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
            <Text style={[styles.sectionCount, { color: theme.textTertiary }]}>
              {section.data.length}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => toggleItem(item.originalIndex)}
            style={[
              styles.groceryItem,
              {
                backgroundColor: item.checked ? theme.primaryMuted : theme.surface,
                borderColor: item.checked ? theme.primary : theme.border,
              },
            ]}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: item.checked ? theme.primary : theme.borderLight,
                  backgroundColor: item.checked ? theme.primary : 'transparent',
                },
              ]}
            >
              {item.checked && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </View>
            <View style={styles.itemInfo}>
              <Text
                style={[
                  styles.itemName,
                  {
                    color: item.checked ? theme.textTertiary : theme.text,
                    textDecorationLine: item.checked ? 'line-through' : 'none',
                  },
                ]}
              >
                {item.name}
              </Text>
              <Text style={[styles.itemQty, { color: theme.textTertiary }]}>
                {item.quantity} {item.unit}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
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
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  card: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  costLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    textAlign: 'center',
  },
  costValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    textAlign: 'center',
  },
  costDivider: {
    width: 1,
    height: 36,
  },
  progressBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  loadingWrap: {
    position: 'absolute',
    top: 140,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  sectionCount: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  groceryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  itemQty: {
    fontSize: FontSize.sm,
    marginTop: 1,
  },
});
