import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { Button } from '../../components/Button';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';
import { useAuthStore } from '../../stores/authStore';
import { authApi } from '../../services/api';

export default function LoginScreen() {
  const theme = useTheme();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setToken, setUser } = useAuthStore();

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      let result;
      if (isRegister) {
        result = await authApi.register({ email, password, name });
      } else {
        result = await authApi.login({ email, password });
      }
      setToken(result.access_token);
      const profile = await authApi.getProfile();
      setUser(profile);
      const needsOnboarding =
        !profile?.flavor_preferences?.length || !profile?.dietary_preferences?.length;
      router.replace((needsOnboarding ? '/(auth)/onboarding' : '/(tabs)') as any);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: string) => {
    setError('');
    setLoading(true);
    try {
      // Temporary social auth flow: backend issues a real JWT so protected APIs work.
      const socialEmail = `${provider}.demo@wholefoodlabs.com`;
      const result = await authApi.socialAuth({
        provider,
        token: 'dev-social-token',
        name: provider === 'google' ? 'Google User' : 'Apple User',
        email: socialEmail,
      });
      setToken(result.access_token);
      const profile = await authApi.getProfile();
      setUser(profile);
      const needsOnboarding =
        !profile?.flavor_preferences?.length || !profile?.dietary_preferences?.length;
      router.replace((needsOnboarding ? '/(auth)/onboarding' : '/(tabs)') as any);
    } catch (err: any) {
      setError(err.message || 'Social sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroSection}>
          <LinearGradient
            colors={theme.gradient.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <Ionicons name="leaf" size={48} color="#FFFFFF" />
          </LinearGradient>
          <Text style={[styles.appName, { color: theme.text }]}>WholeFoodLabs</Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>
            Eat real. Feel amazing.
          </Text>
        </View>

        <View style={styles.formSection}>
          <Text style={[styles.formTitle, { color: theme.text }]}>
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </Text>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: theme.errorMuted }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          ) : null}

          {isRegister && (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Full Name</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.surfaceElevated,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={theme.textTertiary}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Email</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.surfaceElevated,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Password</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.surfaceElevated,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry
            />
          </View>

          <Button
            title={isRegister ? 'Create Account' : 'Sign In'}
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            size="lg"
            style={{ marginTop: Spacing.md }}
          />

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textTertiary }]}>or continue with</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          <View style={styles.socialRow}>
            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
              onPress={() => handleSocialAuth('google')}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-google" size={20} color={theme.text} />
              <Text style={[styles.socialText, { color: theme.text }]}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
              onPress={() => handleSocialAuth('apple')}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-apple" size={20} color={theme.text} />
              <Text style={[styles.socialText, { color: theme.text }]}>Apple</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => setIsRegister(!isRegister)} style={styles.toggleAuth}>
            <Text style={[styles.toggleText, { color: theme.textSecondary }]}>
              {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={{ color: theme.primary, fontWeight: '700' }}>
                {isRegister ? 'Sign In' : 'Sign Up'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.huge,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl + 8,
  },
  heroGradient: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  appName: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: FontSize.md,
    marginTop: Spacing.xs,
  },
  formSection: {
    gap: Spacing.md,
  },
  formTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  errorBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  errorText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  inputGroup: {
    gap: Spacing.xs + 2,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  input: {
    height: 52,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    fontSize: FontSize.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: FontSize.sm,
  },
  socialRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 52,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  socialText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  toggleAuth: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  toggleText: {
    fontSize: FontSize.md,
  },
});
