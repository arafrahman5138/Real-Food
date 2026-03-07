/**
 * MealTypePicker — Row of 4 pill buttons for selecting meal type.
 *
 * Smart default based on time of day:
 *   before 11 AM → Breakfast
 *   11 AM – 2 PM → Lunch
 *   2 PM – 5 PM  → Snack
 *   after 5 PM   → Dinner
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { BorderRadius, FontSize, Spacing } from '../constants/Colors';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_OPTIONS: { type: MealType; label: string; icon: string }[] = [
  { type: 'breakfast', label: 'Breakfast', icon: 'sunny-outline' },
  { type: 'lunch', label: 'Lunch', icon: 'restaurant-outline' },
  { type: 'dinner', label: 'Dinner', icon: 'moon-outline' },
  { type: 'snack', label: 'Snack', icon: 'cafe-outline' },
];

/** Returns a sensible default meal type based on current time of day. */
export function getDefaultMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 14) return 'lunch';
  if (hour < 17) return 'snack';
  return 'dinner';
}

interface MealTypePickerProps {
  value: MealType;
  onChange: (type: MealType) => void;
  /** Compact mode uses smaller pills (for modal contexts) */
  compact?: boolean;
}

export function MealTypePicker({ value, onChange, compact = false }: MealTypePickerProps) {
  const theme = useTheme();
  const isDark = theme.text === '#FFFFFF';

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {MEAL_OPTIONS.map((opt) => {
        const active = value === opt.type;
        return (
          <TouchableOpacity
            key={opt.type}
            activeOpacity={0.7}
            onPress={() => onChange(opt.type)}
            style={[
              styles.pill,
              compact && styles.pillCompact,
              active
                ? { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }
                : {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  },
            ]}
          >
            <Ionicons
              name={opt.icon as any}
              size={compact ? 13 : 15}
              color={active ? theme.primary : theme.textTertiary}
            />
            <Text
              style={[
                styles.pillText,
                compact && styles.pillTextCompact,
                { color: active ? theme.primary : theme.textTertiary },
                active && { fontWeight: '700' },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
  },
  containerCompact: {
    gap: 6,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  pillCompact: {
    paddingVertical: 7,
  },
  pillText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  pillTextCompact: {
    fontSize: 10,
  },
});
