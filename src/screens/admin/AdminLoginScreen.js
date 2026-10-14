import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { AnimatedLangSwitch } from '../../components/AnimatedLangSwitch';
import { AnimatedThemeSwitch } from '../../components/AnimatedThemeSwitch';

export const AdminLoginScreen = ({ onSwitchToCustomer }) => {
  const { theme, themeMode, toggleTheme, lang, setLang, loginAdmin, loginAdminWithToken } = useApp();

  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-login if opened from Terminal CLI with token or pin parameter
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const search = window.location.search || '';
        const hash = window.location.hash || '';
        let queryString = '';
        if (hash.includes('?')) {
          queryString = hash.split('?')[1] || '';
        } else if (search.startsWith('?')) {
          queryString = search.slice(1);
        }

        if (queryString) {
          const params = new URLSearchParams(queryString);
          const tokenParam = params.get('token');
          const pinParam = params.get('pin');

          if (tokenParam && loginAdminWithToken) {
            setLoading(true);
            loginAdminWithToken(tokenParam).then((res) => {
              setLoading(false);
              // Clean up token from browser URL bar to keep history clean
              if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname + '#admin');
              }
            });
          } else if (pinParam) {
            setPin(pinParam);
            setLoading(true);
            loginAdmin(pinParam).then((res) => {
              setLoading(false);
              if (res.ok && window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname + '#admin');
              }
            });
          }
        }
      } catch (err) {
        // Fallback silently to normal PIN input
      }
    }
  }, [loginAdmin, loginAdminWithToken]);

  const handleSubmit = async () => {
    if (!pin.trim()) {
      setError('Please enter Admin Security PIN');
      return;
    }
    setError('');
    setLoading(true);

    const res = await loginAdmin(pin.trim());
    setLoading(false);
    if (!res.ok) {
      setError(res.error || 'Incorrect Admin PIN. Please check and try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, width: '100%', marginBottom: 12 }}>
          <AnimatedLangSwitch
            lang={lang}
            onToggle={() => setLang(lang === 'km' ? 'en' : 'km')}
            theme={theme}
            size="small"
          />
          <AnimatedThemeSwitch
            themeMode={themeMode}
            onToggle={toggleTheme}
            theme={theme}
            size="small"
          />
        </View>

        <Image source={require('../../../assets/logo.jpg')} style={styles.logo} />

        <Text style={[styles.title, { color: theme.text }]}>
          {lang === 'km' ? '👑 ផ្ទាំងគ្រប់គ្រងរដ្ឋបាល' : '👑 Store Admin Panel'}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>
          {lang === 'km' ? 'សម្ភារៈ · ការគ្រប់គ្រងស្ទូឌីយោ' : 'Somphea Reak · Studio Management'}
        </Text>

        <View style={[styles.backendPill, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
          <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>
            {lang === 'km' ? '🟢 Python Backend & Live SQLite Sync' : '🟢 Python Backend & Live SQLite Sync'}
          </Text>
        </View>

        <View style={styles.inputBox}>
          <Text style={[styles.label, { color: theme.textMuted }]}>
            {lang === 'km' ? 'លេខកូដសម្ងាត់រដ្ឋបាល (PIN)' : 'Admin Security PIN'}
          </Text>

          <View style={styles.pinInputRow}>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
              ]}
              placeholder={lang === 'km' ? 'បញ្ចូលលេខកូដសម្ងាត់រដ្ឋបាល...' : 'Enter Admin Security PIN...'}
              placeholderTextColor={theme.textMuted}
              value={pin}
              onChangeText={(text) => {
                setPin(text);
                setError('');
              }}
              secureTextEntry={!showPin}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPin(!showPin)}
            >
              <Text style={{ fontSize: 16 }}>{showPin ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: theme.primary }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.loginBtnText}>
              {loading
                ? (lang === 'km' ? 'កំពុងផ្ទៀងផ្ទាត់ PIN...' : 'Verifying PIN...')
                : (lang === 'km' ? 'ចូលទៅកាន់ផ្ទាំងគ្រប់គ្រង →' : 'Login to Admin Desk →')}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.customerLink}
          onPress={onSwitchToCustomer || (() => {
            if (typeof window !== 'undefined' && window.open) {
              window.open('http://localhost:8081', '_blank');
            }
          })}
        >
          <Text style={[styles.customerLinkText, { color: theme.textMuted }]}>
            {lang === 'km' ? '🛍️ ចូលមើលហាងទំនិញអតិថិជន ↗' : '🛍️ Visit Customer Storefront ↗'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
    marginBottom: 10,
  },
  backendPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 16,
  },
  inputBox: {
    width: '100%',
  },
  label: {
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 5,
  },
  pinInputRow: {
    position: 'relative',
    marginBottom: 8,
  },
  input: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingRight: 40,
    fontSize: 13,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 10,
  },
  error: {
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 8,
  },
  loginBtn: {
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  customerLink: {
    marginTop: 16,
  },
  customerLinkText: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
