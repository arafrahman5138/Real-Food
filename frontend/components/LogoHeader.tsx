import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

export default function LogoHeader() {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="leaf" size={20} color="#22C55E" />
      </View>
      <Text style={[styles.text, { color: theme.text }]}>WholeFoodLabs</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
});
