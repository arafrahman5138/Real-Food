import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  useColorScheme,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useThemeStore } from '../../stores/themeStore';
import { BrowseView } from '../../components/MealsTab/BrowseView';
import { MyPlanView } from '../../components/MealsTab/MyPlanView';
import { SavedView } from '../../components/MealsTab/SavedView';
import { GroceryView } from '../../components/MealsTab/GroceryView';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = Spacing.md;
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.xl * 2 - CARD_GAP) / 2;

type MenuOption =
  | 'meals'
  | 'mealprep'
  | 'desserts'
  | 'plan'
  | 'saved'
  | 'grocery';

interface MenuItem {
  id: MenuOption;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  subtitle: string;
  accent: string;
  accentSoft: string;
  glow: string;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'meals', label: 'Meals', icon: 'restaurant-outline', subtitle: 'Full recipes', accent: '#22C55E', accentSoft: 'rgba(34,197,94,0.12)', glow: 'rgba(34,197,94,0.18)' },
  { id: 'mealprep', label: 'Meal Prep', icon: 'layers-outline', subtitle: 'Components', accent: '#14B8A6', accentSoft: 'rgba(20,184,166,0.12)', glow: 'rgba(20,184,166,0.18)' },
  { id: 'desserts', label: 'Desserts', icon: 'ice-cream-outline', subtitle: 'Sweet treats', accent: '#F59E0B', accentSoft: 'rgba(245,158,11,0.12)', glow: 'rgba(245,158,11,0.18)' },
  { id: 'plan', label: 'My Plan', icon: 'calendar-outline', subtitle: 'Weekly plan', accent: '#3B82F6', accentSoft: 'rgba(59,130,246,0.12)', glow: 'rgba(59,130,246,0.18)' },
  { id: 'saved', label: 'Saved Meals', icon: 'bookmark-outline', subtitle: 'Your favorites', accent: '#8B5CF6', accentSoft: 'rgba(139,92,246,0.12)', glow: 'rgba(139,92,246,0.18)' },
  { id: 'grocery', label: 'Grocery', icon: 'cart-outline', subtitle: 'Shopping list', accent: '#10B981', accentSoft: 'rgba(16,185,129,0.12)', glow: 'rgba(16,185,129,0.18)' },
];

/**
 * Eat screen – glassmorphic menu that opens into sub-views.
 *
 * NOTE: This screen intentionally does NOT use ScreenContainer because it
 * manages its own safe-area insets. Wrapping in ScreenContainer would produce
 * a double safe-area offset.
 */
