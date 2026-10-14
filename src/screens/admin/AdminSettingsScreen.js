import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { ApiClient } from '../../api/client';

export const AdminSettingsScreen = () => {
  const { theme, lang, settings, setSettings, adminToken, refreshCatalog, showToast, logoutAdmin } = useApp();

  const [siteTitle, setSiteTitle] = useState(settings.site_title || 'សម្ភារៈ - Somphea Reak');
  const [subtitle, setSubtitle] = useState(settings.subtitle || 'Premium Studio');
  const [tagline, setTagline] = useState(settings.tagline || 'Cambodia Kingdom of Wonder');
  const [announcement, setAnnouncement] = useState(settings.announcement || '');
  const [sellerTelegram, setSellerTelegram] = useState(settings.seller_telegram || 'sompheareak');
  const [deliveryFee, setDeliveryFee] = useState(String(settings.delivery_fee || 1.5));
  const [exchangeRate, setExchangeRate] = useState(String(settings.exchange_rate || 4100));
  const [voucherCost, setVoucherCost] = useState(String(settings.voucher_cost || 25));
  const [voucherPct, setVoucherPct] = useState(String(settings.voucher_pct || 10));
  const [customPt, setCustomPt] = useState(String(settings.custom_pt || 5));

  // Free Delivery Configuration
  const [freeDeliveryNormalEnabled, setFreeDeliveryNormalEnabled] = useState(
    Boolean(settings.free_delivery_normal_enabled === 1 || settings.free_delivery_normal_enabled === true || settings.free_delivery_normal_enabled === '1')
  );
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(
    settings.free_delivery_threshold !== undefined ? String(settings.free_delivery_threshold) : '0'
  );

  // Auto-Wipe Receipt History Configuration
  const [autoWipeEnabled, setAutoWipeEnabled] = useState(
    Boolean(settings.auto_wipe_enabled === 1 || settings.auto_wipe_enabled === true || settings.auto_wipe_enabled === '1')
  );
  const [autoWipeDays, setAutoWipeDays] = useState(settings.auto_wipe_days ? String(settings.auto_wipe_days) : '30');
  const [autoWipeScope, setAutoWipeScope] = useState(settings.auto_wipe_scope || 'completed_only');
  const [runningAutoWipe, setRunningAutoWipe] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleRunAutoWipeNow = async () => {
    Alert.alert(
      'Trigger Auto-Wipe Cleanup',
      `This will immediately purge orders older than ${autoWipeDays} days (Scope: ${autoWipeScope === 'all' ? 'All Orders' : 'Finished & Rejected Orders Only'}). Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run Clean Up Now',
          style: 'destructive',
          onPress: async () => {
            setRunningAutoWipe(true);
            const res = await ApiClient.runAutoWipeOrders(adminToken);
            setRunningAutoWipe(false);
            if (res.ok) {
              await refreshCatalog();
              Alert.alert('Auto-Wipe Complete', `Purged ${res.purged_count || 0} expired receipts/orders from database history.`);
              showToast(`✓ Auto-wipe cleared ${res.purged_count || 0} orders`);
            } else {
              Alert.alert('Auto-Wipe Error', res.error || 'Failed to execute auto-wipe');
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const parsedRate = Math.max(1, parseFloat(exchangeRate) || 4100);
    const payload = {
      site_title: siteTitle.trim(),
      subtitle: subtitle.trim(),
      tagline: tagline.trim(),
      announcement: announcement.trim(),
      seller_telegram: sellerTelegram.trim(),
      delivery_fee: parseFloat(deliveryFee) || 1.5,
      exchange_rate: parsedRate,
      voucher_cost: parseInt(voucherCost, 10) || 25,
      voucher_pct: parseInt(voucherPct, 10) || 10,
      custom_pt: parseInt(customPt, 10) || 5,
      free_delivery_normal_enabled: freeDeliveryNormalEnabled ? 1 : 0,
      free_delivery_threshold: parseFloat(freeDeliveryThreshold) || 0,
      auto_wipe_enabled: autoWipeEnabled ? 1 : 0,
      auto_wipe_days: parseInt(autoWipeDays, 10) || 30,
      auto_wipe_scope: autoWipeScope,
    };

    const res = await ApiClient.updateSettings(payload, adminToken);
    setSaving(false);

    if (res.ok) {
      if (setSettings) {
        setSettings((prev) => ({ ...prev, ...payload }));
      }
      await refreshCatalog();
      showToast(`✓ Settings saved! Exchange rate: $1 = ${parsedRate.toLocaleString()} ៛ KHR`);
    } else {
      Alert.alert('Save Failed', res.error || 'Could not update settings');
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: theme.text }]}>
        {lang === 'km' ? '⚙️ ការកំណត់ និងអត្រាប្តូរប្រាក់' : '⚙️ Studio Configurations & Rates'}
      </Text>

      {/* Brand & Identity */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Brand Identity</Text>

        <Text style={[styles.label, { color: theme.textMuted }]}>Store Title</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
          value={siteTitle}
          onChangeText={setSiteTitle}
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>Subtitle</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
          value={subtitle}
          onChangeText={setSubtitle}
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>Tagline</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
          value={tagline}
          onChangeText={setTagline}
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>Announcement Banner Text</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
          value={announcement}
          onChangeText={setAnnouncement}
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>Seller Telegram Username</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
          value={sellerTelegram}
          onChangeText={setSellerTelegram}
        />
      </View>

      {/* 🚚 Free Delivery & Shipping Policies */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>🚚 Delivery & Free Shipping Rules</Text>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 14 }}>
          Control standard delivery rates and configure automatic Free Delivery eligibility for customer storefront orders.
        </Text>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Standard Delivery Fee ($)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
              value={deliveryFee}
              onChangeText={setDeliveryFee}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Free Delivery Order Threshold ($)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
              value={freeDeliveryThreshold}
              onChangeText={setFreeDeliveryThreshold}
              placeholder="0 (disabled)"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
            />
            <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>
              Orders over this amount get $0 delivery (0 to disable)
            </Text>
          </View>
        </View>

        {/* Global Normal Products Free Delivery Toggle */}
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: freeDeliveryNormalEnabled ? 'rgba(16, 185, 129, 0.12)' : theme.inputBg,
            borderColor: freeDeliveryNormalEnabled ? (theme.secondary || '#10b981') : theme.border,
            borderWidth: 1.5,
            borderRadius: 14,
            padding: 14,
            marginTop: 10,
          }}
          onPress={() => setFreeDeliveryNormalEnabled(!freeDeliveryNormalEnabled)}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1, marginRight: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text }}>
                🚚 Default Free Delivery for All Normal Products
              </Text>
              {freeDeliveryNormalEnabled && (
                <View style={{ backgroundColor: theme.secondary || '#10b981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>ENABLED</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
              When enabled, all normal non-charm products (minifigures, toys, ready-made items) automatically qualify for Free Delivery across Cambodia.
            </Text>
          </View>
          <View
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              backgroundColor: freeDeliveryNormalEnabled ? (theme.secondary || '#10b981') : theme.border,
              justifyContent: 'center',
              paddingHorizontal: 2,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: '#fff',
                alignSelf: freeDeliveryNormalEnabled ? 'flex-end' : 'flex-start',
              }}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* 🇰🇭 Currency Exchange Rate (KHR ⇄ USD) */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 2 }]}>
              🇰🇭 Currency Exchange Rate (KHR ⇄ USD)
            </Text>
            <Text style={{ fontSize: 12, color: theme.textMuted }}>
              Manually customize the conversion rate from USD ($) to Khmer Riel (៛ KHR) across the store, receipts, and checkout.
            </Text>
          </View>
        </View>

        <Text style={[styles.label, { color: theme.textMuted }]}>
          Exchange Rate: 1 USD = ? ៛ KHR
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.inputBorder,
              color: theme.text,
              fontSize: 16,
              fontWeight: '800',
            },
          ]}
          value={exchangeRate}
          onChangeText={setExchangeRate}
          placeholder="4100"
          placeholderTextColor={theme.textMuted}
          keyboardType="numeric"
        />

        {/* Quick Rate Presets */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 11, color: theme.textMuted, fontWeight: '700' }}>Quick Presets:</Text>
          {['4000', '4050', '4100', '4120', '4150'].map((preset) => (
            <TouchableOpacity
              key={preset}
              style={[
                styles.presetPill,
                {
                  backgroundColor: exchangeRate === preset ? theme.primary : theme.inputBg,
                  borderColor: exchangeRate === preset ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setExchangeRate(preset)}
              activeOpacity={0.8}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: exchangeRate === preset ? '#ffffff' : theme.text,
                }}
              >
                {Number(preset).toLocaleString()} ៛
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Live Rate Preview Card */}
        <View
          style={[
            styles.ratePreviewBox,
            { backgroundColor: theme.gold + '15', borderColor: theme.gold + '40' },
          ]}
        >
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.gold }}>
            ⚡ Live Rate Preview:
          </Text>
          <Text style={{ fontSize: 11, color: theme.text, marginTop: 3 }}>
            $1.00 USD = {Math.round(1 * (parseFloat(exchangeRate) || 4100)).toLocaleString()} ៛ KHR • $10.00 USD = {Math.round(10 * (parseFloat(exchangeRate) || 4100)).toLocaleString()} ៛ KHR
          </Text>
        </View>
      </View>

      {/* Vouchers & Loyalty Rules */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>🎁 Vouchers & Loyalty Rules</Text>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Voucher Cost (pt)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
              value={voucherCost}
              onChangeText={setVoucherCost}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Voucher Discount (%)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
              value={voucherPct}
              onChangeText={setVoucherPct}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text style={[styles.label, { color: theme.textMuted }]}>Custom Bracelet Reward (pt)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
            value={customPt}
            onChangeText={setCustomPt}
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* Automated Receipt & Order History Cleanup (Auto-Wipe) */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 2 }]}>
              🧹 Automated Receipt & Order History Cleanup (Auto-Wipe)
            </Text>
            <Text style={{ fontSize: 12, color: theme.textMuted }}>
              Automatically clean up old customer receipts and order records based on retention schedule.
            </Text>
          </View>
        </View>

        {/* Enabled Toggle */}
        <View style={[styles.toggleContainer, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text }}>
              Auto-Wipe Background Scheduler
            </Text>
            <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
              {autoWipeEnabled
                ? 'Active — Orders exceeding the retention period are purged automatically.'
                : 'Disabled — Orders and receipts will remain indefinitely until manual wipe.'}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.switchBtn,
              { backgroundColor: autoWipeEnabled ? (theme.secondary || '#10b981') : 'rgba(239, 68, 68, 0.2)' },
            ]}
            onPress={() => setAutoWipeEnabled(!autoWipeEnabled)}
            activeOpacity={0.8}
          >
            <Text style={[styles.switchBtnText, { color: autoWipeEnabled ? '#ffffff' : theme.error }]}>
              {autoWipeEnabled ? '● ENABLED' : '○ DISABLED'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Retention Period Selector */}
        <Text style={[styles.label, { color: theme.textMuted, marginTop: 14 }]}>
          Retention Period (Delete receipts older than)
        </Text>
        <View style={styles.chipRow}>
          {[
            { days: '7', label: '7 Days' },
            { days: '14', label: '14 Days' },
            { days: '30', label: '30 Days (1 Month)' },
            { days: '60', label: '60 Days (2 Months)' },
            { days: '90', label: '90 Days (3 Months)' },
          ].map((item) => (
            <TouchableOpacity
              key={item.days}
              style={[
                styles.chip,
                autoWipeDays === item.days
                  ? [styles.chipActive, { backgroundColor: theme.primary, borderColor: theme.primary }]
                  : { backgroundColor: theme.inputBg, borderColor: theme.border },
              ]}
              onPress={() => setAutoWipeDays(item.days)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: autoWipeDays === item.days ? '#ffffff' : theme.text },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 12, color: theme.textMuted, fontWeight: '700' }}>Custom Days:</Text>
          <TextInput
            style={[
              styles.input,
              {
                width: 90,
                marginBottom: 0,
                height: 36,
                backgroundColor: theme.inputBg,
                borderColor: theme.inputBorder,
                color: theme.text,
                textAlign: 'center',
                fontWeight: '800',
              },
            ]}
            value={autoWipeDays}
            onChangeText={setAutoWipeDays}
            keyboardType="numeric"
            placeholder="30"
            placeholderTextColor={theme.textMuted}
          />
          <Text style={{ fontSize: 12, color: theme.textMuted }}>days threshold</Text>
        </View>

        {/* Scope Selector */}
        <Text style={[styles.label, { color: theme.textMuted, marginTop: 16 }]}>
          Target Scope (Which receipts to clean)
        </Text>
        <View style={styles.scopeRow}>
          <TouchableOpacity
            style={[
              styles.scopeBtn,
              autoWipeScope === 'completed_only'
                ? [styles.scopeBtnActive, { borderColor: theme.secondary || '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.12)' }]
                : { borderColor: theme.border, backgroundColor: theme.inputBg },
            ]}
            onPress={() => setAutoWipeScope('completed_only')}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 13, fontWeight: '900', color: autoWipeScope === 'completed_only' ? (theme.secondary || '#10b981') : theme.text }}>
              🧹 Finished Only (Completed & Rejected)
            </Text>
            <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 3 }}>
              Safe mode: preserves ongoing active & pending customer orders. Recommended.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.scopeBtn,
              autoWipeScope === 'all'
                ? [styles.scopeBtnActive, { borderColor: theme.error, backgroundColor: 'rgba(239, 68, 68, 0.12)' }]
                : { borderColor: theme.border, backgroundColor: theme.inputBg },
            ]}
            onPress={() => setAutoWipeScope('all')}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 13, fontWeight: '900', color: autoWipeScope === 'all' ? theme.error : theme.text }}>
              ⚠️ All Orders (Strict Cleanup)
            </Text>
            <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 3 }}>
              Purges all order receipts older than threshold regardless of order status.
            </Text>
          </TouchableOpacity>
        </View>

        {/* Execution & Last Run info */}
        <View style={[styles.wipeActionBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: theme.textMuted }}>Last Automated Run:</Text>
            <Text style={{ fontSize: 12, fontWeight: '800', color: theme.text, marginTop: 2 }}>
              {settings.auto_wipe_last_run ? new Date(settings.auto_wipe_last_run).toLocaleString() : 'Never executed yet'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.runNowBtn, { backgroundColor: theme.gold }]}
            onPress={handleRunAutoWipeNow}
            disabled={runningAutoWipe}
            activeOpacity={0.8}
          >
            <Text style={styles.runNowBtnText}>
              {runningAutoWipe ? 'Running...' : '▶ Run Auto-Wipe Now'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: theme.primary }]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.8}
      >
        <Text style={styles.saveBtnText}>
          {saving
            ? (lang === 'km' ? 'កំពុងរក្សាទុក...' : 'Saving...')
            : (lang === 'km' ? 'រក្សាទុកការកំណត់ 💾' : 'Save Settings to Server 💾')}
        </Text>
      </TouchableOpacity>

      {/* Admin Session Security & Logout */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 4 }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {lang === 'km' ? 'សុវត្ថិភាពគណនីរដ្ឋបាល' : 'Admin Session'}
        </Text>
        <Text style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 12 }}>
          {lang === 'km' ? 'ចាកចេញពីគណនីរដ្ឋបាលនៅលើឧបករណ៍នេះ។' : 'Log out of the studio management session on this device.'}
        </Text>
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.35)' }]}
          onPress={() => {
            Alert.alert(
              lang === 'km' ? 'ចាកចេញ' : 'Log Out',
              lang === 'km' ? 'តើអ្នកប្រាកដជាចង់ចាកចេញពីផ្ទាំងគ្រប់គ្រងឬ?' : 'Are you sure you want to log out of the admin panel?',
              [
                { text: lang === 'km' ? 'បោះបង់' : 'Cancel', style: 'cancel' },
                { text: lang === 'km' ? 'ចាកចេញ' : 'Log Out', style: 'destructive', onPress: logoutAdmin },
              ]
            );
          }}
          activeOpacity={0.8}
        >
          <Text style={{ color: theme.error, fontSize: 13, fontWeight: '800' }}>
            {lang === 'km' ? '⏻ ចាកចេញពីផ្ទាំងគ្រប់គ្រង' : '⏻ Log Out of Admin Panel'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  logoutBtn: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  scroll: {
    padding: 12,
    paddingBottom: 80,
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  input: {
    height: 38,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 11,
    fontSize: 12,
    marginBottom: 10,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  switchBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  switchBtnText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipActive: {
    elevation: 2,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  scopeRow: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 6,
  },
  scopeBtn: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  scopeBtnActive: {
    elevation: 2,
  },
  wipeActionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  runNowBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  runNowBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '900',
  },
  presetPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  ratePreviewBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginTop: 10,
  },
  saveBtn: {
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});
