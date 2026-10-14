import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Image,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { ApiClient } from '../../api/client';
import { resolveCharmImage } from '../../utils/charmImageHelper';
import { TelegramIcon } from '../../components/TelegramIcon';
import { openTelegramCustomer, cleanTelegramUsername } from '../../utils/orderReceiptHelper';

export const AdminDashboardScreen = ({ onNavigate, onOpenStorefrontLive }) => {
  const {
    theme,
    lang,
    settings,
    adminOrders,
    products,
    charms,
    adminToken,
    refreshOrders,
    refreshCatalog,
    showToast,
  } = useApp();

  const exchangeRate = Number(settings?.exchange_rate) || 4100;

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [refreshing, setRefreshing] = useState(false);
  const [restockingId, setRestockingId] = useState(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshOrders(), refreshCatalog()]);
    setRefreshing(false);
  };

  // Low Stock Items (strictly < 5 units)
  const lowStockProducts = useMemo(() => {
    return (products || []).filter((p) => {
      const s = p.stock !== undefined && p.stock !== null ? Number(p.stock) : 0;
      return s < 5;
    });
  }, [products]);

  const lowStockCharms = useMemo(() => {
    return (charms || []).filter((c) => {
      const s = c.stock !== undefined && c.stock !== null ? Number(c.stock) : 0;
      return s < 5;
    });
  }, [charms]);

  const lowStockItems = useMemo(() => {
    const list = [
      ...lowStockProducts.map((p) => ({ ...p, itemType: 'product' })),
      ...lowStockCharms.map((c) => ({ ...c, itemType: 'charm' })),
    ];
    return list.sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0));
  }, [lowStockProducts, lowStockCharms]);

  const hasLowStock = lowStockItems.length > 0;

  // Metrics
  const metrics = useMemo(() => {
    const ordersList = Array.isArray(adminOrders) ? adminOrders : [];
    const totalOrders = ordersList.length;
    const pendingOrders = ordersList.filter(
      (o) => (o.status || 'pending').toLowerCase() === 'pending'
    ).length;
    const confirmedOrders = ordersList.filter((o) => {
      const s = (o.status || '').toLowerCase();
      return s === 'confirmed' || s === 'approved' || s === 'completed';
    });
    const totalRevenue = ordersList
      .filter((o) => (o.status || '').toLowerCase() !== 'rejected')
      .reduce((sum, o) => sum + (+o.total || 0), 0);

    return {
      totalOrders,
      pendingOrders,
      confirmedCount: confirmedOrders.length,
      totalRevenue,
      totalProducts: (products || []).length,
      totalCharms: (charms || []).length,
      lowStockCount: lowStockItems.length,
    };
  }, [adminOrders, products, charms, lowStockItems.length]);

  // Recent 4 orders for the quick dashboard feed
  const recentOrders = useMemo(() => {
    return (adminOrders || []).slice(0, 4);
  }, [adminOrders]);

  const handleQuickRestock = async (item, delta = 10) => {
    setRestockingId(item.id);
    let res;
    if (item.itemType === 'charm') {
      res = await ApiClient.updateCharmStock(item.id, delta, adminToken);
    } else {
      res = await ApiClient.updateProductStock(item.id, delta, adminToken);
    }
    setRestockingId(null);
    if (res.ok) {
      await refreshCatalog();
      showToast(`✓ Added +${delta} stock to "${item.name}"`);
    } else {
      Alert.alert('Restock Failed', res.error || 'Could not update stock');
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
      }
    >
      <View style={styles.centeredWrapper}>
        {/* Top Header Row */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              {lang === 'km' ? '📊 ផ្ទាំងគ្រប់គ្រងស្ទូឌីយោ' : '📊 Studio Executive Dashboard'}
            </Text>
            <Text style={[styles.headerSub, { color: theme.textMuted }]}>
              {lang === 'km' ? 'ទិដ្ឋភាពទូទៅនៃហាង ការត្រួតពិនិត្យស្តុក និងការតាមដានការកម្ម៉ង់ទាន់ចិត្ត' : 'Real-time store overview, stock health alerts, and instant order tracking'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.refreshPill, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
            onPress={onRefresh}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted }}>
              {lang === 'km' ? '🔄 ធ្វើបច្ចុប្បន្នភាពផ្ទាល់' : '🔄 Live SQLite Sync'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Live Storefront Admin Mode Card */}
        <View style={[styles.liveVisitCard, { backgroundColor: theme.card, borderColor: theme.gold }]}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.liveVisitTitle, { color: theme.gold }]}>
                {lang === 'km' ? '👁️ ហាងទំនិញផ្ទាល់ជាមួយឧបករណ៍កែសម្រួល' : '👁️ Live Storefront with Inline Editor'}
              </Text>
              <View style={[styles.tagPill, { backgroundColor: theme.gold + '25' }]}>
                <Text style={{ color: theme.gold, fontSize: 9, fontWeight: '900' }}>
                  {lang === 'km' ? 'កែផ្ទាល់' : 'INTERACTIVE'}
                </Text>
              </View>
            </View>
            <Text style={[styles.liveVisitDesc, { color: theme.textMuted }]}>
              {lang === 'km' ? 'បើកមើលហាងទំនិញអតិថិជនជាមួយមុខងាររដ្ឋបាលដើម្បីកែសម្រួលផលិតផល និងមើលការផ្លាស់ប្តូរផ្ទាល់។' : 'Open the customer store with administrative controls enabled to edit products and view live changes.'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.liveVisitBtn, { backgroundColor: theme.gold }]}
            onPress={onOpenStorefrontLive}
            activeOpacity={0.8}
          >
            <Text style={styles.liveVisitBtnText}>
              {lang === 'km' ? 'បើកផ្ទាំងអតិថិជន ↗' : 'Open Customer Front ↗'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Minimalist Modern KPI Cards Grid (Solid 2x2 Grid on Mobile) */}
        <View style={styles.kpiGrid}>
          {/* 1. Total Revenue */}
          <View style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.kpiTopRow}>
              <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>
                {lang === 'km' ? 'ចំណូលសរុប' : 'TOTAL REVENUE'}
              </Text>
              <Text style={{ fontSize: 15 }}>💰</Text>
            </View>
            <Text style={[styles.kpiValue, { color: theme.primary }]}>
              ${metrics.totalRevenue.toFixed(2)}
            </Text>
            <Text style={[styles.kpiFoot, { color: theme.textMuted }]}>
              ≈ {Math.round(metrics.totalRevenue * exchangeRate).toLocaleString()} ៛ KHR
            </Text>
          </View>

          {/* 2. Pending Orders */}
          <TouchableOpacity
            style={[
              styles.kpiCard,
              {
                backgroundColor: metrics.pendingOrders > 0 ? 'rgba(234, 179, 8, 0.1)' : theme.card,
                borderColor: metrics.pendingOrders > 0 ? theme.gold : theme.border,
              },
            ]}
            onPress={() => onNavigate && onNavigate('orders')}
            activeOpacity={0.8}
          >
            <View style={styles.kpiTopRow}>
              <Text style={[styles.kpiLabel, { color: metrics.pendingOrders > 0 ? theme.gold : theme.textMuted }]}>
                {lang === 'km' ? 'ការកម្ម៉ង់រង់ចាំ' : 'PENDING ORDERS'}
              </Text>
              <Text style={{ fontSize: 15 }}>🧾</Text>
            </View>
            <Text style={[styles.kpiValue, { color: metrics.pendingOrders > 0 ? theme.gold : theme.text }]}>
              {metrics.pendingOrders}
            </Text>
            <Text style={[styles.kpiFoot, { color: metrics.pendingOrders > 0 ? theme.gold : '#10b981', fontWeight: '700' }]}>
              {metrics.pendingOrders > 0
                ? (lang === 'km' ? '⚠️ ត្រូវការដោះស្រាយ →' : '⚠️ Action Required →')
                : (lang === 'km' ? '✓ បានបំពេញទាំងអស់' : '✓ All fulfilled')}
            </Text>
          </TouchableOpacity>

          {/* 3. Total Orders */}
          <View style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.kpiTopRow}>
              <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>
                {lang === 'km' ? 'ការកម្ម៉ង់ទាំងអស់' : 'ALL ORDERS'}
              </Text>
              <Text style={{ fontSize: 15 }}>📦</Text>
            </View>
            <Text style={[styles.kpiValue, { color: theme.text }]}>
              {metrics.totalOrders}
            </Text>
            <Text style={[styles.kpiFoot, { color: theme.textMuted }]}>
              {metrics.confirmedCount} {lang === 'km' ? 'បានសម្រេច' : 'fulfilled'} ({metrics.totalOrders > 0 ? Math.round((metrics.confirmedCount / metrics.totalOrders) * 100) : 0}%)
            </Text>
          </View>

          {/* 4. Stock Health */}
          <TouchableOpacity
            style={[
              styles.kpiCard,
              {
                backgroundColor: metrics.lowStockCount > 0 ? 'rgba(239, 68, 68, 0.08)' : theme.card,
                borderColor: metrics.lowStockCount > 0 ? '#ef4444' : theme.border,
              },
            ]}
            onPress={() => onNavigate && onNavigate('products')}
            activeOpacity={0.8}
          >
            <View style={styles.kpiTopRow}>
              <Text style={[styles.kpiLabel, { color: metrics.lowStockCount > 0 ? '#ef4444' : theme.textMuted }]}>
                {lang === 'km' ? 'ស្ថានភាពស្តុក' : 'STOCK HEALTH'}
              </Text>
              <Text style={{ fontSize: 15 }}>{metrics.lowStockCount > 0 ? '⚠️' : '✅'}</Text>
            </View>
            <Text style={[styles.kpiValue, { color: metrics.lowStockCount > 0 ? '#ef4444' : '#10b981' }]}>
              {metrics.totalProducts + metrics.totalCharms} items
            </Text>
            <Text style={[styles.kpiFoot, { color: metrics.lowStockCount > 0 ? '#ef4444' : '#10b981', fontWeight: '700' }]}>
              {metrics.lowStockCount > 0 ? `⚠️ ${metrics.lowStockCount} below 5 units` : '✓ 100% healthy (≥ 5)'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Low Stock Alert Box (< 5 units threshold) */}
        {hasLowStock ? (
          <View
            style={[
              styles.stockBox,
              {
                backgroundColor: 'rgba(239, 68, 68, 0.06)',
                borderColor: '#ef4444',
              },
            ]}
          >
            <View style={styles.stockBoxHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={[styles.stockBoxTitle, { color: '#ef4444' }]}>
                    ⚠️ Low Stock Alert (Below 5 Units)
                  </Text>
                  <View style={[styles.badgePill, { backgroundColor: '#ef4444' }]}>
                    <Text style={styles.badgePillText}>{lowStockItems.length} Items</Text>
                  </View>
                </View>
                <Text style={[styles.stockBoxSub, { color: theme.textMuted }]}>
                  The following items have dropped below 5 units. Tap +10 Restock to replenish stock instantly.
                </Text>
              </View>
            </View>

            {/* Low Stock Items List */}
            <View style={styles.lowStockList}>
              {lowStockItems.map((item) => {
                const isCharm = item.itemType === 'charm';
                const curStock = Number(item.stock) || 0;
                const imgSrc = isCharm
                  ? resolveCharmImage(item.image)
                  : (item.image?.startsWith('http') ? { uri: item.image } : require('../../../assets/logo.jpg'));

                return (
                  <View
                    key={`${item.itemType}-${item.id}`}
                    style={[
                      styles.lowStockItemCard,
                      { backgroundColor: theme.card, borderColor: theme.border },
                    ]}
                  >
                    <Image source={imgSrc} style={styles.itemThumb} resizeMode="contain" />

                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <View
                          style={[
                            styles.typeTag,
                            { backgroundColor: isCharm ? 'rgba(139, 92, 246, 0.15)' : 'rgba(6, 182, 212, 0.15)' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.typeTagText,
                              { color: isCharm ? '#a855f7' : theme.cyan },
                            ]}
                          >
                            {isCharm ? '🔗 Italy Charm' : '🛍️ Product'}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <View
                          style={[
                            styles.stockAlertBadge,
                            { backgroundColor: curStock === 0 ? '#ef4444' : 'rgba(239, 68, 68, 0.18)' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.stockAlertBadgeText,
                              { color: curStock === 0 ? '#ffffff' : '#ef4444' },
                            ]}
                          >
                            {curStock === 0 ? '❌ Out of Stock (0)' : `⚠️ Stock: ${curStock} left`}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: theme.textMuted }}>
                          ${Number(item.price || 0).toFixed(2)}
                        </Text>
                      </View>
                    </View>

                    {/* Instant Restock Action */}
                    <TouchableOpacity
                      style={[
                        styles.restockBtn,
                        { backgroundColor: theme.primary },
                        restockingId === item.id && { opacity: 0.6 },
                      ]}
                      onPress={() => handleQuickRestock(item, 10)}
                      disabled={restockingId === item.id}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.restockBtnText}>
                        {restockingId === item.id ? '...' : '+10 Restock'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.stockBox,
              {
                backgroundColor: 'rgba(16, 185, 129, 0.06)',
                borderColor: '#10b981',
              },
            ]}
          >
            <View style={styles.stockBoxHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={[styles.stockBoxTitle, { color: '#10b981' }]}>
                    ✅ Inventory Healthy (All Stocks ≥ 5 Units)
                  </Text>
                  <View style={[styles.badgePill, { backgroundColor: '#10b981' }]}>
                    <Text style={styles.badgePillText}>✓ 100% In Stock</Text>
                  </View>
                </View>
                <Text style={[styles.stockBoxSub, { color: theme.textMuted }]}>
                  All catalog products ({products.length}) and Italy charms ({charms.length}) have 5 or more units in stock.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Recent Orders Snapshot Card */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 2 }]}>
                {lang === 'km' ? '🧾 ការកម្ម៉ង់ថ្មីៗ' : '🧾 Recent Orders'}
              </Text>
              <Text style={{ fontSize: 11, color: theme.textMuted }}>
                {lang === 'km' ? 'ការកម្ម៉ង់ចុងក្រោយបង្អស់ពីអតិថិជន' : 'Latest orders received from customer checkout'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.viewAllBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
              onPress={() => onNavigate && onNavigate('orders')}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 11, fontWeight: '800', color: theme.gold }}>
                {lang === 'km' ? 'មើលទាំងអស់ →' : 'View All →'}
              </Text>
            </TouchableOpacity>
          </View>

          {recentOrders.length === 0 ? (
            <View style={styles.emptyOrdersBox}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>📭</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                {lang === 'km' ? 'មិនទាន់មានការកម្ម៉ង់នៅឡើយទេ' : 'No orders placed yet'}
              </Text>
            </View>
          ) : (
            <View style={styles.recentOrdersList}>
              {recentOrders.map((ord) => {
                const receiptNum = ord.receipt_number || ord.id;
                const custName = ord.customer_name || ord.user_id || 'Customer';
                const rawTlg = ord.telegram_username || (ord.contact && typeof ord.contact === 'object' ? (ord.contact.telegram || ord.contact.telegram_username) : '') || '';
                const cleanTlg = cleanTelegramUsername(rawTlg);
                const st = (ord.status || 'pending').toLowerCase();
                const isConf = st === 'confirmed' || st === 'approved' || st === 'completed';

                return (
                  <TouchableOpacity
                    key={ord.id}
                    style={[styles.recentOrderRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
                    onPress={() => onNavigate && onNavigate('orders')}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[styles.recentReceipt, { color: theme.gold }]}>
                          #{receiptNum}
                        </Text>
                        <Text style={[styles.recentCust, { color: theme.text }]} numberOfLines={1}>
                          👤 {custName}
                        </Text>
                        {cleanTlg ? (
                          <TouchableOpacity
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 3,
                              backgroundColor: 'rgba(34, 158, 217, 0.14)',
                              borderColor: 'rgba(34, 158, 217, 0.45)',
                              borderWidth: 1,
                              borderRadius: 4,
                              paddingHorizontal: 5,
                              paddingVertical: 1,
                              cursor: 'pointer',
                            }}
                            onPress={(e) => {
                              if (e && e.stopPropagation) e.stopPropagation();
                              openTelegramCustomer(cleanTlg);
                            }}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`Open Telegram chat with @${cleanTlg}`}
                          >
                            <TelegramIcon size={10} variant="circle" />
                            <Text style={{ fontSize: 10, color: '#229ED9', fontWeight: '800' }}>
                              @{cleanTlg} ↗
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                        📞 {ord.phone || 'N/A'} · 📍 {ord.province || 'Phnom Penh'}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                      <Text style={[styles.recentPrice, { color: theme.primary }]}>
                        ${(+ord.total || 0).toFixed(2)}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: isConf
                              ? 'rgba(16, 185, 129, 0.15)'
                              : st === 'rejected'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'rgba(234, 179, 8, 0.15)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color: isConf
                                ? '#10b981'
                                : st === 'rejected'
                                ? '#ef4444'
                                : theme.gold,
                            },
                          ]}
                        >
                          {st.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Quick Administrative Shortcuts */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            ⚡ Management Shortcuts
          </Text>

          <View style={styles.actionGrid}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
              onPress={() => onNavigate && onNavigate('orders')}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>🧾</Text>
              <Text style={[styles.actionText, { color: theme.text }]}>Orders Desk</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
              onPress={() => onNavigate && onNavigate('products')}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>🛍️</Text>
              <Text style={[styles.actionText, { color: theme.text }]}>Products Catalog</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
              onPress={() => onNavigate && onNavigate('charms')}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>🔗</Text>
              <Text style={[styles.actionText, { color: theme.text }]}>Italy Charms</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
              onPress={() => onNavigate && onNavigate('categories')}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>🏷️</Text>
              <Text style={[styles.actionText, { color: theme.text }]}>Categories</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
              onPress={() => onNavigate && onNavigate('customers')}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>👥</Text>
              <Text style={[styles.actionText, { color: theme.text }]}>Customers</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
              onPress={() => onNavigate && onNavigate('settings')}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>⚙️</Text>
              <Text style={[styles.actionText, { color: theme.text }]}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: 12,
    paddingBottom: 80,
  },
  centeredWrapper: {
    width: '100%',
    alignSelf: 'center',
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  refreshPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  liveVisitCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
    flexDirection: 'column',
    gap: 8,
  },
  liveVisitTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  tagPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveVisitDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  liveVisitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveVisitBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '900',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  kpiCard: {
    width: '48.5%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    justifyContent: 'space-between',
    minHeight: 80,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '900',
    marginVertical: 1,
  },
  kpiFoot: {
    fontSize: 9,
  },
  stockBox: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
  stockBoxHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stockBoxTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  stockBoxSub: {
    fontSize: 11,
    marginTop: 3,
    lineHeight: 16,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgePillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  lowStockList: {
    gap: 8,
    marginTop: 4,
  },
  lowStockItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#0c0e17',
    alignSelf: 'center',
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 200,
  },
  typeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeTagText: {
    fontSize: 9,
    fontWeight: '800',
  },
  stockAlertBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stockAlertBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  restockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restockBtnText: {
    color: '#000000',
    fontSize: 11,
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
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  viewAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  emptyOrdersBox: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentOrdersList: {
    gap: 6,
  },
  recentOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  recentReceipt: {
    fontSize: 11.5,
    fontWeight: '900',
  },
  recentCust: {
    fontSize: 11.5,
    fontWeight: '700',
    maxWidth: 220,
  },
  recentPrice: {
    fontSize: 13,
    fontWeight: '900',
  },
  statusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    marginTop: 2,
  },
  statusBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 8,
  },
  actionBtn: {
    width: '31%',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  actionText: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
});
