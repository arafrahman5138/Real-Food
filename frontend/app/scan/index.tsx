import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenContainer } from '../../components/ScreenContainer';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';
import { wholeFoodScanApi } from '../../services/api';

let CameraView: any = null;
let useCameraPermissions: () => [any, () => Promise<any>] = () => [null, async () => null];

try {
  const expoCamera = require('expo-camera');
  CameraView = expoCamera.CameraView;
  useCameraPermissions = expoCamera.useCameraPermissions;
} catch {
  CameraView = null;
}

type ScanMode = 'barcode' | 'label';

interface WholeFoodResult {
  product_name: string;
  brand?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  source: string;
  score: number;
  tier: 'whole_food' | 'solid' | 'mixed' | 'ultra_processed';
  verdict: string;
  summary: string;
  recommended_action: string;
  highlights: string[];
  concerns: string[];
  reasoning: string[];
  ingredient_count: number;
  nutrition_snapshot: {
    calories: number;
    protein_g: number;
    fiber_g: number;
    sugar_g: number;
    carbs_g: number;
    sodium_mg: number;
  };
}

const TIER_META: Record<WholeFoodResult['tier'], { color: string; bg: string; label: string }> = {
  whole_food: { color: '#16A34A', bg: '#DCFCE7', label: 'Whole-Food Friendly' },
  solid: { color: '#2563EB', bg: '#DBEAFE', label: 'Solid Option' },
  mixed: { color: '#D97706', bg: '#FEF3C7', label: 'Mixed Bag' },
  ultra_processed: { color: '#DC2626', bg: '#FEE2E2', label: 'Heavily Processed' },
};