export default function MealsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeView, setActiveView] = useState<MenuOption | null>(null);

  const themeMode = useThemeStore((s) => s.mode);
  const systemScheme = useColorScheme();
  const isDark =
    themeMode === 'dark' || (themeMode === 'system' && systemScheme !== 'light');

  // Handle deep-linking from quick actions
  useEffect(() => {
    if (params.tab) {
      const mapping: Record<string, MenuOption> = {
        browse: 'meals',
        plan: 'plan',
        saved: 'saved',
        grocery: 'grocery',
      };
      if (mapping[params.tab]) setActiveView(mapping[params.tab]);
    }
  }, [params.tab]);

  // ── Sub-view rendering ──
  const renderSubView = () => {
    switch (activeView) {
      case 'meals':
        return <BrowseView initialCategory="meals" initialSubTab="full" />;
      case 'mealprep':
        return <BrowseView initialCategory="meals" initialSubTab="components" />;
      case 'desserts':
        return <BrowseView initialCategory="desserts" />;
      case 'plan':
        return <MyPlanView />;
      case 'saved':
        return <SavedView />;
      case 'grocery':
        return <GroceryView />;
      default:
        return null;
    }
  };

  const activeLabel = activeView === 'mealprep'
    ? 'Meals'
    : (MENU_ITEMS.find((m) => m.id === activeView)?.label ?? '');

  // ── Glassmorphic colours ──
  const cardBg = isDark ? 'rgba(28, 28, 36, 0.55)' : 'rgba(255, 255, 255, 0.65)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const blurTint = isDark ? 'dark' : 'light';
  const blurIntensity = Platform.OS === 'ios' ? (isDark ? 60 : 40) : 80;
  const heroBg = isDark ? 'rgba(28, 34, 30, 0.72)' : 'rgba(240, 250, 244, 0.88)';
  const heroBorder = isDark ? 'rgba(86, 214, 122, 0.16)' : 'rgba(34,197,94,0.10)';

  // ── If a sub-view is selected, show it with a back header ──
  if (activeView) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View
          style={[
            styles.backHeader,
            {
              paddingTop: Math.max(insets.top, Spacing.sm) + 2,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.backBtn,
              {
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.border,
              },
            ]}
            onPress={() => setActiveView(null)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="chevron-back"
              size={28}
              color={theme.primary}
              style={styles.backIcon}
            />
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <BlurView
              intensity={Platform.OS === 'ios' ? (isDark ? 70 : 42) : 100}
              tint={blurTint}
              style={styles.headerCapsule}
            >
              <View
                style={[
                  styles.headerCapsuleTint,
                  {
                    backgroundColor: isDark ? 'rgba(30, 32, 38, 0.74)' : 'rgba(255,255,255,0.82)',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                  },
                ]}
              >
                <View style={[styles.headerAccentDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.headerTitle, { color: theme.text }]}>
                  {activeLabel}
                </Text>
              </View>
            </BlurView>
          </View>
        </View>
        {renderSubView()}
      </View>
    );
  }

  // ── Main Menu ──
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.menuScroll,
          { paddingTop: Math.max(insets.top, Spacing.md) + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View
          style={[
            styles.hero,
            {
              backgroundColor: heroBg,
              borderColor: heroBorder,
            },
          ]}
        >
          <Text style={[styles.heroEyebrow, { color: theme.primary }]}>Kitchen Hub</Text>
          <Text style={[styles.menuTitle, { color: theme.text }]}>Eat</Text>
          <Text style={[styles.menuSubtitle, { color: theme.textSecondary }]}>
            What are you looking for?
          </Text>
        </View>

        {/* Card Grid */}
        <View style={styles.cardGrid}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.75}
              onPress={() => setActiveView(item.id)}
              style={[styles.cardOuter, { width: CARD_WIDTH }]}
            >
              <View
                style={[
                  styles.card,
                  {
                    borderColor: cardBorder,
                    overflow: 'hidden',
                  },
                ]}
              >
                {/* Glassmorphic background */}
                <BlurView
                  intensity={blurIntensity}
                  tint={blurTint}
                  style={StyleSheet.absoluteFill}
                />
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: cardBg },
                  ]}
                />
                {/* Icon circle */}
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: item.accentSoft },
                  ]}
                >
                  <Ionicons name={item.icon} size={26} color={item.accent} />
                </View>

                {/* Labels */}
                <Text style={[styles.cardLabel, { color: theme.text }]}>
                  {item.label}
                </Text>
                <Text
                  style={[styles.cardSubtitle, { color: theme.textSecondary }]}
                >
                  {item.subtitle}
                </Text>

                {/* Arrow */}
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={theme.textTertiary}
                  style={styles.cardArrow}
                />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  /* ── Back header ── */
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  backIcon: {
    transform: [{ translateX: 0 }],
  },
  headerActions: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: Spacing.md,
  },
  headerCapsule: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  headerCapsuleTint: {
    minHeight: 48,
    minWidth: 140,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  headerAccentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  /* ── Menu ── */
  menuScroll: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
  },
  hero: {
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    marginBottom: Spacing.xl,
    overflow: 'hidden',
  },
  heroEyebrow: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  menuTitle: {
    fontSize: FontSize.hero,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: Spacing.xs,
  },
  menuSubtitle: {
    fontSize: FontSize.md,
    fontWeight: '500',
    marginBottom: 0,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  cardOuter: {
    // width set inline
  },
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    minHeight: 150,
    justifyContent: 'center',
    alignItems: 'flex-start',
    // Glassmorphic shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  cardLabel: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  cardArrow: {
    position: 'absolute',
    top: Spacing.lg,
    right: Spacing.lg,
  },
});
