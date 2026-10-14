import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useApp } from './context/AppContext';
import { Toast } from './components/Toast';
import { AnimatedThemeSwitch } from './components/AnimatedThemeSwitch';
import { AnimatedLangSwitch } from './components/AnimatedLangSwitch';
import { TelegramIcon } from './components/TelegramIcon';
import { playOrderAlertSound } from './utils/soundHelper';

import { AdminLoginScreen } from './screens/admin/AdminLoginScreen';
import { AdminDashboardScreen } from './screens/admin/AdminDashboardScreen';
import { AdminOrdersScreen } from './screens/admin/AdminOrdersScreen';
import { AdminProductsScreen } from './screens/admin/AdminProductsScreen';
import { AdminCategoriesScreen } from './screens/admin/AdminCategoriesScreen';
import { AdminCharmsScreen } from './screens/admin/AdminCharmsScreen';
import { AdminCustomersScreen } from './screens/admin/AdminCustomersScreen';
import { AdminSettingsScreen } from './screens/admin/AdminSettingsScreen';

export const AdminRoot = ({ onSwitchToCustomer, onSwitchToLive }) => {
  const {
    isAdmin,
    adminOrders,
    refreshOrders,
    products,
    charms,
    theme,
    themeMode,
    toggleTheme,
    lang,
    setLang,
    logoutAdmin,
  } = useApp();

  const { width } = useWindowDimensions();
  const isPhone = width <= 500;

  const [adminTab, setAdminTab] = useState('dashboard');
  const [newOrderAlert, setNewOrderAlert] = useState(null);
  const knownOrderIdsRef = useRef(null);
  const alertTimeoutRef = useRef(null);
  const navScrollRef = useRef(null);
  const [navScrollX, setNavScrollX] = useState(0);

  const handleNavNudge = (direction) => {
    const delta = direction === 'left' ? -150 : 150;
    const nextX = Math.max(0, navScrollX + delta);
    setNavScrollX(nextX);
    navScrollRef.current?.scrollTo({ x: nextX, animated: true });
  };

  // Background polling for new orders while admin is active (every 5 seconds)
  useEffect(() => {
    if (!isAdmin) return;
    refreshOrders();
    const interval = setInterval(() => {
      refreshOrders();
    }, 5000);
    return () => clearInterval(interval);
  }, [isAdmin, refreshOrders]);

  // Detect newly placed orders, play chime sound, and display notification popup
  useEffect(() => {
    if (!isAdmin || !Array.isArray(adminOrders)) return;

    if (knownOrderIdsRef.current === null) {
      // First load: record existing orders without firing sound
      knownOrderIdsRef.current = new Set(adminOrders.filter(Boolean).map((o) => String(o.id || '')));
      return;
    }

    const newOrders = adminOrders.filter((o) => o && o.id && !knownOrderIdsRef.current.has(String(o.id)));
    if (newOrders.length > 0) {
      newOrders.forEach((o) => knownOrderIdsRef.current.add(String(o.id)));
      const latest = newOrders[0];

      // Play pleasant luxury chime
      playOrderAlertSound();

      // Show notification popup
      setNewOrderAlert(latest);

      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = setTimeout(() => {
        setNewOrderAlert(null);
      }, 15000);
    }
  }, [adminOrders, isAdmin]);

  const dismissOrderAlert = () => {
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    setNewOrderAlert(null);
  };

  const viewOrderDetails = (order) => {
    dismissOrderAlert();
    setAdminTab('orders');
  };

  const pendingCount = (Array.isArray(adminOrders) ? adminOrders : []).filter(
    (o) => o && (o.status || 'pending').toLowerCase() === 'pending'
  ).length;

  if (!isAdmin) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: isPhone
              ? theme.bg
              : (themeMode === 'dark' ? '#07090e' : '#f1f5f9'),
          },
        ]}
      >
        <StatusBar barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={theme.card} />
        <View style={styles.appShellWrapper}>
          <View
            style={[
              styles.mobileContainer,
              isPhone && styles.phoneContainer,
              {
                backgroundColor: theme.bg,
                borderColor: isPhone
                  ? 'transparent'
                  : (themeMode === 'dark' ? 'rgba(212, 175, 55, 0.25)' : 'rgba(0, 0, 0, 0.12)'),
              },
              !isPhone && styles.desktopPhoneShadow,
            ]}
          >
            <AdminLoginScreen onSwitchToCustomer={onSwitchToCustomer} />
          </View>
        </View>
        <Toast />
      </SafeAreaView>
    );
  }

  const renderCurrentView = () => {
    switch (adminTab) {
      case 'orders':
        return <AdminOrdersScreen />;
      case 'products':
        return <AdminProductsScreen />;
      case 'charms':
        return <AdminCharmsScreen />;
      case 'categories':
        return <AdminCategoriesScreen />;
      case 'customers':
        return <AdminCustomersScreen />;
      case 'settings':
        return <AdminSettingsScreen />;
      case 'dashboard':
      default:
        return (
          <AdminDashboardScreen
            onNavigate={setAdminTab}
            onOpenStorefrontLive={onSwitchToLive || onSwitchToCustomer}
          />
        );
    }
  };

  const navItems = [
    { id: 'dashboard', icon: '📊', label: lang === 'km' ? 'ផ្ទាំងគ្រប់គ្រង' : 'Dashboard' },
    { id: 'products', icon: '🛍️', label: lang === 'km' ? 'ទំនិញ' : 'Products', countBadge: products?.length },
    { id: 'charms', icon: '🔗', label: lang === 'km' ? 'តំណាក់អ៊ីតាលី' : 'Italy Charms', countBadge: charms?.length },
    { id: 'orders', icon: '🧾', label: lang === 'km' ? 'វិក្កយបត្រ' : 'Orders', badge: pendingCount },
    { id: 'categories', icon: '🏷️', label: lang === 'km' ? 'ប្រភេទ' : 'Categories' },
    { id: 'customers', icon: '👥', label: lang === 'km' ? 'អតិថិជន' : 'Customers' },
    { id: 'settings', icon: '⚙️', label: lang === 'km' ? 'ការកំណត់' : 'Settings' },
  ];

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: isPhone
            ? theme.bg
            : (themeMode === 'dark' ? '#07090e' : '#f1f5f9'),
        },
      ]}
    >
      <StatusBar barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={theme.card} />

      {/* Mobile-First App Shell Wrapper */}
      <View style={styles.appShellWrapper}>
        <View
          style={[
            styles.mobileContainer,
            isPhone && styles.phoneContainer,
            {
              backgroundColor: theme.bg,
              borderColor: isPhone
                ? 'transparent'
                : (themeMode === 'dark' ? 'rgba(212, 175, 55, 0.25)' : 'rgba(0, 0, 0, 0.12)'),
            },
            !isPhone && styles.desktopPhoneShadow,
          ]}
        >
          {/* Admin Modern Top Header */}
          <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
            <View style={styles.headerInner}>
              <View style={styles.brandRow}>
                <Image source={require('../assets/logo.jpg')} style={styles.logo} />
                <View style={styles.brandInfo}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>Somphea Reak</Text>
                    <View style={[styles.adminTag, { backgroundColor: theme.gold + '20', borderColor: theme.gold + '80' }]}>
                      <Text style={[styles.adminTagText, { color: theme.gold }]}>
                        {lang === 'km' ? 'រដ្ឋបាល' : 'ADMIN'}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 9.5, color: theme.textMuted }} numberOfLines={1}>
                    {lang === 'km' ? 'ការគ្រប់គ្រងស្ទូឌីយោ · ផ្សាយផ្ទាល់' : 'Studio Management · Live Sync'}
                  </Text>
                </View>
              </View>

              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={[styles.customerBtn, { backgroundColor: theme.gold, borderColor: theme.gold }]}
                  onPress={onSwitchToLive || onSwitchToCustomer || (() => {
                    if (typeof window !== 'undefined' && window.open) {
                      window.open('http://localhost:8081', '_blank');
                    }
                  })}
                  activeOpacity={0.8}
                  accessibilityLabel="Open Customer Front"
                >
                  <Text style={[styles.customerBtnText, { color: '#000000', fontWeight: '900' }]}>
                    {lang === 'km' ? '🛍️ ហាង ↗' : '🛍️ Store ↗'}
                  </Text>
                </TouchableOpacity>

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
            </View>
          </View>

          {/* All-in-One Horizontal Navigation Tab Bar with Left & Right Moveable Controls */}
          <View style={[styles.navBarWrapper, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.navNudgeBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
              onPress={() => handleNavNudge('left')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.navNudgeArrow, { color: theme.text }]}>‹</Text>
            </TouchableOpacity>

            <ScrollView
              ref={navScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={styles.navBarScroll}
              onScroll={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                setNavScrollX(x);
              }}
              scrollEventThrottle={16}
            >
              {navItems.map((item) => {
                const isActive = adminTab === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.tabPill,
                      isActive
                        ? [styles.tabPillActive, { backgroundColor: theme.gold + '20', borderColor: theme.gold }]
                        : { backgroundColor: 'transparent', borderColor: 'transparent' },
                    ]}
                    onPress={() => setAdminTab(item.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tabIcon, { opacity: isActive ? 1 : 0.7 }]}>
                      {item.icon}
                    </Text>
                    <Text
                      style={[
                        styles.tabLabel,
                        {
                          color: isActive ? theme.gold : theme.textMuted,
                          fontWeight: isActive ? '800' : '600',
                        },
                      ]}
                    >
                      {item.label}
                    </Text>

                    {/* Pending Orders Alert Badge */}
                    {item.badge > 0 && (
                      <View style={[styles.alertBadge, { backgroundColor: theme.error }]}>
                        <Text style={styles.alertBadgeText}>{item.badge}</Text>
                      </View>
                    )}

                    {/* Item Counter Badge (e.g. Total products, charms) */}
                    {!item.badge && item.countBadge !== undefined && (
                      <View style={[styles.countBadge, { backgroundColor: isActive ? theme.gold + '30' : theme.inputBg }]}>
                        <Text style={[styles.countBadgeText, { color: isActive ? theme.gold : theme.textMuted }]}>
                          {item.countBadge}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.navNudgeBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
              onPress={() => handleNavNudge('right')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.navNudgeArrow, { color: theme.text }]}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Main Mobile Screen View */}
          <View style={styles.content}>
            {renderCurrentView()}
          </View>

          {/* Real-time Order Notification Pop-up Banner - Slim Top iOS Style Banner */}
          {newOrderAlert && (
            <View style={styles.alertPopupWrapper} pointerEvents="box-none">
              <TouchableOpacity
                style={[
                  styles.slimAlertCard,
                  {
                    backgroundColor: themeMode === 'dark' ? '#0f172a' : '#ffffff',
                    borderColor: theme.gold,
                    shadowColor: theme.gold,
                  },
                ]}
                onPress={() => viewOrderDetails(newOrderAlert)}
                activeOpacity={0.9}
              >
                <View style={styles.slimAlertLeft}>
                  <View style={styles.slimDotPill}>
                    <Text style={styles.alertPulsingDot}>●</Text>
                  </View>
                  <View style={styles.slimTextCol}>
                    <View style={styles.slimTitleRow}>
                      <Text style={[styles.slimOrderTitle, { color: theme.gold }]} numberOfLines={1}>
                        {lang === 'km' ? 'ការកម្ម៉ង់ថ្មី #' : 'New Order #'}{newOrderAlert.receipt_number || newOrderAlert.id}
                      </Text>
                      <Text style={[styles.slimOrderTotal, { color: theme.primary }]}>
                        ${(+newOrderAlert.total || 0).toFixed(2)}
                      </Text>
                    </View>
                    <Text style={[styles.slimOrderSub, { color: theme.textMuted }]} numberOfLines={1}>
                      {newOrderAlert.customer_name || (lang === 'km' ? 'អតិថិជន' : 'Customer')} · {lang === 'km' ? 'ចុចដើម្បីពិនិត្យ' : 'Tap to review'}
                    </Text>
                  </View>
                </View>

                <View style={styles.slimAlertRight}>
                  <View style={[styles.slimViewBtn, { backgroundColor: theme.primary }]}>
                    <Text style={styles.slimViewBtnText}>{lang === 'km' ? 'ពិនិត្យ' : 'View'}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      dismissOrderAlert();
                    }}
                    style={styles.slimCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={[styles.slimCloseText, { color: theme.textMuted }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <Toast />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  appShellWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 820, // Max tablet width; strictly mobile and tablet only
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  phoneContainer: {
    maxWidth: '100%',
  },
  desktopPhoneShadow: {
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 25,
    elevation: 16,
  },
  header: {
    width: '100%',
    borderBottomWidth: 1,
    paddingTop: Platform.OS === 'web' ? 'max(6px, env(safe-area-inset-top, 0px))' : (Platform.OS === 'ios' ? 44 : 6),
  },
  headerInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  brandInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.4)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'nowrap',
    overflow: 'hidden',
  },
  title: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  adminTag: {
    paddingHorizontal: 3.5,
    paddingVertical: 0.5,
    borderRadius: 3,
    borderWidth: 0.8,
    flexShrink: 0,
    alignSelf: 'center',
  },
  adminTagText: {
    fontSize: 7.5,
    fontWeight: '900',
    letterSpacing: 0.4,
    lineHeight: 9.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  customerBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    height: 23,
  },
  customerBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#000000',
  },
  navBarWrapper: {
    width: '100%',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  navNudgeBtn: {
    width: 20,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  navNudgeArrow: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  navBarScroll: {
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 4,
  },
  tabPillActive: {
    shadowColor: '#d4af37',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  tabIcon: {
    fontSize: 12,
  },
  tabLabel: {
    fontSize: 10,
  },
  alertBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  alertBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  countBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  countBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    width: '100%',
  },
  alertPopupWrapper: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    zIndex: 99999,
  },
  slimAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
    gap: 8,
  },
  slimAlertLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  slimDotPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertPulsingDot: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '900',
  },
  slimTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  slimTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  slimOrderTitle: {
    fontSize: 11.5,
    fontWeight: '900',
    flexShrink: 1,
  },
  slimOrderTotal: {
    fontSize: 12,
    fontWeight: '900',
  },
  slimOrderSub: {
    fontSize: 10,
    marginTop: 1,
  },
  slimAlertRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slimViewBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  slimViewBtnText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '800',
  },
  slimCloseBtn: {
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slimCloseText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
