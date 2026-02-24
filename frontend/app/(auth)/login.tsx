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
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTheme } from '../../hooks/useTheme';
import { Button } from '../../components/Button';
import { BorderRadius, FontSize, Spacing } from '../../constants/Colors';
import { useAuthStore } from '../../stores/authStore';
import { authApi } from '../../services/api';
import { GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../../constants/Config';

WebBrowser.maybeCompleteAuthSession();

const redirectUri = AuthSession.makeRedirectUri({
  scheme: 'wholefoodlabs',
  path: 'auth',
});

export default function LoginScreen() {
  const theme = useTheme();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; name?: string }>({});
  const { setToken, setUser } = useAuthStore();

  // Google OAuth configuration
  const [googleRequest, googleResponse, googlePromptAsync] = AuthSession.useAuthRequest(
    {
      clientId: Platform.OS === 'ios' ? GOOGLE_IOS_CLIENT_ID : GOOGLE_CLIENT_ID,
      redirectUri,
      scopes: ['profile', 'email'],
      responseType: AuthSession.ResponseType.Token,
    },
    { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' }
  );

  // Handle Google OAuth response
  React.useEffect(() => {
    if (googleResponse?.type === 'success') {
      const { access_token } = googleResponse.params;
      handleGoogleAuth(access_token);
    }
  }, [googleResponse]);

  const handleGoogleAuth = async (accessToken: string) => {
    setLoading(true);
    try {
      // Fetch user info from Google
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userInfo = await userInfoResponse.json();

      // Send to backend
      const result = await authApi.socialAuth({
        provider: 'google',
        token: accessToken,
        name: userInfo.name,
        email: userInfo.email,
      });

      setToken(result.access_token);
      const profile = await authApi.getProfile();
      setUser(profile);
      const needsOnboarding =
        !profile?.flavor_preferences?.length || !profile?.dietary_preferences?.length;
      router.replace((needsOnboarding ? '/(auth)/onboarding' : '/(tabs)') as any);
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleAuth = async () => {
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // Apple provides name and email on first sign-in only
      const firstName = credential.fullName?.givenName || '';
      const lastName = credential.fullName?.familyName || '';
      const name = `${firstName} ${lastName}`.trim() || 'Apple User';
      const email = credential.email || `${credential.user}@privaterelay.appleid.com`;

      // Send to backend
      const result = await authApi.socialAuth({
        provider: 'apple',
        token: credential.identityToken || '',
        name,
        email,
      });

      setToken(result.access_token);
      const profile = await authApi.getProfile();
      setUser(profile);
      const needsOnboarding =
        !profile?.flavor_preferences?.length || !profile?.dietary_preferences?.length;
      router.replace((needsOnboarding ? '/(auth)/onboarding' : '/(tabs)') as any);
    } catch (err: any) {
      if (err.code === 'ERR_CANCELED') {
        // User canceled the sign-in flow
        setLoading(false);
        return;
      }
      setError(err.message || 'Apple sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    const errors: { email?: string; password?: string; name?: string } = {};
    if (isRegister && !name.trim()) errors.name = 'Name is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address';
    if (password.length < 8) errors.password = 'Password must be at least 8 characters';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

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
    if (provider === 'google') {
      // Check if Google OAuth is configured
      const clientId = Platform.OS === 'ios' ? GOOGLE_IOS_CLIENT_ID : GOOGLE_CLIENT_ID;
      if (clientId.includes('YOUR_DEV') || clientId.includes('YOUR_PROD')) {
        Alert.alert(
          'OAuth Not Configured',
          'Google OAuth credentials are not configured. Please follow the OAUTH_SETUP.md guide to set up Google Sign-In.',
          [{ text: 'OK' }]
        );
        return;
      }
      googlePromptAsync();
    } else if (provider === 'apple') {
      // Check if running on iOS
      if (Platform.OS !== 'ios') {
        Alert.alert(
          'Not Available',
          'Apple Sign-In is only available on iOS devices.',
          [{ text: 'OK' }]
        );
        return;
      }
      await handleAppleAuth();
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
                onChangeText={(v) => { setName(v); setFieldErrors((p) => ({ ...p, name: undefined })); }}
                placeholder="Your name"
                placeholderTextColor={theme.textTertiary}
                autoCapitalize="words"
              />
              {fieldErrors.name && <Text style={[styles.fieldError, { color: theme.error }]}>{fieldErrors.name}</Text>}
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
              onChangeText={(v) => { setEmail(v); setFieldErrors((p) => ({ ...p, email: undefined })); }}
              placeholder="you@example.com"
              placeholderTextColor={theme.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {fieldErrors.email && <Text style={[styles.fieldError, { color: theme.error }]}>{fieldErrors.email}</Text>}
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
              onChangeText={(v) => { setPassword(v); setFieldErrors((p) => ({ ...p, password: undefined })); }}
              placeholder="Enter password"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry
            />
            {fieldErrors.password && <Text style={[styles.fieldError, { color: theme.error }]}>{fieldErrors.password}</Text>}
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
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={[styles.socialButton, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                onPress={() => handleSocialAuth('apple')}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-apple" size={20} color={theme.text} />
                <Text style={[styles.socialText, { color: theme.text }]}>Apple</Text>
              </TouchableOpacity>
            )}
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
  fieldError: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    marginTop: 2,
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