export default function WholeFoodScanScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<ScanMode>('barcode');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [barcodeValue, setBarcodeValue] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scannedRecently, setScannedRecently] = useState(false);
  const [result, setResult] = useState<WholeFoodResult | null>(null);

  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [fiber, setFiber] = useState('');
  const [sugar, setSugar] = useState('');
  const [carbs, setCarbs] = useState('');
  const [sodium, setSodium] = useState('');
  const [ingredientsPhotoUri, setIngredientsPhotoUri] = useState<string | null>(null);
  const [nutritionPhotoUri, setNutritionPhotoUri] = useState<string | null>(null);

  const analyzeBarcode = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      Alert.alert('Barcode required', 'Enter or scan a barcode first.');
      return;
    }
    setIsAnalyzing(true);
    try {
      const next = await wholeFoodScanApi.analyzeBarcode(trimmed);
      setResult(next);
      setBarcodeValue(trimmed);
    } catch (err: any) {
      Alert.alert('Scan failed', err?.message || 'Unable to analyze that barcode right now.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeLabel = async () => {
    if (!ingredientsText.trim()) {
      Alert.alert('Ingredients required', 'Enter the ingredient list so the app can judge how processed the product is.');
      return;
    }
    setIsAnalyzing(true);
    try {
      const next = await wholeFoodScanApi.analyzeLabel({
        product_name: productName || undefined,
        brand: brand || undefined,
        ingredients_text: ingredientsText,
        calories: calories ? Number(calories) : undefined,
        protein_g: protein ? Number(protein) : undefined,
        fiber_g: fiber ? Number(fiber) : undefined,
        sugar_g: sugar ? Number(sugar) : undefined,
        carbs_g: carbs ? Number(carbs) : undefined,
        sodium_mg: sodium ? Number(sodium) : undefined,
        source: 'label_manual',
      });
      setResult(next);
    } catch (err: any) {
      Alert.alert('Analysis failed', err?.message || 'Unable to score this product right now.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scannedRecently || isAnalyzing) return;
    setScannedRecently(true);
    setBarcodeValue(data);
    await analyzeBarcode(data);
    setTimeout(() => setScannedRecently(false), 1500);
  };

  const selectImage = async (target: 'ingredients' | 'nutrition', source: 'camera' | 'library') => {
    const picker =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.5, mediaTypes: ['images'] })
        : await ImagePicker.launchImageLibraryAsync({ allowsEditing: false, quality: 0.5, mediaTypes: ['images'] });
    if (picker.canceled || !picker.assets?.[0]?.uri) return;
    if (target === 'ingredients') setIngredientsPhotoUri(picker.assets[0].uri);
    else setNutritionPhotoUri(picker.assets[0].uri);
  };

  const tierMeta = result ? TIER_META[result.tier] : null;

  return (
    <ScreenContainer safeArea={false} padded={false}>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.xxxl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          <View style={[styles.heroBadge, { backgroundColor: theme.primaryMuted }]}>
            <Ionicons name="scan-outline" size={14} color={theme.primary} />
            <Text style={[styles.heroBadgeText, { color: theme.primary }]}>Whole Food Scan</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Scan a packaged food and see if it fits a whole-food lifestyle.</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Barcode scan is live. Label check uses the ingredient list and nutrition facts you enter, with optional photos for reference.
          </Text>
        </View>

        <View style={[styles.segmented, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          {([
            { key: 'barcode', label: 'Barcode' },
            { key: 'label', label: 'Label Check' },
          ] as const).map((item) => {
            const isActive = mode === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setMode(item.key)}
                activeOpacity={0.8}
                style={[
                  styles.segment,
                  { backgroundColor: isActive ? theme.primaryMuted : 'transparent' },
                ]}
              >
                <Text style={[styles.segmentText, { color: isActive ? theme.primary : theme.textSecondary }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {mode === 'barcode' ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Scan barcode</Text>
            <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
              Point your camera at the barcode, or type it in manually if scanning is unreliable.
            </Text>

            <View style={[styles.cameraFrame, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}>
              {CameraView && cameraPermission?.granted ? (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
                  onBarcodeScanned={handleBarcodeScanned}
                />
              ) : (
                <View style={styles.cameraFallback}>
                  <Ionicons name="barcode-outline" size={30} color={theme.primary} />
                  <Text style={[styles.cameraFallbackTitle, { color: theme.text }]}>
                    {CameraView ? 'Camera access needed' : 'Camera scanner unavailable'}
                  </Text>
                  <Text style={[styles.cameraFallbackText, { color: theme.textSecondary }]}>
                    {CameraView
                      ? 'Grant camera permission to scan barcodes directly.'
                      : 'This build does not include the native camera module yet. You can still enter a barcode manually below.'}
                  </Text>
                  {CameraView ? (
                    <TouchableOpacity
                      onPress={requestCameraPermission}
                      activeOpacity={0.8}
                      style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                    >
                      <Text style={styles.primaryBtnText}>Enable Camera</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
              {CameraView && cameraPermission?.granted ? (
                <View pointerEvents="none" style={[styles.scanOverlay, { borderColor: 'rgba(255,255,255,0.85)' }]} />
              ) : null}
            </View>

            <View style={styles.manualRow}>
              <TextInput
                value={barcodeValue}
                onChangeText={setBarcodeValue}
                placeholder="Enter barcode"
                placeholderTextColor={theme.textTertiary}
                keyboardType="number-pad"
                style={[styles.input, styles.flexInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
              />
              <TouchableOpacity
                onPress={() => analyzeBarcode(barcodeValue)}
                activeOpacity={0.8}
                style={[styles.primaryBtn, { backgroundColor: theme.primary, minWidth: 110 }]}
              >
                {isAnalyzing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Analyze</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Check a label</Text>
            <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
              Add the ingredient list and nutrition facts. You can also attach photos for reference while you enter the label text.
            </Text>

            <View style={styles.photoRow}>
              {[
                { key: 'ingredients', label: 'Ingredients Photo', uri: ingredientsPhotoUri },
                { key: 'nutrition', label: 'Nutrition Photo', uri: nutritionPhotoUri },
              ].map((item) => (
                <View key={item.key} style={[styles.photoCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  {item.uri ? (
                    <Image source={{ uri: item.uri }} style={styles.photoPreview} />
                  ) : (
                    <View style={styles.photoEmpty}>
                      <Ionicons name="camera-outline" size={22} color={theme.primary} />
                    </View>
                  )}
                  <Text style={[styles.photoLabel, { color: theme.text }]}>{item.label}</Text>
                  <View style={styles.photoActions}>
                    <TouchableOpacity
                      onPress={() => selectImage(item.key as 'ingredients' | 'nutrition', 'camera')}
                      style={[styles.photoBtn, { backgroundColor: theme.primaryMuted }]}
                    >
                      <Ionicons name="camera-outline" size={13} color={theme.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => selectImage(item.key as 'ingredients' | 'nutrition', 'library')}
                      style={[styles.photoBtn, { backgroundColor: theme.surfaceHighlight }]}
                    >
                      <Ionicons name="images-outline" size={13} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            <TextInput
              value={productName}
              onChangeText={setProductName}
              placeholder="Product name (optional)"
              placeholderTextColor={theme.textTertiary}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
            />
            <TextInput
              value={brand}
              onChangeText={setBrand}
              placeholder="Brand (optional)"
              placeholderTextColor={theme.textTertiary}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
            />
            <TextInput
              value={ingredientsText}
              onChangeText={setIngredientsText}
              placeholder="Paste or type the ingredient list"
              placeholderTextColor={theme.textTertiary}
              multiline
              style={[styles.textArea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
            />

            <View style={styles.nutritionGrid}>
              {[
                { label: 'Calories', value: calories, setter: setCalories },
                { label: 'Protein (g)', value: protein, setter: setProtein },
                { label: 'Fiber (g)', value: fiber, setter: setFiber },
                { label: 'Sugar (g)', value: sugar, setter: setSugar },
                { label: 'Carbs (g)', value: carbs, setter: setCarbs },
                { label: 'Sodium (mg)', value: sodium, setter: setSodium },
              ].map((field) => (
                <TextInput
                  key={field.label}
                  value={field.value}
                  onChangeText={field.setter}
                  placeholder={field.label}
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="decimal-pad"
                  style={[styles.input, styles.gridInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
                />
              ))}
            </View>

            <View style={[styles.note, { backgroundColor: theme.infoMuted }]}>
              <Ionicons name="information-circle-outline" size={15} color={theme.info} />
              <Text style={[styles.noteText, { color: theme.textSecondary }]}>
                Photos are for reference right now. Automatic image reading is not enabled yet, so enter the visible label text for analysis.
              </Text>
            </View>

            <TouchableOpacity
              onPress={analyzeLabel}
              activeOpacity={0.8}
              style={[styles.primaryBtn, { backgroundColor: theme.primary, marginTop: Spacing.md }]}
            >
              {isAnalyzing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Score This Product</Text>}
            </TouchableOpacity>
          </View>
        )}

        {result && tierMeta && (
          <View style={[styles.resultCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.resultTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultName, { color: theme.text }]}>{result.product_name}</Text>
                {!!result.brand && <Text style={[styles.resultBrand, { color: theme.textSecondary }]}>{result.brand}</Text>}
              </View>
              <View style={[styles.scoreRing, { borderColor: tierMeta.color + '55' }]}>
                <Text style={[styles.scoreValue, { color: tierMeta.color }]}>{Math.round(result.score)}</Text>
              </View>
            </View>

            {result.image_url ? (
              <Image source={{ uri: result.image_url }} style={styles.productImage} />
            ) : null}

            <View style={[styles.tierPill, { backgroundColor: tierMeta.bg }]}>
              <Text style={[styles.tierPillText, { color: tierMeta.color }]}>{tierMeta.label}</Text>
            </View>

            <Text style={[styles.resultVerdict, { color: theme.text }]}>{result.verdict}</Text>
            <Text style={[styles.resultSummary, { color: theme.textSecondary }]}>{result.summary}</Text>

            <View style={styles.snapshotRow}>
              {[
                `${result.ingredient_count} ingredients`,
                `${Math.round(result.nutrition_snapshot.sugar_g || 0)}g sugar`,
                `${Math.round(result.nutrition_snapshot.fiber_g || 0)}g fiber`,
              ].map((item) => (
                <View key={item} style={[styles.snapshotPill, { backgroundColor: theme.surfaceElevated }]}>
                  <Text style={[styles.snapshotText, { color: theme.textSecondary }]}>{item}</Text>
                </View>
              ))}
            </View>

            {result.highlights.length > 0 && (
              <View style={styles.listSection}>
                <Text style={[styles.listTitle, { color: '#16A34A' }]}>What looks good</Text>
                {result.highlights.map((item) => (
                  <View key={item} style={styles.listRow}>
                    <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
                    <Text style={[styles.listText, { color: theme.text }]}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            {result.concerns.length > 0 && (
              <View style={styles.listSection}>
                <Text style={[styles.listTitle, { color: '#D97706' }]}>What to watch</Text>
                {result.concerns.map((item) => (
                  <View key={item} style={styles.listRow}>
                    <Ionicons name="alert-circle" size={15} color="#D97706" />
                    <Text style={[styles.listText, { color: theme.text }]}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={[styles.actionBox, { backgroundColor: theme.primaryMuted }]}>
              <Ionicons name="leaf-outline" size={16} color={theme.primary} />
              <Text style={[styles.actionText, { color: theme.text }]}>{result.recommended_action}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 22,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  heroBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: BorderRadius.full,
  },
  segmentText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardSub: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  cameraFrame: {
    height: 250,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: Spacing.md,
    position: 'relative',
  },
  cameraFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  cameraFallbackTitle: {
    marginTop: Spacing.sm,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  cameraFallbackText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: Spacing.md,
  },
  scanOverlay: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: '36%',
    height: 72,
    borderWidth: 2,
    borderRadius: 16,
  },
  manualRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  flexInput: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 120,
    textAlignVertical: 'top',
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  primaryBtn: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  photoRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  photoCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: Spacing.sm,
  },
  photoEmpty: {
    height: 92,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  photoPreview: {
    width: '100%',
    height: 92,
    borderRadius: 14,
    marginBottom: 8,
  },
  photoLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    marginBottom: 8,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 8,
  },
  photoBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  gridInput: {
    width: '48%',
  },
  note: {
    flexDirection: 'row',
    gap: 8,
    padding: Spacing.sm,
    borderRadius: 16,
    marginTop: Spacing.xs,
  },
  noteText: {
    flex: 1,
    fontSize: FontSize.xs,
    lineHeight: 17,
  },
  resultCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: Spacing.lg,
  },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  resultName: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  resultBrand: {
    marginTop: 4,
    fontSize: FontSize.sm,
  },
  scoreRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontSize: 30,
    fontWeight: '800',
  },
  productImage: {
    width: '100%',
    height: 180,
    borderRadius: 18,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    resizeMode: 'contain',
    backgroundColor: '#fff',
  },
  tierPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  tierPillText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  resultVerdict: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    marginBottom: 4,
  },
  resultSummary: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  snapshotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Spacing.md,
  },
  snapshotPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  snapshotText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  listSection: {
    marginTop: Spacing.lg,
    gap: 8,
  },
  listTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  listText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  actionBox: {
    flexDirection: 'row',
    gap: 8,
    padding: Spacing.md,
    borderRadius: 18,
    marginTop: Spacing.lg,
    alignItems: 'flex-start',
  },
  actionText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: 20,
    fontWeight: '600',
  },
});
