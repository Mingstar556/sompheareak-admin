import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { ApiClient } from '../../api/client';
import { playOrderAlertSound } from '../../utils/soundHelper';
import { TelegramIcon } from '../../components/TelegramIcon';
import { TelegramAvatar } from '../../components/TelegramAvatar';
import { AdminEditReceiptModal } from '../../components/AdminEditReceiptModal';
import {
  getOrderItemImageSource,
  getOrderItemCategory,
  parseOrderItems,
  formatReceiptNumber,
  matchesReceiptSearch,
  getOrderVoucherInfo,
  openTelegramCustomer,
  cleanTelegramUsername,
} from '../../utils/orderReceiptHelper';
import {
  ModularCharmLink,
  ConnectedBraceletRibbon,
  extractBraceletLinks,
  FullBraceletReceiptBox,
} from '../../components/ModularCharmLink';

export const AdminOrdersScreen = () => {
  const {
    theme,
    lang,
    adminOrders,
    adminToken,
    settings,
    products = [],
    charms = [],
    refreshOrders,
    refreshCatalog,
    updateOrder,
    wipeOrders,
    runAutoWipeOrders,
    showToast,
  } = useApp();

  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [runningAutoWipe, setRunningAutoWipe] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState({});

  const toggleOrderExpand = (orderId) => {
    setExpandedOrders((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  const orderFilterScrollRef = useRef(null);
  const [filterScrollPos, setFilterScrollPos] = useState(0);

  const handleNudgeFilter = (direction) => {
    const delta = direction === 'left' ? -140 : 140;
    const nextX = Math.max(0, filterScrollPos + delta);
    setFilterScrollPos(nextX);
    orderFilterScrollRef.current?.scrollTo({ x: nextX, animated: true });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshOrders(), refreshCatalog ? refreshCatalog() : Promise.resolve()]);
    setRefreshing(false);
  };

  const totalSearchMatches = useMemo(() => {
    const list = Array.isArray(adminOrders) ? adminOrders : [];
    const q = (searchQuery || '').trim();
    if (!q) return list.length;
    return list.filter((o) => matchesReceiptSearch(o, q)).length;
  }, [adminOrders, searchQuery]);

  const filteredOrders = useMemo(() => {
    const list = Array.isArray(adminOrders) ? adminOrders : [];
    const q = (searchQuery || '').trim();

    if (q) {
      const allMatches = list.filter((o) => matchesReceiptSearch(o, q));
      if (activeFilter === 'all') return allMatches;

      const tabMatches = allMatches.filter((o) => {
        const s = (o.status || 'pending').toLowerCase();
        if (activeFilter === 'confirmed') return s === 'confirmed' || s === 'approved';
        return s === activeFilter;
      });

      // If matches exist in this tab, show them; otherwise fallback to all matching receipts so the admin can always find the receipt!
      return tabMatches.length > 0 ? tabMatches : allMatches;
    }

    if (activeFilter === 'all') return list;
    return list.filter((o) => {
      const s = (o.status || 'pending').toLowerCase();
      if (activeFilter === 'confirmed') return s === 'confirmed' || s === 'approved';
      return s === activeFilter;
    });
  }, [adminOrders, activeFilter, searchQuery]);

  const handleApprove = async (orderId) => {
    setLoadingAction(orderId);
    const res = await ApiClient.approveOrder(orderId, adminToken);
    setLoadingAction(null);
    if (res.ok) {
      await Promise.all([
        refreshOrders(),
        refreshCatalog ? refreshCatalog() : Promise.resolve(),
      ]);
      showToast(`✓ Order #${orderId.slice(0, 8)} Approved (Stock updated & Points credited)`);
    } else {
      Alert.alert('Approve Failed', res.error || 'Could not approve order');
    }
  };

  const handleReject = async (orderId) => {
    Alert.prompt
      ? Alert.prompt(
          'Reject Order',
          'Enter reason for rejection:',
          async (reason) => {
            setLoadingAction(orderId);
            const res = await ApiClient.rejectOrder(orderId, reason || 'Stock unavailable', adminToken);
            setLoadingAction(null);
            if (res.ok) {
              await refreshOrders();
              showToast(`Order #${orderId.slice(0, 8)} Rejected`);
            }
          }
        )
      : Alert.alert('Reject Order', 'Are you sure you want to reject this order?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: async () => {
              setLoadingAction(orderId);
              const res = await ApiClient.rejectOrder(orderId, 'Disapproved by admin', adminToken);
              setLoadingAction(null);
              if (res.ok) {
                await refreshOrders();
                showToast(`Order #${orderId.slice(0, 8)} Rejected`);
              }
            },
          },
        ]);
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    setLoadingAction(orderId);
    const res = await ApiClient.updateOrderStatus(orderId, newStatus, adminToken);
    setLoadingAction(null);
    if (res.ok) {
      await refreshOrders();
      showToast(`Order status updated to ${newStatus}`);
    } else {
      Alert.alert('Status Update Failed', res.error || 'Could not update status');
    }
  };

  const handleSaveEditedReceipt = async (orderId, payload) => {
    const res = await updateOrder(orderId, payload);
    if (res.ok) {
      await refreshOrders();
      showToast('✓ Receipt information updated and saved!');
    } else {
      Alert.alert('Update Failed', res.error || 'Could not update receipt');
    }
  };

  const handleWipeOrdersPrompt = () => {
    Alert.alert(
      'Wipe Receipt & Order History',
      'Select which receipt history to wipe from the database:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '🧹 Wipe Finished Only',
          onPress: async () => {
            const res = await wipeOrders('completed_only');
            await refreshOrders();
            showToast(`✓ Wiped completed & rejected receipts (${res.deleted_count || 0})`);
          },
        },
        {
          text: '🗑️ Wipe ALL Receipts & Orders',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '⚠️ Permanent Deletion Warning',
              'Are you sure you want to permanently erase ALL receipts and order history? This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Confirm Erase All',
                  style: 'destructive',
                  onPress: async () => {
                    const res = await wipeOrders('all');
                    await refreshOrders();
                    showToast('✓ All receipts and order history wiped completely');
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleRunAutoWipeNow = async () => {
    setRunningAutoWipe(true);
    const res = await runAutoWipeOrders();
    setRunningAutoWipe(false);
    if (res && res.ok) {
      showToast(res.message || '✓ Auto-wipe completed');
    } else {
      showToast('Auto-wipe executed');
    }
  };

  const filterTabs = [
    { id: 'all', label: lang === 'km' ? 'ទាំងអស់' : 'All' },
    { id: 'pending', label: lang === 'km' ? 'កំពុងរង់ចាំ' : 'Pending' },
    { id: 'confirmed', label: lang === 'km' ? 'បានអនុម័ត' : 'Confirmed' },
    { id: 'delivering', label: lang === 'km' ? 'កំពុងដឹកជញ្ជូន' : 'Delivering' },
    { id: 'completed', label: lang === 'km' ? 'បានបញ្ចប់' : 'Completed' },
    { id: 'rejected', label: lang === 'km' ? 'បានបដិសេធ' : 'Rejected' },
  ];

  const isAutoWipeOn = String(settings?.auto_wipe_enabled || '').toLowerCase() === 'true';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
      }
    >
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>
            {lang === 'km' ? '🧾 ការកម្ម៉ង់ & វិក្កយបត្រ' : '🧾 Orders & Receipts'}
          </Text>
          <Text style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2 }}>
            {lang === 'km' ? 'ការកម្ម៉ង់ផ្ទាល់ • កែសម្រួលវិក្កយបត្រ • ប្រវត្តិ' : 'Real-time orders • Edit receipts • History'}
          </Text>
        </View>

        <View style={styles.headerBtnGroup}>
          {isAutoWipeOn && (
            <TouchableOpacity
              style={[styles.autoWipePill, { backgroundColor: theme.secondaryBg || 'rgba(16, 185, 129, 0.12)', borderColor: theme.secondaryBorder || 'rgba(16, 185, 129, 0.3)' }]}
              onPress={handleRunAutoWipeNow}
              disabled={runningAutoWipe}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: theme.secondary || '#10b981' }}>
                {runningAutoWipe ? '⏳ Cleaning...' : `🧹 Auto-Wipe: ${settings.auto_wipe_days || 30}d`}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.wipeOrdersBtn, { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.4)' }]}
            onPress={handleWipeOrdersPrompt}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: theme.error }}>🗑️ Wipe</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar for Receipt Numbers (Positioned directly on top of the filter tabs) */}
      <View style={styles.searchBarContainer}>
        <View
          style={[
            styles.searchBarInner,
            {
              backgroundColor: theme.card,
              borderColor: searchQuery ? theme.primary : (theme.inputBorder || 'rgba(255, 255, 255, 0.22)'),
            },
          ]}
        >
          <Text style={{ fontSize: 15, marginRight: 10 }}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder={
              lang === 'km'
                ? 'ស្វែងរកវិក្កយបត្រ (ឧ. 2026-10-12 T22.15, លេខទូរស័ព្ទ, ឈ្មោះ)...'
                : 'Search receipt # (e.g. 2026-10-12 T22.15, 23.03, old order)...'
            }
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery ? (
            <TouchableOpacity
              style={[styles.clearSearchBtn, { backgroundColor: theme.inputBg }]}
              onPress={() => setSearchQuery('')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 12, color: theme.textMuted, fontWeight: '800' }}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {searchQuery && totalSearchMatches > 0 && activeFilter !== 'all' ? (
          <TouchableOpacity
            style={[styles.searchAllBadge, { backgroundColor: theme.primary + '18', borderColor: theme.primary }]}
            onPress={() => setActiveFilter('all')}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: theme.primary }}>
              {lang === 'km'
                ? `⚡ រកឃើញ ${totalSearchMatches} វិក្កយបត្រត្រូវគ្នា • ចុចដើម្បីមើលទាំងអស់`
                : `⚡ Found ${totalSearchMatches} matching receipt${totalSearchMatches > 1 ? 's' : ''} in total • Tap to view all`}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter Tabs with Moveable Controls */}
      <View style={styles.filterBarWrapper}>
        <TouchableOpacity
          style={[styles.filterNudgeBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => handleNudgeFilter('left')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.filterNudgeText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>

        <ScrollView
          ref={orderFilterScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={styles.filterRow}
          onScroll={(e) => setFilterScrollPos(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
        >
          {filterTabs.map((tab) => {
            const tabOrders = searchQuery ? adminOrders.filter((o) => matchesReceiptSearch(o, searchQuery)) : adminOrders;
            const count = tab.id === 'all'
              ? tabOrders.length
              : tabOrders.filter((o) => {
                  const s = (o.status || 'pending').toLowerCase();
                  if (tab.id === 'confirmed') return s === 'confirmed' || s === 'approved';
                  return s === tab.id;
                }).length;
            const isActive = activeFilter === tab.id;

            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.filterTab,
                  {
                    backgroundColor: isActive ? theme.primary : theme.card,
                    borderColor: isActive ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => setActiveFilter(tab.id)}
              >
                <Text style={[styles.filterTabText, { color: isActive ? '#fff' : theme.text }]}>
                  {tab.label} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={[styles.filterNudgeBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => handleNudgeFilter('right')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.filterNudgeText, { color: theme.text }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>📭</Text>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13, textAlign: 'center' }}>
            {searchQuery
              ? (lang === 'km' ? `រកមិនឃើញវិក្កយបត្រដែលត្រូវនឹង "${searchQuery}" ទេ` : `No orders found matching "${searchQuery}" in ${activeFilter} tab`)
              : (lang === 'km' ? 'គ្មានវិក្កយបត្រនៅក្នុងផ្ទាំងនេះទេ' : 'No orders found in this view')}
          </Text>
          {searchQuery && totalSearchMatches > 0 && activeFilter !== 'all' ? (
            <TouchableOpacity
              style={[styles.searchAllBtn, { backgroundColor: theme.primary, marginTop: 12 }]}
              onPress={() => setActiveFilter('all')}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>
                {lang === 'km'
                  ? `បង្ហាញវិក្កយបត្រត្រូវគ្នាទាំង ${totalSearchMatches} ទាំងអស់ →`
                  : `Show All ${totalSearchMatches} Matching Receipt${totalSearchMatches > 1 ? 's' : ''} Across All Tabs →`}
              </Text>
            </TouchableOpacity>
          ) : searchQuery ? (
            <TouchableOpacity
              style={[styles.clearSearchPromptBtn, { borderColor: theme.border, marginTop: 10 }]}
              onPress={() => setSearchQuery('')}
              activeOpacity={0.7}
            >
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>
                {lang === 'km' ? '✕ សម្អាតការស្វែងរក' : '✕ Clear Search'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        filteredOrders.map((ord) => {
          const items = parseOrderItems(ord.items);

          let contact = {};
          if (typeof ord.contact === 'string') {
            try { contact = JSON.parse(ord.contact); } catch (e) { contact = {}; }
          } else if (ord.contact && typeof ord.contact === 'object') {
            contact = ord.contact;
          }

          const customerName = ord.customer_name || contact.name || contact.customer_name || ord.user_id || 'Customer';
          const rawTlg = ord.telegram_username || contact.telegram || contact.telegram_username || '';
          const telegramHandle = cleanTelegramUsername(rawTlg);
          const phoneNumber = ord.phone || contact.phone || 'N/A';
          const deliveryAddr = ord.address || contact.address || ord.province || 'Phnom Penh';
          const receiptNum = formatReceiptNumber(ord, ord.receipt_number || ord.id);
          const paymentMethod = ord.payment_method || ord.payment || contact.payment || 'ABA KHQR / COD';
          const notes = ord.notes || ord.note || contact.notes || '';

          const currentStatus = (ord.status || 'pending').toLowerCase();
          const isPending = currentStatus === 'pending';

          const isExpanded = !!expandedOrders[ord.id];
          const visibleItems = isExpanded || items.length <= 3 ? items : items.slice(0, 3);

          const subtotalUSD = items.reduce((sum, it) => sum + (+it.price || 0) * (+it.qty || 1), 0);
          const deliveryUSD = ord.delivery !== undefined ? Number(ord.delivery) : 1.50;
          const voucherInfo = getOrderVoucherInfo(ord);
          const discountUSD = Number(voucherInfo?.discount !== undefined ? voucherInfo.discount : (ord.discount || 0));
          const totalUSD = Number(ord.total) || Math.max(0, subtotalUSD - discountUSD + deliveryUSD);
          const rate = Number(settings?.exchange_rate) || 4100;

          return (
            <View
              key={ord.id}
              style={[styles.orderCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              {/* Receipt Header Bar */}
              <View style={styles.topRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                  <View style={[styles.receiptPill, { backgroundColor: theme.gold + '20', borderColor: theme.gold }]}>
                    <Text style={[styles.receiptPillText, { color: theme.gold }]}>
                      {lang === 'km' ? `វិក្កយបត្រ #${receiptNum}` : `Receipt #${receiptNum}`}
                    </Text>
                  </View>
                  {voucherInfo && (
                    <View style={[styles.voucherBadgePill, { backgroundColor: 'rgba(236, 72, 153, 0.15)', borderColor: '#ec4899' }]}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#ec4899' }}>
                        🎟️ VOUCHER: {voucherInfo.code} {voucherInfo.pct > 0 ? `(-${voucherInfo.pct}%)` : ''}
                      </Text>
                    </View>
                  )}
                  {ord.id && ord.id !== receiptNum ? (
                    <View style={[styles.orderIdPill, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                      <Text style={{ fontSize: 9.5, color: theme.textMuted, fontWeight: '700' }}>
                        ID: {ord.id}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor:
                          currentStatus === 'confirmed' || currentStatus === 'approved' || currentStatus === 'completed'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : currentStatus === 'delivering'
                            ? 'rgba(6, 182, 212, 0.15)'
                            : currentStatus === 'rejected'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(234, 179, 8, 0.15)',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontWeight: '800',
                        color:
                          currentStatus === 'confirmed' || currentStatus === 'approved' || currentStatus === 'completed'
                            ? '#10b981'
                            : currentStatus === 'delivering'
                            ? '#06b6d4'
                            : currentStatus === 'rejected'
                            ? '#ef4444'
                            : '#eab308',
                      }}
                    >
                      {lang === 'km'
                        ? currentStatus === 'confirmed' || currentStatus === 'approved'
                          ? 'បានអនុម័ត'
                          : currentStatus === 'delivering'
                          ? 'កំពុងដឹកជញ្ជូន'
                          : currentStatus === 'completed'
                          ? 'បានបញ្ចប់'
                          : currentStatus === 'rejected'
                          ? 'បានបដិសេធ'
                          : 'រង់ចាំពិនិត្យ'
                        : currentStatus.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.dateText, { color: theme.textMuted }]}>
                  {ord.created_at || (lang === 'km' ? 'ទើបតែឥឡូវនេះ' : 'Just now')}
                </Text>
              </View>

              {/* Customer Contact & Delivery Info */}
              <View style={[styles.infoBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <View style={styles.customerHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                    <TelegramAvatar size={26} ringColor="#229ED9" />
                    <Text style={[styles.customerNameTitle, { color: theme.text }]} numberOfLines={1}>
                      <Text style={{ fontWeight: '800' }}>{lang === 'km' ? 'អតិថិជន: ' : 'CUSTOMER: '}</Text>
                      {customerName}
                    </Text>
                  </View>
                  {telegramHandle ? (
                    <TouchableOpacity
                      style={[
                        styles.telegramBadge,
                        {
                          backgroundColor: 'rgba(34, 158, 217, 0.15)',
                          borderColor: '#229ED9',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                        },
                      ]}
                      onPress={() => openTelegramCustomer(telegramHandle)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Open Telegram chat with customer @${telegramHandle}`}
                    >
                      <TelegramIcon size={12} variant="circle" />
                      <Text style={{ color: '#229ED9', fontSize: 11, fontWeight: '800' }}>
                        @{telegramHandle}
                      </Text>
                      <Text style={{ color: '#229ED9', fontSize: 10, fontWeight: '900', marginLeft: 1 }}>
                        ↗
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.contactInfoRow}>
                  <Text style={{ fontSize: 11.5, color: theme.textMuted, width: 80, fontWeight: '700' }}>{lang === 'km' ? 'ទូរស័ព្ទ:' : 'PHONE:'}</Text>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: theme.primary, flex: 1 }}>
                    {phoneNumber}
                  </Text>
                </View>

                <View style={styles.contactInfoRow}>
                  <Text style={{ fontSize: 11.5, color: theme.textMuted, width: 80, fontWeight: '700' }}>{lang === 'km' ? 'អាសយដ្ឋាន:' : 'ADDRESS:'}</Text>
                  <Text style={{ fontSize: 11.5, color: theme.text, flex: 1 }}>
                    {deliveryAddr}
                  </Text>
                </View>

                <View style={styles.contactInfoRow}>
                  <Text style={{ fontSize: 11.5, color: theme.textMuted, width: 80, fontWeight: '700' }}>{lang === 'km' ? 'ការទូទាត់:' : 'PAYMENT:'}</Text>
                  <Text style={{ fontSize: 11.5, color: theme.text, flex: 1, fontWeight: '600' }}>
                    {paymentMethod}
                  </Text>
                </View>

                {notes ? (
                  <View style={[styles.notesBox, { backgroundColor: theme.gold + '15', borderColor: theme.gold + '40' }]}>
                    <Text style={{ fontSize: 11, color: theme.gold, fontWeight: '700' }}>
                      📝 {lang === 'km' ? 'ចំណាំ:' : 'NOTES:'} {notes}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Items Section Header */}
              <View style={styles.receiptTableHeader}>
                <Text style={[styles.receiptTableHeadText, { color: theme.textMuted }]}>
                  {lang === 'km' ? 'ការពិពណ៌នា' : 'DESCRIPTION'}
                </Text>
                <Text style={[styles.receiptTableHeadText, { color: theme.textMuted }]}>
                  {lang === 'km' ? 'តម្លៃ' : 'AMOUNT'}
                </Text>
              </View>

              {/* Items List with Picture on the Left Side */}
              <View style={styles.receiptItemsList}>
                {visibleItems.map((it, idx) => {
                  const itPrice = +it.price || 0;
                  const itQty = +it.qty || 1;
                  const lineTotalUSD = itPrice * itQty;
                  const lineTotalKHR = Math.round(lineTotalUSD * rate);
                  const imgSource = getOrderItemImageSource(it, products, charms);
                  const catLabel = getOrderItemCategory(it, products);
                  const braceletLinks = extractBraceletLinks(it, charms);
                  const isCharmOrBracelet = it.isCustom ||
                    catLabel === 'CHARM' ||
                    catLabel === 'BRACELET' ||
                    (it.name && it.name.toLowerCase().includes('charm')) ||
                    braceletLinks.length > 0;

                  return (
                    <View
                      key={idx}
                      style={[
                        styles.receiptItemCard,
                        {
                          backgroundColor: theme.inputBg,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <View style={styles.receiptItemMainRow}>
                        {/* Product Thumbnail on the Left Side */}
                        {isCharmOrBracelet && !(it.image && typeof it.image === 'string' && it.image.startsWith('data:image/')) && !it.braceletPreviewImage ? (
                          <View style={styles.receiptItemThumbWrap}>
                            <ModularCharmLink
                              charm={braceletLinks[0] || it}
                              size="receipt"
                              showHook={false}
                            />
                          </View>
                        ) : (
                          <Image
                            source={imgSource}
                            style={[
                              styles.receiptItemThumb,
                              isCharmOrBracelet && styles.receiptBraceletThumb,
                              { borderColor: theme.border },
                            ]}
                            resizeMode={isCharmOrBracelet ? "contain" : "cover"}
                          />
                        )}

                        {/* Product Title and Details */}
                        <View style={styles.receiptItemDetails}>
                          <Text
                            style={[styles.receiptItemTitle, { color: theme.text }]}
                            numberOfLines={2}
                          >
                            {it.name || 'Product'}
                          </Text>

                          <View style={styles.receiptItemMetaRow}>
                            <View style={[styles.catBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
                              <Text style={[styles.catBadgeText, { color: theme.textMuted }]}>
                                {catLabel}
                              </Text>
                            </View>

                            <View style={[styles.qtyBadge, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}>
                              <Text style={[styles.qtyBadgeText, { color: theme.primary }]}>
                                {lang === 'km' ? 'ចំនួន:' : 'Qty:'} {itQty}
                              </Text>
                            </View>
                          </View>

                          {it.charms && !it.styleId ? (
                            <Text style={[styles.receiptCharmsNote, { color: theme.gold }]} numberOfLines={2}>
                              ✨ {it.charms}
                            </Text>
                          ) : null}
                        </View>

                        {/* Price Column on the Right */}
                        <View style={styles.receiptItemPriceCol}>
                          <Text style={[styles.receiptItemPriceKhr, { color: theme.gold }]}>
                            {lineTotalKHR.toLocaleString()} ៛
                          </Text>
                          <Text style={[styles.receiptItemPriceUsd, { color: theme.textMuted }]}>
                            ${lineTotalUSD.toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      {/* Full Custom Bracelet View Box on Receipt */}
                      {braceletLinks.length > 0 && (
                        <FullBraceletReceiptBox
                          links={braceletLinks}
                          styleId={it.styleId}
                          finish={it.bandFinish}
                          theme={theme}
                        />
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Collapsible See More Toggle */}
              {items.length > 3 && (
                <TouchableOpacity
                  style={[styles.seeMoreBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                  onPress={() => toggleOrderExpand(ord.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.seeMoreText, { color: theme.primary }]}>
                    {isExpanded
                      ? (lang === 'km' ? 'បង្រួម ∧' : 'SHOW LESS ∧')
                      : (lang === 'km' ? `មើលបន្ថែម (${items.length - 3} ទៀត) ∨` : `SEE MORE (${items.length - 3} MORE) ∨`)}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Receipt Summary Card */}
              <View style={[styles.receiptSummaryCard, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>
                    {lang === 'km' ? 'សរុបរង' : 'SUBTOTAL'}
                  </Text>
                  <Text style={[styles.summaryVal, { color: theme.text }]}>
                    {Math.round(subtotalUSD * rate).toLocaleString()} ៛ (${subtotalUSD.toFixed(2)})
                  </Text>
                </View>

                {voucherInfo ? (
                  <>
                    <View style={styles.summaryRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 11 }}>🎟️</Text>
                        <Text style={[styles.summaryLabel, { color: '#ec4899', fontWeight: '800' }]}>
                          {lang === 'km' ? 'ប័ណ្ណបញ្ចុះតម្លៃ' : 'VOUCHER'} ({voucherInfo.code})
                        </Text>
                      </View>
                      <Text style={[styles.summaryVal, { color: '#ec4899', fontWeight: '800' }]}>
                        -{voucherInfo.pct}% OFF
                      </Text>
                    </View>

                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.error }]}>
                        {lang === 'km' ? 'កាត់បញ្ចុះតម្លៃ' : 'DISCOUNT DEDUCTION'}
                      </Text>
                      <Text style={[styles.summaryVal, { color: theme.error, fontWeight: '700' }]}>
                        -{Math.round(discountUSD * rate).toLocaleString()} ៛ (-${discountUSD.toFixed(2)})
                      </Text>
                    </View>

                    <View style={[styles.summaryRow, { backgroundColor: 'rgba(16, 185, 129, 0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }]}>
                      <Text style={[styles.summaryLabel, { color: theme.secondary || '#10b981', fontWeight: '800' }]}>
                        {lang === 'km' ? 'តម្លៃក្រោយបញ្ចុះ' : 'PRICE AFTER DISCOUNT'}
                      </Text>
                      <Text style={[styles.summaryVal, { color: theme.secondary || '#10b981', fontWeight: '900' }]}>
                        {Math.round(Math.max(0, subtotalUSD - discountUSD) * rate).toLocaleString()} ៛ (${Math.max(0, subtotalUSD - discountUSD).toFixed(2)})
                      </Text>
                    </View>
                  </>
                ) : discountUSD > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>
                      {lang === 'km' ? 'បញ្ចុះតម្លៃ' : 'DISCOUNT'}
                    </Text>
                    <Text style={[styles.summaryVal, { color: theme.error }]}>
                      -{Math.round(discountUSD * rate).toLocaleString()} ៛ (-${discountUSD.toFixed(2)})
                    </Text>
                  </View>
                ) : null}

                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>
                    {lang === 'km' ? 'ថ្លៃដឹកជញ្ជូន' : 'DELIVERY CHARGE'}
                  </Text>
                  <Text style={[styles.summaryVal, { color: theme.text }]}>
                    {Math.round(deliveryUSD * rate).toLocaleString()} ៛ (${deliveryUSD.toFixed(2)})
                  </Text>
                </View>

                <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />

                <View style={styles.summaryTotalRow}>
                  <View>
                    <Text style={[styles.totalDueLabel, { color: theme.text }]}>
                      {lang === 'km' ? 'សរុបត្រូវបង់' : 'TOTAL DUE'}
                    </Text>
                    <Text style={{ fontSize: 10, color: theme.textMuted }}>$1 = {rate.toLocaleString()} ៛ KHR</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.totalDueKhr, { color: theme.gold }]}>
                      {Math.round(totalUSD * rate).toLocaleString()} ៛
                    </Text>
                    <Text style={[styles.totalDueUsd, { color: theme.primary }]}>
                      ${totalUSD.toFixed(2)} USD
                    </Text>
                  </View>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.editReceiptBtn, { borderColor: theme.primary, backgroundColor: theme.primary + '18' }]}
                  onPress={() => setEditingOrder(ord)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.editReceiptBtnText, { color: theme.primary }]}>
                    {lang === 'km' ? '✏️ កែប្រែវិក្កយបត្រ' : '✏️ Edit Receipt'}
                  </Text>
                </TouchableOpacity>

                {isPending ? (
                  <>
                    <TouchableOpacity
                      style={[styles.approveBtn, { backgroundColor: theme.primary }]}
                      onPress={() => handleApprove(ord.id)}
                      disabled={loadingAction === ord.id}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.approveBtnText}>
                        {loadingAction === ord.id
                          ? (lang === 'km' ? 'កំពុងដំណើរការ...' : 'Processing...')
                          : (lang === 'km' ? '✓ អនុម័ត' : '✓ Approve')}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.rejectBtn, { borderColor: theme.error }]}
                      onPress={() => handleReject(ord.id)}
                      disabled={loadingAction === ord.id}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: theme.error, fontWeight: '800', fontSize: 12 }}>
                        {lang === 'km' ? '✕ បដិសេធ' : '✕ Reject'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={styles.statusChangeRow}>
                    {currentStatus !== 'delivering' && currentStatus !== 'completed' && currentStatus !== 'rejected' && (
                      <TouchableOpacity
                        style={[styles.smStatusBtn, { backgroundColor: theme.cyan }]}
                        onPress={() => handleUpdateStatus(ord.id, 'delivering')}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.smStatusText}>
                          {lang === 'km' ? '🚚 កំពុងដឹកជញ្ជូន' : '🚚 Set Delivering'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {currentStatus !== 'completed' && currentStatus !== 'rejected' && (
                      <TouchableOpacity
                        style={[styles.smStatusBtn, { backgroundColor: theme.primary }]}
                        onPress={() => handleUpdateStatus(ord.id, 'completed')}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.smStatusText}>
                          {lang === 'km' ? '🎉 បញ្ចប់ការកម្ម៉ង់' : '🎉 Set Completed'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })
      )}

      {/* Edit Receipt Modal */}
      <AdminEditReceiptModal
        visible={!!editingOrder}
        order={editingOrder}
        onClose={() => setEditingOrder(null)}
        onSave={handleSaveEditedReceipt}
        theme={theme}
      />
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
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  wipeOrdersBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  filterBarWrapper: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  filterNudgeBtn: {
    width: 22,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  filterNudgeText: {
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  orderCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  receiptBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  receiptPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  voucherBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  receiptPillText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  refText: {
    fontSize: 15,
    fontWeight: '800',
  },
  dateText: {
    fontSize: 11,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  infoBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  customerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  customerNameTitle: {
    fontSize: 13,
  },
  telegramBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    cursor: 'pointer',
  },
  contactInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  notesBox: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
  },
  infoRow: {
    fontSize: 12,
    marginVertical: 2,
  },
  itemsList: {
    marginVertical: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  itemName: {
    fontSize: 12,
    flex: 1,
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  totalAmt: {
    fontSize: 18,
    fontWeight: '900',
  },
  receiptTableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
    marginTop: 2,
    marginBottom: 4,
  },
  receiptTableHeadText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  receiptItemsList: {
    gap: 8,
    marginVertical: 4,
  },
  receiptItemCard: {
    flexDirection: 'column',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  receiptItemMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  receiptItemThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(150, 150, 150, 0.08)',
  },
  receiptBraceletThumb: {
    width: 64,
    height: 48,
    backgroundColor: '#ffffff',
  },
  receiptItemThumbWrap: {
    width: 52,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptStyleIdBadge: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  receiptStyleIdText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  receiptItemDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  receiptItemTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 3,
  },
  receiptItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  catBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  qtyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  qtyBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  receiptCharmsNote: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  receiptItemPriceCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 70,
  },
  receiptItemPriceKhr: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  receiptItemPriceUsd: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  seeMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginVertical: 4,
  },
  seeMoreText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  receiptSummaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginTop: 6,
    marginBottom: 10,
    gap: 5,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  summaryVal: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  summaryDivider: {
    height: 1,
    marginVertical: 4,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 2,
  },
  totalDueLabel: {
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  totalDueKhr: {
    fontSize: 15,
    fontWeight: '900',
  },
  totalDueUsd: {
    fontSize: 12,
    fontWeight: '800',
  },
  headerBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  autoWipePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  editReceiptBtn: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editReceiptBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  approveBtn: {
    flex: 2,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '800',
  },
  rejectBtn: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChangeRow: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  smStatusBtn: {
    flex: 1,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smStatusText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '800',
  },
  searchBarContainer: {
    width: '100%',
    marginBottom: 8,
  },
  searchBarInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    height: 38,
    fontSize: 12,
    padding: 0,
  },
  clearSearchBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchAllBadge: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  searchAllBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearSearchPromptBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  orderIdPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
});
