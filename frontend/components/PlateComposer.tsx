/**
 * PlateComposer — Bottom-sheet-style modal for combining prep components
 * into an assembled plate with a computed MES preview.
 *
 * Rendered inside BrowseView when the user has items on the plate.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { usePlateStore } from '../stores/plateStore';
import { MealMESBadge } from './MealMESBadge';
import { ChronometerSuccessModal } from './ChronometerSuccessModal';
import { nutritionApi } from '../services/api';
import { BorderRadius, FontSize, Spacing } from '../constants/Colors';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PlateComposer({ visible, onClose }: Props) {
  const theme = useTheme();
  const [loggingPlate, setLoggingPlate] = useState(false);
  const [successModal, setSuccessModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  const items = usePlateStore((s) => s.items);
  const combined = usePlateStore((s) => s.combinedNutrition);
  const preview = usePlateStore((s) => s.previewMES);
  const previewLoading = usePlateStore((s) => s.previewLoading);
  const removeItem = usePlateStore((s) => s.removeItem);
  const clearPlate = usePlateStore((s) => s.clearPlate);
  const fetchPreview = usePlateStore((s) => s.fetchPreview);

  // Auto-fetch preview when items change
  useEffect(() => {
    if (visible && items.length > 0) {
      fetchPreview();
    }
  }, [visible, items.length]);

  const handleLogPlate = async () => {
    if (items.length === 0 || loggingPlate) return;
    setLoggingPlate(true);
    try {
      // Log each plate item as a separate nutrition entry
      await Promise.all(
        items.map((item) =>
          nutritionApi.createLog({
            source_type: 'recipe',
            source_id: item.id,
            meal_type: 'meal',
            servings: 1,
            quantity: 1,
          }),
        ),
      );
      const names = items.map((i) => i.title).join(', ');
      clearPlate();
      onClose();
      setSuccessModal({
        visible: true,
        message: `${items.length} item${items.length > 1 ? 's have' : ' has'} been logged: ${names}`,
      });
    } catch (e) {
      console.error('Log plate failed', e);
      Alert.alert('Error', 'Failed to log plate items. Please try again.');
    } finally {
      setLoggingPlate(false);
    }
  };

  const cals = Math.round(Number(combined.calories ?? 0));
  const protein = Math.round(Number(combined.protein ?? combined.protein_g ?? 0));
  const carbs = Math.round(Number(combined.carbs ?? combined.carbs_g ?? 0));
  const fat = Math.round(Number(combined.fat ?? combined.fat_g ?? 0));
  const fiber = Math.round(Number(combined.fiber ?? combined.fiber_g ?? 0));

  return (
    <>
      <ChronometerSuccessModal
        visible={successModal.visible}
        message={successModal.message}
        onPrimary={() => {
          setSuccessModal({ visible: false, message: '' });
        }}
        primaryLabel="Done"
        secondaryLabel="Stay Here"
        onSecondary={() => setSuccessModal({ visible: false, message: '' })}
      />
      <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
          {/* Handle */}
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="restaurant" size={18} color={theme.primary} />
              <Text style={[styles.title, { color: theme.text }]}>Build Your Plate</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.surfaceHighlight }]}>
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
              <Ionicons name="layers-outline" size={40} color={theme.textTertiary} />
              <Text style={{ color: theme.textSecondary, fontSize: FontSize.sm, textAlign: 'center' }}>
                Add prep components from browse to build a full plate.
              </Text>
            </View>
          ) : (
            <>
              {/* Items */}
              <ScrollView style={styles.itemList} showsVerticalScrollIndicator={false}>
                {items.map((item) => (
                  <View
                    key={item.id}
                    style={[styles.itemRow, { backgroundColor: theme.primaryMuted, borderColor: theme.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.itemMeta, { color: theme.textTertiary }]}>
                        {Math.round(Number(item.nutrition.calories ?? 0))} calories  ·  P {Math.round(Number(item.nutrition.protein ?? 0))}g
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeItem(item.id)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close-circle" size={20} color={theme.textTertiary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>

              {/* Combined summary */}
              <View style={[styles.summaryRow, { borderTopColor: theme.border }]}>
                <View style={styles.summaryMacros}>
                  <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                    {cals} calories
                  </Text>
                  <Text style={[styles.summaryLabel, { color: theme.primary }]}>P {protein}g</Text>
                  <Text style={[styles.summaryLabel, { color: theme.accent }]}>C {carbs}g</Text>
                  <Text style={[styles.summaryLabel, { color: theme.info }]}>F {fat}g</Text>
                  <Text style={[styles.summaryLabel, { color: '#22C55E' }]}>Fib {fiber}g</Text>
                </View>

                {/* MES preview */}
                <View style={{ alignItems: 'flex-end' }}>
                  {previewLoading ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : preview ? (
                    <MealMESBadge score={preview.displayScore} tier={preview.displayTier} />
                  ) : null}
                </View>
              </View>

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.logPlateBtn, { backgroundColor: theme.primary }]}
                  onPress={handleLogPlate}
                  disabled={loggingPlate}
                  activeOpacity={0.8}
                >
                  {loggingPlate ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="nutrition-outline" size={18} color="#fff" />
                      <Text style={styles.logPlateBtnText}>Log Plate to Chronometer</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.clearBtn, { borderColor: theme.border }]}
                  onPress={() => { clearPlate(); onClose(); }}
                >
                  <Text style={{ color: theme.textSecondary, fontSize: FontSize.sm, fontWeight: '700' }}>Clear Plate</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  handleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  title: { fontSize: FontSize.lg, fontWeight: '800' },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  itemList: { paddingHorizontal: Spacing.xl, maxHeight: 240 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  itemTitle: { fontSize: FontSize.sm, fontWeight: '600' },
  itemMeta: { fontSize: 11, marginTop: 2 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  summaryMacros: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  summaryLabel: { fontSize: 12, fontWeight: '700' },
  actions: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.sm },
  logPlateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: BorderRadius.md,
  },
  logPlateBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  clearBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
});
