import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { ApiClient } from '../../api/client';
import { AdminCategoryFiltersModal } from '../../components/AdminCategoryFiltersModal';

export const AdminCategoriesScreen = () => {
  const {
    theme,
    lang,
    categories,
    products,
    categoryFilters,
    adminToken,
    refreshCatalog,
    showToast,
  } = useApp();

  const [name, setName] = useState('');
  const [kh, setKh] = useState('');
  const [icon, setIcon] = useState('🛍️');
  const [loading, setLoading] = useState(false);

  // Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editName, setEditName] = useState('');
  const [editKh, setEditKh] = useState('');
  const [editIcon, setEditIcon] = useState('');

  // Category Filters Modal State
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterTargetCatId, setFilterTargetCatId] = useState('all');

  const handleAddCategory = async () => {
    if (!name.trim()) {
      showToast('Please enter category name');
      return;
    }

    setLoading(true);
    const id = name.trim().toLowerCase().replace(/\s+/g, '-');
    const payload = {
      id,
      name: name.trim(),
      kh: kh.trim() || name.trim(),
      en: name.trim(),
      icon: icon.trim() || '🛍️',
      grad: 'linear-gradient(135deg,#06b6d4,#3b82f6)',
      sort_order: categories.length + 1,
    };

    const res = await ApiClient.createCategory(payload, adminToken);
    setLoading(false);

    if (res.ok) {
      setName('');
      setKh('');
      await refreshCatalog();
      showToast('✓ Category added!');
    } else {
      Alert.alert('Add Failed', res.error || 'Could not add category');
    }
  };

  const openEditModal = (cat) => {
    setEditingCategory(cat);
    setEditName(cat.name || '');
    setEditKh(cat.kh || '');
    setEditIcon(cat.icon || '🛍️');
    setEditModalVisible(true);
  };

  const handleSaveEditCategory = async () => {
    if (!editName.trim() || !editingCategory) return;
    setLoading(true);

    const payload = {
      ...editingCategory,
      name: editName.trim(),
      kh: editKh.trim() || editName.trim(),
      en: editName.trim(),
      icon: editIcon.trim() || '🛍️',
    };

    const res = await ApiClient.createCategory(payload, adminToken);
    setLoading(false);

    if (res.ok) {
      setEditModalVisible(false);
      await refreshCatalog();
      showToast('✓ Category updated!');
    } else {
      Alert.alert('Update Failed', res.error || 'Could not update category');
    }
  };

  const handleDeleteCategory = (cat) => {
    Alert.alert('Delete Category', `Are you sure you want to delete "${cat.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await ApiClient.deleteCategory(cat.id, adminToken);
          if (res.ok) {
            await refreshCatalog();
            showToast('Category deleted');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: theme.text }]}>
        {lang === 'km' ? '🏷️ ការគ្រប់គ្រងប្រភេទ' : '🏷️ Category Management'}
      </Text>

      {/* Dynamic Product Filters Banner for Admin */}
      <TouchableOpacity
        style={[styles.filtersBanner, { backgroundColor: theme.card, borderColor: theme.primary }]}
        onPress={() => {
          setFilterTargetCatId('all');
          setFilterModalVisible(true);
        }}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 22 }}>🏷️</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.filtersBannerTitle, { color: theme.text }]}>
                {lang === 'km' ? 'គ្រប់គ្រងតម្រងផលិតផល (Filters)' : 'Manage Category Filters'}
              </Text>
              <View style={[styles.filtersCountPill, { backgroundColor: theme.primary + '20' }]}>
                <Text style={{ color: theme.primary, fontSize: 10, fontWeight: '800' }}>
                  {categoryFilters?.length || 0}
                </Text>
              </View>
            </View>
            <Text style={[styles.filtersBannerSub, { color: theme.textMuted }]}>
              {lang === 'km'
                ? 'បង្កើត & កែប្រែ Filters សម្រាប់គ្រប់ Categories ដោយជ្រើសរើស ឬស្វែងរកតាមឈ្មោះ/ការពណ៌នា'
                : 'Add & customize dynamic filters for every category by product or auto-keyword match'}
            </Text>
          </View>
          <View style={[styles.bannerOpenBtn, { backgroundColor: theme.primary }]}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
              {lang === 'km' ? 'កែប្រែ →' : 'Manage →'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Add Category Card */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          {lang === 'km' ? '+ បន្ថែមប្រភេទថ្មី' : '+ Add New Category'}
        </Text>

        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
          placeholder={lang === 'km' ? 'ឈ្មោះជាភាសាអង់គ្លេស (ឧ. Luxury Watches)' : 'English Name (e.g. Luxury Watches)'}
          placeholderTextColor={theme.textMuted}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
          placeholder={lang === 'km' ? 'ឈ្មោះជាភាសាខ្មែរ (ឧ. នាឡិកាប្រណិត)' : 'Khmer Name (e.g. នាឡិកាប្រណិត)'}
          placeholderTextColor={theme.textMuted}
          value={kh}
          onChangeText={setKh}
        />
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
          placeholder={lang === 'km' ? 'រូបតំណាង Emoji (ឧ. ⌚, 🧸, 📿)' : 'Icon Emoji (e.g. ⌚, 🧸, 📿)'}
          placeholderTextColor={theme.textMuted}
          value={icon}
          onChangeText={setIcon}
        />

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
          onPress={handleAddCategory}
          disabled={loading}
        >
          <Text style={styles.addBtnText}>
            {loading ? (lang === 'km' ? 'កំពុងបន្ថែម...' : 'Adding...') : (lang === 'km' ? 'បន្ថែមប្រភេទ' : 'Add Category')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Categories List */}
      <View style={styles.list}>
        {categories.map((c) => {
          const catFiltersCount = (categoryFilters || []).filter(
            (f) => f.category_id === c.id || f.category_id === 'all'
          ).length;

          return (
            <View
              key={c.id}
              style={[styles.catCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Text style={styles.catIcon}>{c.icon || '🛍️'}</Text>
              <View style={styles.catInfo}>
                <Text style={[styles.catName, { color: theme.text }]}>{c.name}</Text>
                <Text style={{ fontSize: 11, color: theme.textMuted }}>{c.kh || c.en || c.id}</Text>
              </View>

              <View style={styles.catActionRow}>
                <TouchableOpacity
                  style={[styles.filterBtn, { borderColor: theme.primary, backgroundColor: theme.primary + '12' }]}
                  onPress={() => {
                    setFilterTargetCatId(c.id);
                    setFilterModalVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '800' }}>
                    🏷️ {lang === 'km' ? `តម្រង (${catFiltersCount})` : `Filters (${catFiltersCount})`}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => openEditModal(c)}
                >
                  <Text style={{ color: theme.cyan, fontSize: 12, fontWeight: '700' }}>
                    {lang === 'km' ? '✏️ កែប្រែ' : '✏️ Edit'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleDeleteCategory(c)}
                >
                  <Text style={{ color: theme.error, fontSize: 12, fontWeight: '700' }}>
                    {lang === 'km' ? '🗑️ លុប' : '🗑️ Delete'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>

      {/* Edit Category Modal */}
      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>✏️ Edit Category</Text>

            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>English Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
              value={editName}
              onChangeText={setEditName}
            />

            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Khmer Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
              value={editKh}
              onChangeText={setEditKh}
            />

            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Icon Emoji</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
              value={editIcon}
              onChangeText={setEditIcon}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.inputBg }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={{ color: theme.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.primary }]}
                onPress={handleSaveEditCategory}
                disabled={loading}
              >
                <Text style={{ color: '#ffffff', fontWeight: '800' }}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Category Filters Modal */}
      <AdminCategoryFiltersModal
        visible={filterModalVisible}
        initialCategoryId={filterTargetCatId}
        categories={categories}
        products={products}
        categoryFilters={categoryFilters}
        adminToken={adminToken}
        theme={theme}
        onClose={() => setFilterModalVisible(false)}
        onSaved={async () => {
          await refreshCatalog();
        }}
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
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  filtersBanner: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
  },
  filtersBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  filtersCountPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  filtersBannerSub: {
    fontSize: 10.5,
    marginTop: 2,
    lineHeight: 14,
  },
  bannerOpenBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  filterBtn: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },
  input: {
    height: 36,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 11,
    fontSize: 12,
    marginBottom: 9,
  },
  addBtn: {
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  list: {
    gap: 8,
  },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 9,
  },
  catIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  catInfo: {
    flex: 1,
  },
  catName: {
    fontSize: 13,
    fontWeight: '700',
  },
  catActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    padding: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
