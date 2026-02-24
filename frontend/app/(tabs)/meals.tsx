import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { BrowseView } from '../../components/MealsTab/BrowseView';
import { MyPlanView } from '../../components/MealsTab/MyPlanView';
import { GroceryView } from '../../components/MealsTab/GroceryView';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';

type Tab = 'browse' | 'plan' | 'grocery';

const TABS: { id: Tab; label: string }[] = [
  { id: 'browse', label: 'Browse' },
  { id: 'plan', label: 'My Plan' },
  { id: 'grocery', label: 'Grocery' },
];

/**
 * Meals screen with sub-tabs (Browse / My Plan / Grocery).
 *
 * NOTE: This screen intentionally does NOT use ScreenContainer because it
 * manages its own safe-area insets for the custom sub-tab bar. Wrapping in
 * ScreenContainer would produce a double safe-area offset.
 */
export default function MealsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('plan');

  // Handle deep-linking from quick actions
  useEffect(() => {
    if (params.tab && ['browse', 'plan', 'grocery'].includes(params.tab)) {
      setActiveTab(params.tab as Tab);
    }
  }, [params.tab]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'browse':
        return <BrowseView />;
      case 'plan':
        return <MyPlanView />;
      case 'grocery':
        return <GroceryView />;
      default:
        return <MyPlanView />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Tab Bar */}
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
            paddingTop: Math.max(insets.top, Spacing.md) + Spacing.sm,
          },
        ]}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tab}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? theme.primary : theme.textSecondary,
                    fontWeight: isActive ? '700' : '600',
                  },
                ]}
              >
                {tab.label}
              </Text>
              {isActive && (
                <LinearGradient
                  colors={theme.gradient.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.tabIndicator}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab Content */}
      {renderTabContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    position: 'relative',
  },
  tabLabel: {
    fontSize: FontSize.md,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: BorderRadius.sm,
  },
});
