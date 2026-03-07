/**
 * MetabolicOnboarding — 3-step metabolic profile collection screen.
 *
 * Step 1: Body & Goals (required)
 * Step 2: Body Composition (optional, skippable)
 * Step 3: Health Context (optional, skippable)
 *
 * Uses U.S. units (lbs, ft/in). Grams for macros.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ScreenContainer } from '../components/ScreenContainer';
import { useTheme } from '../hooks/useTheme';
import { useMetabolicBudgetStore } from '../stores/metabolicBudgetStore';
import { FontSize, Spacing, BorderRadius } from '../constants/Colors';

const TOTAL_STEPS = 3;

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Mostly sedentary', desc: 'Desk job, minimal exercise' },
  { value: 'moderate', label: 'Lightly active', desc: '1-3 light workouts/week' },
  { value: 'active', label: 'Regularly active', desc: '3-5 workouts/week' },
  { value: 'athletic', label: 'Athlete / daily training', desc: 'Intense daily exercise' },
];

const GOAL_OPTIONS = [
  { value: 'fat_loss', label: 'Lose body fat', icon: 'trending-down-outline' as const },
  { value: 'muscle_gain', label: 'Build muscle', icon: 'barbell-outline' as const },
  { value: 'maintenance', label: 'Maintain & optimize', icon: 'shield-checkmark-outline' as const },
  { value: 'metabolic_reset', label: 'Metabolic reset / health', icon: 'heart-outline' as const },
];

const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

export default function MetabolicOnboardingScreen() {
  const theme = useTheme();
  const saveProfile = useMetabolicBudgetStore((s) => s.saveProfile);
  const fetchBudget = useMetabolicBudgetStore((s) => s.fetchBudget);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — Body & Goals
  const [weightLb, setWeightLb] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<string | null>(null);
  const [activityLevel, setActivityLevel] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);

  // Step 2 — Body Composition
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [bodyFatMethod, setBodyFatMethod] = useState<'estimate' | 'dexa'>('estimate');

  // Step 3 — Health Context
  const [insulinResistant, setInsulinResistant] = useState(false);
  const [prediabetes, setPrediabetes] = useState(false);
  const [type2Diabetes, setType2Diabetes] = useState(false);

  const step1Valid = useMemo(() => {
    return (
      weightLb.trim() !== '' &&
      heightFt.trim() !== '' &&
      age.trim() !== '' &&
      sex !== null &&
      activityLevel !== null &&
      goal !== null
    );
  }, [weightLb, heightFt, age, sex, activityLevel, goal]);

  const handleT2DToggle = (on: boolean) => {
    setType2Diabetes(on);
    if (on) setInsulinResistant(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: Record<string, any> = {
        weight_lb: parseFloat(weightLb),
        height_ft: parseInt(heightFt),
        height_in: parseFloat(heightIn || '0'),
        age: parseInt(age),
        sex,
        activity_level: activityLevel,
        goal,
        onboarding_step_completed: step,
      };

      // Optional step 2
      if (bodyFatPct.trim()) {
        data.body_fat_pct = parseFloat(bodyFatPct);
        data.body_fat_method = bodyFatMethod;
      }

      // Optional step 3
      data.insulin_resistant = insulinResistant;
      data.prediabetes = prediabetes;
      data.type_2_diabetes = type2Diabetes;

      await saveProfile(data);
      await fetchBudget();

      Alert.alert(
        'Profile Saved',
        'Your metabolic scoring is now personalized.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () => {
    if (step > 1) setStep((s) => s - 1);
    else router.back();
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* ── Progress bar ── */}
        <View style={[styles.progressRow, { backgroundColor: theme.background }]}>
          <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: Spacing.md }}>
            <View style={[styles.progressBg, { backgroundColor: theme.surfaceHighlight }]}>
              <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%`, backgroundColor: theme.primary }]} />
            </View>
          </View>
          <Text style={[styles.stepLabel, { color: theme.textSecondary }]}>
            Step {step} of {TOTAL_STEPS}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* ═══════════════════════════════════════════
              STEP 1 — Body & Goals
             ═══════════════════════════════════════════ */}
          {step === 1 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Body & Goals</Text>
              <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
                Help us personalize your metabolic scoring.
              </Text>

              {/* Weight */}
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Weight</Text>
              <View style={[styles.inputRow, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="165"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="numeric"
                  value={weightLb}
                  onChangeText={setWeightLb}
                />
                <Text style={[styles.unit, { color: theme.textTertiary }]}>lbs</Text>
              </View>

              {/* Height */}
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Height</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[styles.inputRow, { flex: 1, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="5"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="numeric"
                    value={heightFt}
                    onChangeText={setHeightFt}
                  />
                  <Text style={[styles.unit, { color: theme.textTertiary }]}>ft</Text>
                </View>
                <View style={[styles.inputRow, { flex: 1, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="7"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="numeric"
                    value={heightIn}
                    onChangeText={setHeightIn}
                  />
                  <Text style={[styles.unit, { color: theme.textTertiary }]}>in</Text>
                </View>
              </View>

              {/* Age */}
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Age</Text>
              <View style={[styles.inputRow, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="30"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="numeric"
                  value={age}
                  onChangeText={setAge}
                />
                <Text style={[styles.unit, { color: theme.textTertiary }]}>years</Text>
              </View>

              {/* Sex */}
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Sex</Text>
              <View style={styles.chipRow}>
                {SEX_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setSex(opt.value)}
                    style={[
                      styles.chip,
                      { borderColor: theme.border },
                      sex === opt.value && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: sex === opt.value ? '#fff' : theme.text },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Activity Level */}
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Activity Level</Text>
              {ACTIVITY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setActivityLevel(opt.value)}
                  style={[
                    styles.optionRow,
                    { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                    activityLevel === opt.value && { borderColor: theme.primary, backgroundColor: theme.primary + '15' },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, { color: theme.text }]}>{opt.label}</Text>
                    <Text style={[styles.optionDesc, { color: theme.textTertiary }]}>{opt.desc}</Text>
                  </View>
                  {activityLevel === opt.value && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
                </TouchableOpacity>
              ))}

              {/* Goal */}
              <Text style={[styles.fieldLabel, { color: theme.text, marginTop: Spacing.md }]}>Goal</Text>
              <View style={styles.goalGrid}>
                {GOAL_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setGoal(opt.value)}
                    style={[
                      styles.goalCard,
                      { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                      goal === opt.value && { borderColor: theme.primary, backgroundColor: theme.primary + '15' },
                    ]}
                  >
                    <Ionicons name={opt.icon} size={22} color={goal === opt.value ? theme.primary : theme.textSecondary} />
                    <Text
                      style={[styles.goalLabel, { color: goal === opt.value ? theme.primary : theme.text }]}
                      numberOfLines={2}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ═══════════════════════════════════════════
              STEP 2 — Body Composition
             ═══════════════════════════════════════════ */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Body Composition</Text>
              <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
                Optional — helps fine-tune your metabolic sensitivity multiplier (ISM).
              </Text>

              <Text style={[styles.fieldLabel, { color: theme.text }]}>Body Fat %</Text>
              <View style={[styles.inputRow, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="18"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="numeric"
                  value={bodyFatPct}
                  onChangeText={setBodyFatPct}
                />
                <Text style={[styles.unit, { color: theme.textTertiary }]}>%</Text>
              </View>

              <Text style={[styles.hintText, { color: theme.textTertiary }]}>
                Not sure? You can skip this. Your scoring will default to average sensitivity.
              </Text>

              {bodyFatPct.trim() !== '' && (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.text, marginTop: Spacing.lg }]}>How was this measured?</Text>
                  <View style={styles.chipRow}>
                    {[
                      { value: 'estimate' as const, label: 'Estimate / visual' },
                      { value: 'dexa' as const, label: 'DEXA / lab test' },
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => setBodyFatMethod(opt.value)}
                        style={[
                          styles.chip,
                          { borderColor: theme.border },
                          bodyFatMethod === opt.value && { backgroundColor: theme.primary, borderColor: theme.primary },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: bodyFatMethod === opt.value ? '#fff' : theme.text }]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}

          {/* ═══════════════════════════════════════════
              STEP 3 — Health Context
             ═══════════════════════════════════════════ */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Health Context</Text>
              <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
                Optional — adjusts scoring thresholds for metabolic risk factors.
              </Text>

              <ToggleRow
                label="I have insulin resistance"
                value={insulinResistant}
                onToggle={setInsulinResistant}
                theme={theme}
              />
              <ToggleRow
                label="I have prediabetes"
                value={prediabetes}
                onToggle={setPrediabetes}
                theme={theme}
              />
              <ToggleRow
                label="I have Type 2 diabetes"
                value={type2Diabetes}
                onToggle={handleT2DToggle}
                theme={theme}
              />

              <Text style={[styles.disclaimer, { color: theme.textTertiary }]}>
                Self-reported — used only to personalize scoring. Not medical advice.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* ── Footer buttons ── */}
        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          {step < TOTAL_STEPS ? (
            <>
              {step > 1 && (
                <TouchableOpacity onPress={() => goNext()} style={[styles.skipBtn]}>
                  <Text style={[styles.skipText, { color: theme.textSecondary }]}>Skip</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={goNext}
                disabled={step === 1 && !step1Valid}
                style={{ flex: 1 }}
              >
                <LinearGradient
                  colors={step === 1 && !step1Valid ? [theme.surfaceHighlight, theme.surfaceHighlight] : [theme.primary, theme.primary + 'DD']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={handleSave} disabled={saving} style={{ flex: 1 }}>
              <LinearGradient
                colors={[theme.primary, theme.primary + 'DD']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtn}
              >
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save Profile'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

// ── Toggle row subcomponent ──
function ToggleRow({ label, value, onToggle, theme }: { label: string; value: boolean; onToggle: (v: boolean) => void; theme: any }) {
  return (
    <TouchableOpacity
      onPress={() => onToggle(!value)}
      activeOpacity={0.7}
      style={[styles.toggleRow, { borderColor: theme.border, backgroundColor: value ? theme.primary + '12' : theme.surfaceElevated }]}
    >
      <Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text>
      <View style={[styles.toggleSwitch, { backgroundColor: value ? theme.primary : theme.surfaceHighlight }]}>
        <View style={[styles.toggleKnob, { transform: [{ translateX: value ? 16 : 0 }] }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    paddingTop: Spacing.xxl,
  },
  progressBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  stepLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.huge,
  },
  stepContainer: {
    gap: 4,
  },
  stepTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginTop: Spacing.md,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  unit: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  optionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  optionDesc: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    marginTop: 2,
  },
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  goalCard: {
    width: '47%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 6,
    minHeight: 80,
  },
  goalLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textAlign: 'center',
  },
  hintText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  disclaimer: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    fontStyle: 'italic',
    marginTop: Spacing.lg,
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  toggleLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  toggleSwitch: {
    width: 40,
    height: 24,
    borderRadius: 12,
    padding: 2,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  skipBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  skipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
