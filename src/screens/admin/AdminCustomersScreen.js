import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { ApiClient } from '../../api/client';
import { TelegramAvatar } from '../../components/TelegramAvatar';

export const AdminCustomersScreen = () => {
  const { theme, lang, adminToken, showToast } = useApp();

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null);

  const fetchUsers = useCallback(async () => {
    const res = await ApiClient.getUsers(adminToken);
    if (res.ok && Array.isArray(res.users)) {
      setUsers(res.users);
    }
  }, [adminToken]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  };

  const handleAdjustPoints = async (userId, delta) => {
    setLoadingAction(userId);
    const res = await ApiClient.adjustUserPoints(userId, delta, `Admin manual adjustment (${delta > 0 ? '+' : ''}${delta})`, adminToken);
    setLoadingAction(null);
    if (res.ok) {
      await fetchUsers();
      showToast(`User points updated (${delta > 0 ? '+' : ''}${delta})`);
    } else {
      Alert.alert('Points Update Failed', res.error || 'Could not update points');
    }
  };

  const filtered = users.filter(
    (u) =>
      !search.trim() ||
      u.username?.toLowerCase().includes(search.toLowerCase()) ||
      u.phone?.includes(search)
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
      }
    >
      <Text style={[styles.title, { color: theme.text }]}>
        {lang === 'km' ? '👥 គណនីអតិថិជន និងពិន្ទុសន្សំ' : '👥 Customer Accounts & Loyalty Points'}
      </Text>

      {/* Search */}
      <TextInput
        style={[
          styles.searchInput,
          { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
        ]}
        placeholder={
          lang === 'km'
            ? '🔍 ស្វែងរកអតិថិជនតាម Telegram ឬលេខទូរស័ព្ទ...'
            : '🔍 Search customers by Telegram or phone...'
        }
        placeholderTextColor={theme.textMuted}
        value={search}
        onChangeText={setSearch}
      />

      {/* Users List */}
      <View style={styles.list}>
        {filtered.map((u) => {
          let vouchers = [];
          try {
            vouchers = typeof u.vouchers === 'string' ? JSON.parse(u.vouchers) : (u.vouchers || []);
          } catch (e) {}

          return (
            <View
              key={u.id}
              style={[styles.userCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <TelegramAvatar
                size={42}
                style={{ marginRight: 12 }}
                ringColor="#229ED9"
                showBadge={true}
              />
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: theme.text }]}>
                  @{u.username}
                </Text>
                <Text style={{ fontSize: 11, color: theme.textMuted }}>
                  📞 {u.phone || (lang === 'km' ? 'គ្មានលេខទូរស័ព្ទ' : 'No phone')}
                </Text>
                <Text style={{ fontSize: 11, color: theme.cyan, marginTop: 2 }}>
                  🎟️ {vouchers.filter(v => !v.used).length} {lang === 'km' ? 'ប័ណ្ណបញ្ចុះតម្លៃសកម្ម' : 'Active Vouchers'}
                </Text>
              </View>

              {/* Points & Adjustments */}
              <View style={styles.pointsCol}>
                <Text style={[styles.pointsVal, { color: theme.gold }]}>
                  ⭐ {u.points || 0} pt
                </Text>

                <View style={styles.pointBtns}>
                  <TouchableOpacity
                    style={[styles.ptBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                    onPress={() => handleAdjustPoints(u.id, -10)}
                    disabled={loadingAction === u.id}
                  >
                    <Text style={{ color: theme.error, fontSize: 11, fontWeight: '700' }}>-10</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.ptBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                    onPress={() => handleAdjustPoints(u.id, 10)}
                    disabled={loadingAction === u.id}
                  >
                    <Text style={{ color: theme.success, fontSize: 11, fontWeight: '700' }}>+10</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
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
    gap: 10,
  },
  title: {
    fontSize: 16.5,
    fontWeight: '800',
  },
  searchInput: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 12,
  },
  list: {
    gap: 8,
  },
  userCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  pointsCol: {
    alignItems: 'flex-end',
  },
  pointsVal: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  pointBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  ptBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
});
