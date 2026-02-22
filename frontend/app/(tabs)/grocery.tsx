import React, { useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SectionList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Card } from '../../components/GradientCard';
import { Button } from '../../components/Button';
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
  estimated_price?: number;
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

const SAMPLE_ITEMS: GroceryItem[] = [
  { name: 'Salmon Fillets', quantity: '2', unit: 'lbs', category: 'protein', checked: false, estimated_price: 14.99 },
  { name: 'Chicken Breast', quantity: '3', unit: 'lbs', category: 'protein', checked: false, estimated_price: 9.99 },
  { name: 'Sweet Potatoes', quantity: '4', unit: '', category: 'produce', checked: false, estimated_price: 3.49 },
  { name: 'Broccoli', quantity: '2', unit: 'heads', category: 'produce', checked: false, estimated_price: 2.99 },
  { name: 'Avocados', quantity: '6', unit: '', category: 'produce', checked: false, estimated_price: 5.99 },
  { name: 'Mixed Berries', quantity: '2', unit: 'pints', category: 'produce', checked: false, estimated_price: 7.98 },
  { name: 'Quinoa', quantity: '1', unit: 'lb', category: 'grains', checked: false, estimated_price: 4.99 },
  { name: 'Steel-Cut Oats', quantity: '1', unit: 'lb', category: 'grains', checked: false, estimated_price: 3.49 },
  { name: 'Sourdough Bread', quantity: '1', unit: 'loaf', category: 'grains', checked: false, estimated_price: 4.99 },
  { name: 'Eggs', quantity: '1', unit: 'dozen', category: 'dairy', checked: false, estimated_price: 4.49 },
  { name: 'Extra Virgin Olive Oil', quantity: '1', unit: 'bottle', category: 'pantry', checked: false, estimated_price: 8.99 },
  { name: 'Raw Honey', quantity: '1', unit: 'jar', category: 'pantry', checked: false, estimated_price: 6.99 },
  { name: 'Chia Seeds', quantity: '1', unit: 'bag', category: 'pantry', checked: false, estimated_price: 5.49 },
  { name: 'Chickpeas', quantity: '2', unit: 'cans', category: 'pantry', checked: false, estimated_price: 2.58 },
  { name: 'Cumin', quantity: '1', unit: 'jar', category: 'spices', checked: false, estimated_price: 3.49 },
  { name: 'Paprika', quantity: '1', unit: 'jar', category: 'spices', checked: false, estimated_price: 3.49 },
];

export default function GroceryScreen() {
  const theme = useTheme();
  const currentPlan = useMealPlanStore((s) => s.currentPlan);
  const completeAction = useGamificationStore((s) => s.completeAction);
  const addXp = useAuthStore((s) => s.addXp);
  const [items, setItems] = useState<GroceryItem[]>(SAMPLE_ITEMS);
  const [loading, setLoading] = useState(false);
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
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, checked: !item.checked } : item
      )
    );

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
  const totalCost = items.reduce((sum, i) => sum + (i.estimated_price || 0), 0);
  const checkedCost = items
    .filter((i) => i.checked)
    .reduce((sum, i) => sum + (i.estimated_price || 0), 0);

  const handleGenerate = async () => {
    if (!currentPlan) return;
    setLoading(true);
    try {
      const result = await groceryApi.generate(currentPlan.id);
      if (result.items?.length > 0) {
        setItems(result.items);
      }
    } catch {}
    setLoading(false);
  };

  return (
    <ScreenContainer padded={false}>
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

      {/* Cost Summary */}
      <View style={{ paddingHorizontal: Spacing.xl }}>
        <Card style={{ marginBottom: Spacing.lg }}>
          <View style={styles.costRow}>
            <View>
              <Text style={[styles.costLabel, { color: theme.textTertiary }]}>Estimated Total</Text>
              <Text style={[styles.costValue, { color: theme.text }]}>${totalCost.toFixed(2)}</Text>
            </View>
            <View style={[styles.costDivider, { backgroundColor: theme.border }]} />
            <View>
              <Text style={[styles.costLabel, { color: theme.textTertiary }]}>Remaining</Text>
              <Text style={[styles.costValue, { color: theme.primary }]}>
                ${(totalCost - checkedCost).toFixed(2)}
              </Text>
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
        </Card>
      </View>

      {/* Grocery Sections */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.category}-${item.name}-${item.originalIndex}`}
        contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: Spacing.huge }}
        stickySectionHeadersEnabled={false}
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
            {item.estimated_price && (
              <Text style={[styles.itemPrice, { color: theme.textSecondary }]}>
                ${item.estimated_price.toFixed(2)}
              </Text>
            )}
          </TouchableOpacity>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
  itemPrice: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
