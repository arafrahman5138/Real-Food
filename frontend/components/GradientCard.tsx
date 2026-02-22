import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Spacing } from '../constants/Colors';
import { useTheme } from '../hooks/useTheme';

interface GradientCardProps {
  children: React.ReactNode;
  gradient?: readonly [string, string, ...string[]];
  style?: StyleProp<ViewStyle>;
  padding?: number;
}

export function GradientCard({ children, gradient, style, padding }: GradientCardProps) {
  const theme = useTheme();
  const colors = gradient || (theme.gradient.surface as readonly [string, string, ...string[]]);

  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { padding: padding ?? Spacing.lg }, style as ViewStyle]}
    >
      {children}
    </LinearGradient>
  );
}

export function Card({
  children,
  style,
  padding,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  onPress?: () => void;
}) {
  const theme = useTheme();

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card.background,
          borderColor: theme.card.border,
          borderWidth: 1,
          padding: padding ?? Spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
});
