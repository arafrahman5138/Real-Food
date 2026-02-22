import React from 'react';
import { View, StyleSheet, StatusBar, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../constants/Colors';

interface ScreenContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  safeArea?: boolean;
}

export function ScreenContainer({
  children,
  style,
  padded = true,
  safeArea = true,
}: ScreenContainerProps) {
  const theme = useTheme();

  const Container = safeArea ? SafeAreaView : View;

  return (
    <Container
      style={[
        styles.container,
        { backgroundColor: theme.background },
        padded && styles.padded,
        style,
      ]}
    >
      <StatusBar barStyle="light-content" />
      {children}
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: Spacing.xl,
  },
});
