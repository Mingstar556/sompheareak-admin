import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Image,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { ApiClient } from '../../api/client';
import { generateProductId, isProductIdDuplicate } from '../../utils/productIdHelper';
import { resolveProductImage, CATEGORY_FALLBACK_IMAGES } from '../../utils/productImageHelper';

export const AdminProductsScreen = () => {
  const {
    theme,
    lang,
    products,
    categories,
    settings,
    adminToken,
    refreshCatalog,
    showToast,
  } = useApp();

  const rate = Number(settings?.exchange_rate) || 4100;

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Layout View Mode: 'list' (Line) or 'grid' (Grid)
  const [viewLayout, setViewLayout] = useState('list');

  // 4 by 4 Grid responsive calculations
  const gridColumns = width >= 1024 ? 4 : width >= 680 ? 3 : 2;
  const gridGap = width >= 1024 ? 14 : 10;
  const gridCardWidth = Platform.OS === 'web'
    ? (gridColumns === 4
        ? 'calc(25% - 10.5px)'
        : gridColumns === 3
        ? 'calc(33.333% - 9.333px)'
        : 'calc(50% - 5px)')
    : Math.floor((width - 24 - (gridColumns - 1) * gridGap) / gridColumns);

  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState('all'); // 'all', 'id', 'name'
  const [selectedFilter, setSelectedFilter] = useState('all'); // 'all', 'low_stock', 'out_of_stock', or category id
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const catScrollRef = useRef(null);
  const [catScrollPos, setCatScrollPos] = useState(0);

  const handleNudgeCat = (direction) => {
    const delta = direction === 'left' ? -150 : 150;
    const nextX = Math.max(0, catScrollPos + delta);
    setCatScrollPos(nextX);
    catScrollRef.current?.scrollTo({ x: nextX, animated: true });
  };

  // Form State
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formCat, setFormCat] = useState('minifigure');
  const [formPrice, setFormPrice] = useState('10.00');
  const [formDiscount, setFormDiscount] = useState('0');
  const [formStock, setFormStock] = useState('10');
  const [formPt, setFormPt] = useState('1');
  const [formImage, setFormImage] = useState('');
  const [formFreeDelivery, setFormFreeDelivery] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Metrics
  const stats = useMemo(() => {
    const list = Array.isArray(products) ? products : [];
    const total = list.length;
    const lowStock = list.filter((p) => {
      const s = Number(p.stock) || 0;
      return s > 0 && s < 5;
    }).length;
    const outOfStock = list.filter((p) => (Number(p.stock) || 0) <= 0).length;
    const inStock = total - outOfStock;
    return { total, lowStock, outOfStock, inStock };
  }, [products]);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormId(generateProductId(products));
    setFormName('');
    setFormCat(categories[0]?.id || 'minifigure');
    setFormPrice('10.00');
    setFormDiscount('0');
    setFormStock('10');
    setFormPt('1');
    setFormImage('');
    setFormFreeDelivery(false);
    setModalVisible(true);
  };

  const handlePickFile = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp';
      input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          if (file.size > 8 * 1024 * 1024) {
            Alert.alert('File Too Large', 'Please select an image under 8MB.');
            return;
          }
          const reader = new FileReader();
          reader.onload = (uploadEvent) => {
            setFormImage(uploadEvent.target.result);
            showToast('✓ Image uploaded successfully');
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    }
  };

  const openEditModal = (p) => {
    setEditingProduct(p);
    setFormId(p.id);
    setFormName(p.name);
    setFormCat(p.cat);
    setFormPrice(String(p.price));
    setFormDiscount(String(p.discount || 0));
    setFormStock(String(p.stock));
    setFormPt(String(p.pt || 1));
    setFormImage(p.image || '');
    setFormFreeDelivery(Boolean(p.free_delivery === 1 || p.free_delivery === true || p.free_delivery === '1'));
    setModalVisible(true);
  };

  const handleSaveProduct = async () => {
    if (!formName.trim()) {
      showToast('Please enter product name');
      return;
    }
    const cleanId = (formId || '').trim().toUpperCase();
    if (!cleanId) {
      showToast('Product ID is required');
      return;
    }
    if (isProductIdDuplicate(cleanId, editingProduct?.id, products)) {
      Alert.alert('Duplicate Product ID', `Product ID "${cleanId}" is already assigned to another product. Each product must have a unique non-duplicate ID.`);
      return;
    }

    setSubmitting(true);
    const payload = {
      id: cleanId,
      prev_id: editingProduct?.id,
      is_new: !editingProduct,
      name: formName.trim(),
      cat: formCat,
      price: parseFloat(formPrice) || 0,
      discount: parseFloat(formDiscount) || 0,
      stock: parseInt(formStock, 10) || 0,
      pt: parseInt(formPt, 10) || 1,
      image: formImage.trim() || (CATEGORY_FALLBACK_IMAGES[formCat] || CATEGORY_FALLBACK_IMAGES['minifigure']),
      free_delivery: formFreeDelivery,
    };

    const res = await ApiClient.createProduct(payload, adminToken);
    setSubmitting(false);

    if (res.ok) {
      setModalVisible(false);
      await refreshCatalog();
      showToast(editingProduct ? '✓ Product updated live!' : '✓ Product created with unique ID!');
    } else {
      Alert.alert('Save Failed', res.error || 'Could not save product');
    }
  };

  const handleQuickStock = async (prodId, delta) => {
    const res = await ApiClient.updateProductStock(prodId, delta, adminToken);
    if (res.ok) {
      await refreshCatalog();
      showToast(`Stock updated (${delta > 0 ? '+' : ''}${delta})`);
    }
  };

  const handleDeleteProduct = (p) => {
    Alert.alert('Delete Product', `Are you sure you want to delete "${p.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await ApiClient.deleteProduct(p.id, adminToken);
          if (res.ok) {
            await refreshCatalog();
            showToast('Product removed');
          }
        },
      },
    ]);
  };

  // Product ID Search Engine & Filtering
  const filtered = useMemo(() => {
    return products.filter((p) => {
      let matchFilter = true;
      const stockNum = Number(p.stock) || 0;
      if (selectedFilter === 'low_stock') {
        matchFilter = stockNum > 0 && stockNum < 5;
      } else if (selectedFilter === 'out_of_stock') {
        matchFilter = stockNum <= 0;
      } else if (selectedFilter !== 'all') {
        matchFilter = p.cat === selectedFilter;
      }

      const q = search.trim().toLowerCase();
      let matchSearch = true;
      if (q) {
        const idMatch = (p.id || '').toLowerCase().includes(q);
        const nameMatch = (p.name || '').toLowerCase().includes(q);
        const catMatch = (p.cat || '').toLowerCase().includes(q);

        if (searchMode === 'id') {
          matchSearch = idMatch;
        } else if (searchMode === 'name') {
          matchSearch = nameMatch;
        } else {
          matchSearch = idMatch || nameMatch || catMatch;
        }
      }

      return matchFilter && matchSearch;
    });
  }, [products, selectedFilter, search, searchMode]);

  const previewPrice = parseFloat(formPrice) || 0;
  const previewDiscount = parseFloat(formDiscount) || 0;
  const previewFinalPrice = previewDiscount > 0 ? previewPrice * (1 - previewDiscount / 100) : previewPrice;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.innerContainer}>
        {/* Top Header Row */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>
              {lang === 'km' ? '🛍️ កាតាឡុកទំនិញ' : '🛍️ Product Catalog'}
            </Text>
            <Text style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2 }}>
              {lang === 'km' ? 'គ្រប់គ្រងតម្លៃ ស្តុក និងកាតាឡុកទំនិញ' : 'Manage pricing, inventory & catalog'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.primary }]}
            onPress={openAddModal}
            activeOpacity={0.8}
          >
            <Text style={styles.addBtnText}>
              {lang === 'km' ? '+ បន្ថែមទំនិញ' : '+ Add Product'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Inventory Health Cards */}
        <View style={styles.statsGrid}>
          <View style={[styles.statBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statBoxNum, { color: theme.text }]}>{stats.total}</Text>
            <Text style={[styles.statBoxLabel, { color: theme.textMuted }]}>
              {lang === 'km' ? 'ទំនិញសរុប' : 'Total Items'}
            </Text>
          </View>

          <View style={[styles.statBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statBoxNum, { color: theme.primary }]}>{stats.inStock}</Text>
            <Text style={[styles.statBoxLabel, { color: theme.textMuted }]}>
              {lang === 'km' ? 'ក្នុងស្តុក' : 'In Stock'}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.statBox,
              {
                backgroundColor: stats.lowStock > 0 ? 'rgba(234, 179, 8, 0.1)' : theme.card,
                borderColor: stats.lowStock > 0 ? theme.gold : theme.border,
              },
            ]}
            onPress={() => setSelectedFilter(selectedFilter === 'low_stock' ? 'all' : 'low_stock')}
          >
            <Text style={[styles.statBoxNum, { color: theme.gold }]}>{stats.lowStock}</Text>
            <Text style={[styles.statBoxLabel, { color: theme.gold }]}>
              {lang === 'km' ? 'ជិតអស់ (< 5)' : 'Low Stock (< 5)'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statBox,
              {
                backgroundColor: stats.outOfStock > 0 ? 'rgba(239, 68, 68, 0.1)' : theme.card,
                borderColor: stats.outOfStock > 0 ? theme.error : theme.border,
              },
            ]}
            onPress={() => setSelectedFilter(selectedFilter === 'out_of_stock' ? 'all' : 'out_of_stock')}
          >
            <Text style={[styles.statBoxNum, { color: theme.error }]}>{stats.outOfStock}</Text>
            <Text style={[styles.statBoxLabel, { color: theme.error }]}>
              {lang === 'km' ? 'អស់ពីស្តុក' : 'Out of Stock'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Product ID Search Engine Tabs */}
        <View style={styles.searchEngineBar}>
          <TouchableOpacity
            style={[
              styles.searchModeChip,
              searchMode === 'all'
                ? [styles.searchModeChipActive, { backgroundColor: theme.primary, borderColor: theme.primary }]
                : { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            onPress={() => setSearchMode('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.searchModeChipText, { color: searchMode === 'all' ? '#ffffff' : theme.textMuted }]}>
              {lang === 'km' ? '🔍 ទាំងអស់' : '🔍 All'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.searchModeChip,
              searchMode === 'id'
                ? [styles.searchModeChipActive, { backgroundColor: theme.secondary || '#10b981', borderColor: theme.secondary || '#10b981' }]
                : { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            onPress={() => setSearchMode('id')}
            activeOpacity={0.8}
          >
            <Text style={[styles.searchModeChipText, { color: searchMode === 'id' ? '#ffffff' : theme.textMuted }]}>
              {lang === 'km' ? '🆔 លេខកូដ ID / SKU' : '🆔 Product ID / SKU'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.searchModeChip,
              searchMode === 'name'
                ? [styles.searchModeChipActive, { backgroundColor: theme.primary, borderColor: theme.primary }]
                : { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            onPress={() => setSearchMode('name')}
            activeOpacity={0.8}
          >
            <Text style={[styles.searchModeChipText, { color: searchMode === 'name' ? '#ffffff' : theme.textMuted }]}>
              {lang === 'km' ? '🏷️ ឈ្មោះទំនិញ' : '🏷️ Title'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search & Filter Toolbar */}
        <View style={styles.toolbarRow}>
          <View style={styles.searchWrap}>
            <Text style={styles.searchIcon}>
              {searchMode === 'id' ? '🆔' : '🔍'}
            </Text>
            <TextInput
              style={[
                styles.searchInput,
                { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
              ]}
              placeholder={
                searchMode === 'id'
                  ? (lang === 'km' ? 'បញ្ចូលលេខកូដទំនិញ ID (ឧ. PRD-1001)...' : 'Enter Product ID / SKU (e.g. PRD-1001)...')
                  : searchMode === 'name'
                  ? (lang === 'km' ? 'ស្វែងរកតាមឈ្មោះ / ពាក្យគន្លឹះ...' : 'Search by title / keyword...')
                  : (lang === 'km' ? 'ស្វែងរកតាមលេខកូដ ឈ្មោះ ឬប្រភេទ...' : 'Search by Product ID, title, or category...')
              }
              placeholderTextColor={theme.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')} style={styles.searchClearBtn}>
                <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '800' }}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.toolbarSubRow}>
            <View style={[styles.countBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: theme.gold }}>
                {lang === 'km' ? `${filtered.length} ក្នុងចំណោម ${products.length} មុខ` : `${filtered.length} of ${products.length} items`}
              </Text>
            </View>

            {/* View Layout Switcher (Line vs Grid) */}
            <View style={[styles.layoutToggleGroup, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <TouchableOpacity
                style={[
                  styles.layoutToggleBtn,
                  viewLayout === 'list' && [styles.layoutToggleBtnActive, { backgroundColor: theme.primary }],
                ]}
                onPress={() => setViewLayout('list')}
                activeOpacity={0.8}
              >
                <Text style={[styles.layoutToggleIcon, { color: viewLayout === 'list' ? '#ffffff' : theme.textMuted }]}>
                  ☰
                </Text>
                <Text
                  style={[
                    styles.layoutToggleText,
                    { color: viewLayout === 'list' ? '#ffffff' : theme.textMuted },
                  ]}
                >
                  {lang === 'km' ? 'ជួរ' : 'Line'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.layoutToggleBtn,
                  viewLayout === 'grid' && [styles.layoutToggleBtnActive, { backgroundColor: theme.primary }],
                ]}
                onPress={() => setViewLayout('grid')}
                activeOpacity={0.8}
              >
                <Text style={[styles.layoutToggleIcon, { color: viewLayout === 'grid' ? '#ffffff' : theme.textMuted }]}>
                  ⊞
                </Text>
                <Text
                  style={[
                    styles.layoutToggleText,
                    { color: viewLayout === 'grid' ? '#ffffff' : theme.textMuted },
                  ]}
                >
                  {lang === 'km' ? 'ក្រឡា' : 'Grid'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Quick Filter Category Chips with Left & Right Moveable Controls */}
        <View style={styles.catBarWrapper}>
          <TouchableOpacity
            style={[styles.catNudgeBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => handleNudgeCat('left')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.catNudgeText, { color: theme.text }]}>‹</Text>
          </TouchableOpacity>

          <ScrollView
            ref={catScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={styles.catChipsScroll}
            onScroll={(e) => setCatScrollPos(e.nativeEvent.contentOffset.x)}
            scrollEventThrottle={16}
          >
            <TouchableOpacity
              style={[
                styles.catChip,
                selectedFilter === 'all'
                  ? [styles.catChipActive, { backgroundColor: theme.gold + '25', borderColor: theme.gold }]
                  : { backgroundColor: theme.card, borderColor: theme.border },
              ]}
              onPress={() => setSelectedFilter('all')}
            >
              <Text style={[styles.catChipText, { color: selectedFilter === 'all' ? theme.gold : theme.textMuted }]}>
                {lang === 'km' ? 'ទំនិញទាំងអស់' : 'All Products'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.catChip,
                selectedFilter === 'low_stock'
                  ? [styles.catChipActive, { backgroundColor: 'rgba(234, 179, 8, 0.2)', borderColor: theme.gold }]
                  : { backgroundColor: theme.card, borderColor: theme.border },
              ]}
              onPress={() => setSelectedFilter('low_stock')}
            >
              <Text style={[styles.catChipText, { color: selectedFilter === 'low_stock' ? theme.gold : theme.textMuted }]}>
                {lang === 'km' ? `⚡ ជិតអស់ (${stats.lowStock})` : `⚡ Low Stock (${stats.lowStock})`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.catChip,
                selectedFilter === 'out_of_stock'
                  ? [styles.catChipActive, { backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: theme.error }]
                  : { backgroundColor: theme.card, borderColor: theme.border },
              ]}
              onPress={() => setSelectedFilter('out_of_stock')}
            >
              <Text style={[styles.catChipText, { color: selectedFilter === 'out_of_stock' ? theme.error : theme.textMuted }]}>
                {lang === 'km' ? `⚠️ អស់ពីស្តុក (${stats.outOfStock})` : `⚠️ Out of Stock (${stats.outOfStock})`}
              </Text>
            </TouchableOpacity>

            {categories.map((c) => {
              const isSelected = selectedFilter === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.catChip,
                    isSelected
                      ? [styles.catChipActive, { backgroundColor: theme.gold + '25', borderColor: theme.gold }]
                      : { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                  onPress={() => setSelectedFilter(c.id)}
                >
                  <Text style={{ fontSize: 13, marginRight: 4 }}>{c.icon || '📦'}</Text>
                  <Text style={[styles.catChipText, { color: isSelected ? theme.gold : theme.textMuted }]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[styles.catNudgeBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => handleNudgeCat('right')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.catNudgeText, { color: theme.text }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Product Cards List */}
        {filtered.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>📦</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>
              No products match this filter
            </Text>
            <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
              Try searching with another keyword or resetting the filter.
            </Text>
            <TouchableOpacity
              style={[styles.resetFilterBtn, { backgroundColor: theme.primary }]}
              onPress={() => {
                setSearch('');
                setSelectedFilter('all');
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Reset Filters</Text>
            </TouchableOpacity>
          </View>
        ) : viewLayout === 'grid' ? (
          /* 4 by 4 Grid View */
          <View style={[styles.gridContainer, { gap: gridGap }]}>
            {filtered.map((p) => {
              const imageSource = resolveProductImage(p);

              const stockNum = parseInt(p.stock, 10) || 0;
              const isOutOfStock = stockNum <= 0;
              const isLowStock = stockNum > 0 && stockNum <= 5;
              const finalPrice = p.discount > 0 ? p.price * (1 - p.discount / 100) : p.price;

              return (
                <View
                  key={p.id}
                  style={[
                    styles.gridCard,
                    {
                      width: gridCardWidth,
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {/* Grid Card Top Image */}
                  <View style={styles.gridImgWrap}>
                    <Image source={imageSource} style={styles.gridProdImg} resizeMode="contain" />
                    {p.discount > 0 && (
                      <View style={[styles.discountPill, { backgroundColor: theme.rose }]}>
                        <Text style={styles.discountPillText}>-{p.discount}%</Text>
                      </View>
                    )}
                    <View style={[styles.gridCatBadge, { backgroundColor: 'rgba(12, 14, 23, 0.82)', borderColor: 'rgba(255, 255, 255, 0.18)' }]}>
                      <Text style={{ color: theme.gold, fontSize: 10, fontWeight: '800' }}>
                        {p.cat?.toUpperCase()}
                      </Text>
                    </View>
                    {(p.free_delivery === 1 || p.free_delivery === '1' || p.free_delivery === true) && (
                      <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(16, 185, 129, 0.92)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>🚚 Free Del</Text>
                      </View>
                    )}
                  </View>

                  {/* Grid Card Body */}
                  <View style={styles.gridCardBody}>
                    <View style={styles.gridStockRow}>
                      <View
                        style={[
                          styles.stockStatusBadge,
                          {
                            backgroundColor: isOutOfStock
                              ? 'rgba(239, 68, 68, 0.15)'
                              : isLowStock
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(16, 185, 129, 0.15)',
                            borderColor: isOutOfStock
                              ? 'rgba(239, 68, 68, 0.3)'
                              : isLowStock
                              ? 'rgba(245, 158, 11, 0.3)'
                              : 'rgba(16, 185, 129, 0.3)',
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '800',
                            color: isOutOfStock ? theme.error : isLowStock ? theme.gold : theme.primary,
                          }}
                        >
                          {isOutOfStock ? '● Sold Out' : isLowStock ? `● Low (${stockNum})` : `● In Stock (${stockNum})`}
                        </Text>
                      </View>
                      <Text style={[styles.prodPts, { color: theme.gold }]}>
                        ⭐ +{p.pt || 1} pt
                      </Text>
                    </View>

                    <View style={styles.gridIdRow}>
                      <View style={[styles.productIdPill, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                        <Text style={[styles.productIdPillText, { color: theme.secondary || '#10b981' }]}>
                          🆔 {p.id}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.gridProdName, { color: theme.text }]} numberOfLines={2}>
                      {p.name}
                    </Text>

                    <View style={styles.pricingRow}>
                      <Text style={[styles.prodPrice, { color: theme.text }]}>
                        ${(+finalPrice || 0).toFixed(2)}
                      </Text>
                      {p.discount > 0 && (
                        <Text style={[styles.prodOriginalPrice, { color: theme.textMuted }]}>
                          ${(+p.price || 0).toFixed(2)}
                        </Text>
                      )}
                      <Text style={[styles.prodKhr, { color: theme.textMuted }]}>
                        ≈ {Math.round(finalPrice * rate).toLocaleString()} ៛
                      </Text>
                    </View>

                    {/* Quick Stock Controls in Grid */}
                    <View style={[styles.gridStockControls, { borderTopColor: theme.border }]}>
                      <Text style={[styles.stockLabel, { color: theme.textMuted }]}>
                        Stock: <Text style={{ fontWeight: '900', color: theme.text }}>{stockNum}</Text>
                      </Text>

                      <View style={styles.stockSteppers}>
                        <TouchableOpacity
                          style={[styles.stockBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                          onPress={() => handleQuickStock(p.id, -1)}
                          title="-1 stock"
                        >
                          <Text style={[styles.stockBtnText, { color: theme.text }]}>-1</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.stockBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                          onPress={() => handleQuickStock(p.id, 1)}
                          title="+1 stock"
                        >
                          <Text style={[styles.stockBtnText, { color: theme.text }]}>+1</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.stockBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                          onPress={() => handleQuickStock(p.id, 5)}
                          title="+5 stock"
                        >
                          <Text style={[styles.stockBtnText, { color: theme.text }]}>+5</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Action Buttons in Grid */}
                    <View style={styles.gridActionRow}>
                      <TouchableOpacity
                        style={[styles.gridEditBtn, { backgroundColor: 'rgba(6, 182, 212, 0.12)', borderColor: 'rgba(6, 182, 212, 0.4)' }]}
                        onPress={() => openEditModal(p)}
                      >
                        <Text style={{ color: '#06b6d4', fontSize: 11, fontWeight: '800' }}>✏️ Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.gridDelBtn, { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.35)' }]}
                        onPress={() => handleDeleteProduct(p)}
                      >
                        <Text style={{ color: theme.error, fontSize: 11, fontWeight: '800' }}>🗑️ Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          /* 1 by 1 Line List View */
          <View style={styles.list}>
            {filtered.map((p) => {
              const imageSource = resolveProductImage(p);

              const stockNum = parseInt(p.stock, 10) || 0;
              const isOutOfStock = stockNum <= 0;
              const isLowStock = stockNum > 0 && stockNum <= 5;
              const finalPrice = p.discount > 0 ? p.price * (1 - p.discount / 100) : p.price;

              return (
                <View
                  key={p.id}
                  style={[
                    styles.productCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <View style={styles.cardMainRow}>
                    <View style={styles.imgWrap}>
                      <Image source={imageSource} style={styles.prodImg} resizeMode="contain" />
                      {p.discount > 0 && (
                        <View style={[styles.discountPill, { backgroundColor: theme.rose }]}>
                          <Text style={styles.discountPillText}>-{p.discount}%</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.prodInfo}>
                      <View style={styles.tagRow}>
                        <View style={[styles.catTagBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                          <Text style={[styles.catTagText, { color: theme.primary }]}>
                            {p.cat?.toUpperCase()}
                          </Text>
                        </View>

                        {(p.free_delivery === 1 || p.free_delivery === '1' || p.free_delivery === true) && (
                          <View style={[styles.catTagBadge, { backgroundColor: 'rgba(16, 185, 129, 0.18)', borderColor: 'rgba(16, 185, 129, 0.4)' }]}>
                            <Text style={[styles.catTagText, { color: theme.secondary || '#10b981' }]}>
                              🚚 Free Del
                            </Text>
                          </View>
                        )}

                        <View
                          style={[
                            styles.stockStatusBadge,
                            {
                              backgroundColor: isOutOfStock
                                ? 'rgba(239, 68, 68, 0.15)'
                                : isLowStock
                                ? 'rgba(245, 158, 11, 0.15)'
                                : 'rgba(16, 185, 129, 0.15)',
                              borderColor: isOutOfStock
                                ? 'rgba(239, 68, 68, 0.3)'
                                : isLowStock
                                ? 'rgba(245, 158, 11, 0.3)'
                                : 'rgba(16, 185, 129, 0.3)',
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '800',
                              color: isOutOfStock ? theme.error : isLowStock ? theme.gold : theme.primary,
                            }}
                          >
                            {isOutOfStock ? '● Sold Out' : isLowStock ? `● Low Stock (${stockNum})` : `● In Stock (${stockNum})`}
                          </Text>
                        </View>

                        <View style={[styles.productIdPill, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                          <Text style={[styles.productIdPillText, { color: theme.secondary || '#10b981' }]}>
                            🆔 {p.id}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.prodName, { color: theme.text }]} numberOfLines={2}>
                        {p.name}
                      </Text>

                      <View style={styles.pricingRow}>
                        <Text style={[styles.prodPrice, { color: theme.text }]}>
                          ${(+finalPrice || 0).toFixed(2)}
                        </Text>
                        {p.discount > 0 && (
                          <Text style={[styles.prodOriginalPrice, { color: theme.textMuted }]}>
                            ${(+p.price || 0).toFixed(2)}
                          </Text>
                        )}
                        <Text style={[styles.prodKhr, { color: theme.textMuted }]}>
                          ≈ {Math.round(finalPrice * rate).toLocaleString()} ៛ KHR
                        </Text>
                        <Text style={[styles.prodPts, { color: theme.gold }]}>
                          · +{p.pt || 1} pt
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Card Footer: Quick Stock Controls & Action Buttons */}
                  <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                    {/* Stock Quick Adjustment */}
                    <View style={styles.stockControlRow}>
                      <Text style={[styles.stockLabel, { color: theme.textMuted }]}>
                        Stock: <Text style={{ fontWeight: '900', color: theme.text }}>{stockNum}</Text>
                      </Text>

                      <View style={styles.stockSteppers}>
                        <TouchableOpacity
                          style={[styles.stockBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                          onPress={() => handleQuickStock(p.id, -5)}
                          title="-5 stock"
                        >
                          <Text style={[styles.stockBtnText, { color: theme.text }]}>-5</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.stockBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                          onPress={() => handleQuickStock(p.id, -1)}
                          title="-1 stock"
                        >
                          <Text style={[styles.stockBtnText, { color: theme.text }]}>-1</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.stockBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                          onPress={() => handleQuickStock(p.id, 1)}
                          title="+1 stock"
                        >
                          <Text style={[styles.stockBtnText, { color: theme.text }]}>+1</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.stockBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                          onPress={() => handleQuickStock(p.id, 5)}
                          title="+5 stock"
                        >
                          <Text style={[styles.stockBtnText, { color: theme.text }]}>+5</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Edit & Delete Action Buttons */}
                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        style={[styles.actionEditBtn, { backgroundColor: 'rgba(6, 182, 212, 0.12)', borderColor: 'rgba(6, 182, 212, 0.4)' }]}
                        onPress={() => openEditModal(p)}
                      >
                        <Text style={{ color: '#06b6d4', fontSize: 12, fontWeight: '800' }}>✏️ Edit Product</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionDelBtn, { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.35)' }]}
                        onPress={() => handleDeleteProduct(p)}
                      >
                        <Text style={{ color: theme.error, fontSize: 12, fontWeight: '800' }}>🗑️ Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ============================================================== */}
      {/* Redesigned Add / Edit Product Modal                            */}
      {/* ============================================================== */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    {editingProduct ? '✏️ Edit Product' : '➕ Create New Product'}
                  </Text>
                  <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 1 }}>
                    {editingProduct ? `Updating SKU #${editingProduct.id}` : 'Fill in product info to list in live catalog'}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={[styles.modalCloseBtn, { backgroundColor: theme.inputBg }]}
                >
                  <Text style={{ fontSize: 13, color: theme.textMuted, fontWeight: '800' }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Modal Body Container */}
              <View style={styles.modalBodyRow}>
                {/* Image Upload & Live Preview */}
                <View style={styles.modalCol}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Product Image *</Text>
                  
                  <View style={[styles.modalImgBox, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
                    {formImage ? (
                      <Image source={{ uri: formImage }} style={styles.modalImgPreview} resizeMode="contain" />
                    ) : (
                      <View style={styles.modalImgPlaceholder}>
                        <Text style={{ fontSize: 20, marginBottom: 2 }}>🖼️</Text>
                        <Text style={{ fontSize: 10.5, color: theme.textMuted, fontWeight: '700' }}>
                          No image loaded yet
                        </Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.imgUploadBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
                    onPress={handlePickFile}
                  >
                    <Text style={{ color: theme.text, fontSize: 11, fontWeight: '800' }}>
                      📁 {formImage ? 'Replace Image from Computer' : 'Upload Image from Computer'}
                    </Text>
                  </TouchableOpacity>

                  <Text style={[styles.fieldLabel, { color: theme.textMuted, marginTop: 4 }]}>Or Image URL / Base64</Text>
                  <TextInput
                    style={[styles.input, { height: 30, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text, fontSize: 10.5 }]}
                    value={formImage.length > 55 ? `${formImage.substring(0, 55)}... (Image Loaded)` : formImage}
                    onChangeText={setFormImage}
                    placeholder="https://images.unsplash.com/..."
                    placeholderTextColor={theme.textMuted}
                  />

                  {/* Live Card Preview Box */}
                  <View style={[styles.livePreviewBox, { borderColor: theme.border, backgroundColor: 'rgba(0, 0, 0, 0.2)' }]}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.gold, letterSpacing: 0.6, marginBottom: 2 }}>
                      LIVE STOREFRONT PREVIEW
                    </Text>
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.text }} numberOfLines={1}>
                      {formName || 'Product Title'}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '900', color: theme.primary, marginTop: 1 }}>
                      ${previewFinalPrice.toFixed(2)}
                      {previewDiscount > 0 ? ` (was $${previewPrice.toFixed(2)})` : ''}
                    </Text>
                  </View>
                </View>

                {/* Title, Category, Price, Stock */}
                <View style={styles.modalCol}>
                  {/* Dedicated Product ID & Auto-Generate Button */}
                  <View style={{ marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textMuted, marginBottom: 0 }]}>
                        Product ID / SKU * (Non-Duplicate)
                      </Text>
                      <TouchableOpacity
                        style={[styles.autoGenIdBtn, { backgroundColor: theme.inputBg, borderColor: theme.border, paddingHorizontal: 6, paddingVertical: 2 }]}
                        onPress={() => setFormId(generateProductId(products))}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 9.5, fontWeight: '800', color: theme.gold }}>
                          ⚡ Auto-Generate
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: theme.inputBg,
                          borderColor: isProductIdDuplicate(formId, editingProduct?.id, products)
                            ? theme.error
                            : theme.inputBorder,
                          color: theme.text,
                          fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
                          fontWeight: '800',
                          letterSpacing: 1,
                        },
                      ]}
                      value={formId}
                      onChangeText={(val) => setFormId(val.toUpperCase())}
                      placeholder="e.g. PRD-1001"
                      placeholderTextColor={theme.textMuted}
                      autoCapitalize="characters"
                    />
                    {isProductIdDuplicate(formId, editingProduct?.id, products) ? (
                      <Text style={{ fontSize: 10, color: theme.error, marginTop: 2, fontWeight: '700' }}>
                        ⚠️ Duplicate Product ID! "{formId}" is already assigned to another product. Each product must have a unique non-duplicate ID.
                      </Text>
                    ) : formId ? (
                      <Text style={{ fontSize: 10, color: theme.primary, marginTop: 2, fontWeight: '600' }}>
                        ✓ Unique Product ID confirmed ({formId})
                      </Text>
                    ) : null}
                  </View>

                  {/* Product Name - Sleek & Perfectly Proportioned */}
                  <View style={{ marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textMuted, marginBottom: 0 }]}>
                        Product Name *
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {formName ? (
                          <TouchableOpacity
                            style={[styles.autoGenIdBtn, { backgroundColor: theme.inputBg, borderColor: theme.border, paddingHorizontal: 6, paddingVertical: 2 }]}
                            onPress={() => setFormName('')}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontSize: 9.5, fontWeight: '800', color: theme.error }}>✕ Clear</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={[styles.autoGenIdBtn, { backgroundColor: theme.inputBg, borderColor: theme.border, paddingHorizontal: 6, paddingVertical: 2 }]}
                          onPress={() => {
                            if (!formName) return;
                            const titled = formName
                              .split(' ')
                              .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
                              .join(' ');
                            setFormName(titled);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 9.5, fontWeight: '800', color: theme.primary }}>Aa Title</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: theme.inputBg,
                          borderColor: formName?.trim() ? theme.primary : theme.inputBorder,
                          color: theme.text,
                        },
                      ]}
                      value={formName}
                      onChangeText={setFormName}
                      placeholder="e.g. Classic Italian Modular Charm Bracelet"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <Text style={[styles.fieldLabel, { color: theme.textMuted, marginTop: 2, marginBottom: 3 }]}>Category *</Text>
                  <View style={styles.catPickerGrid}>
                    {categories.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.catChoicePill,
                          {
                            backgroundColor: formCat === c.id ? theme.primary : theme.inputBg,
                            borderColor: formCat === c.id ? theme.primary : theme.border,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                          },
                        ]}
                        onPress={() => setFormCat(c.id)}
                      >
                        <Text style={{ color: formCat === c.id ? '#fff' : theme.text, fontSize: 10, fontWeight: '800' }}>
                          {c.icon || '📦'} {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.twoColRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Price ($ USD) *</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
                        value={formPrice}
                        onChangeText={setFormPrice}
                        keyboardType="numeric"
                      />
                      <Text style={{ fontSize: 9.5, color: theme.gold, marginTop: 2 }}>
                        ≈ {Math.round(previewPrice * rate).toLocaleString()} ៛ KHR
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Discount (%)</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
                        value={formDiscount}
                        onChangeText={setFormDiscount}
                        keyboardType="numeric"
                      />
                      {previewDiscount > 0 ? (
                        <Text style={{ fontSize: 9.5, color: theme.rose, marginTop: 2 }}>
                          Final: ${previewFinalPrice.toFixed(2)}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.twoColRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Stock Quantity *</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
                        value={formStock}
                        onChangeText={setFormStock}
                        keyboardType="numeric"
                      />
                      {/* Stepper Pills */}
                      <View style={{ flexDirection: 'row', gap: 3, marginTop: 3 }}>
                        {[-5, 1, 5, 10].map((delta) => (
                          <TouchableOpacity
                            key={delta}
                            style={[styles.modalStockPill, { backgroundColor: theme.inputBg, borderColor: theme.border, paddingHorizontal: 5, paddingVertical: 2 }]}
                            onPress={() => {
                              const curr = parseInt(formStock, 10) || 0;
                              setFormStock(String(Math.max(0, curr + delta)));
                            }}
                          >
                            <Text style={{ fontSize: 8.5, fontWeight: '800', color: theme.text }}>
                              {delta > 0 ? `+${delta}` : delta}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Loyalty Points Earned</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
                        value={formPt}
                        onChangeText={setFormPt}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {/* Free Delivery Option (Non-Charm normal products) */}
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: formFreeDelivery ? 'rgba(16, 185, 129, 0.12)' : theme.inputBg,
                      borderColor: formFreeDelivery ? (theme.secondary || '#10b981') : theme.border,
                      borderWidth: 1.2,
                      borderRadius: 10,
                      padding: 8,
                      paddingHorizontal: 10,
                      marginTop: 6,
                      marginBottom: 8,
                    }}
                    onPress={() => setFormFreeDelivery(!formFreeDelivery)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.text }}>
                          🚚 Free Delivery (ដឹកឥតគិតថ្លៃ)
                        </Text>
                        {formFreeDelivery && (
                          <View style={{ backgroundColor: theme.secondary || '#10b981', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 }}>
                            <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#fff' }}>FREE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 9.5, color: theme.textMuted, marginTop: 1 }}>
                        Customer receives $0.00 delivery fee on checkout
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: formFreeDelivery ? (theme.secondary || '#10b981') : theme.border,
                        justifyContent: 'center',
                        paddingHorizontal: 2,
                      }}
                    >
                      <View
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 8,
                          backgroundColor: '#fff',
                          alignSelf: formFreeDelivery ? 'flex-end' : 'flex-start',
                        }}
                      />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Modal Action Buttons */}
              <View style={[styles.modalBtnRow, { borderTopColor: theme.border }]}>
                {editingProduct ? (
                  <TouchableOpacity
                    style={[styles.modalDelBtn, { borderColor: theme.error, backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}
                    onPress={() => {
                      setModalVisible(false);
                      handleDeleteProduct(editingProduct);
                    }}
                  >
                    <Text style={{ color: theme.error, fontWeight: '800', fontSize: 11 }}>🗑️ Delete</Text>
                  </TouchableOpacity>
                ) : <View />}

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.modalCancelBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 11.5 }}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalSaveBtn, { backgroundColor: theme.primary }]}
                    onPress={handleSaveProduct}
                    disabled={submitting}
                  >
                    <Text style={styles.modalSaveBtnText}>
                      {submitting ? 'Saving...' : 'Save Product 💾'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: 12,
    paddingBottom: 60,
  },
  innerContainer: {
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  statBox: {
    width: '48.5%',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  statBoxNum: {
    fontSize: 15,
    fontWeight: '900',
  },
  statBoxLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  searchEngineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  searchModeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
  },
  searchModeChipActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  searchModeChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  gridIdRow: {
    marginTop: 2,
    marginBottom: 4,
    flexDirection: 'row',
  },
  productIdPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  productIdPillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  autoGenIdBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  toolbarRow: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 12,
    width: '100%',
  },
  searchWrap: {
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
  },
  toolbarSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  searchIcon: {
    position: 'absolute',
    left: 14,
    zIndex: 2,
    fontSize: 14,
  },
  searchInput: {
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingLeft: 38,
    paddingRight: 34,
    fontSize: 12,
  },
  searchClearBtn: {
    position: 'absolute',
    right: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  catBarWrapper: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 4,
  },
  catNudgeBtn: {
    width: 20,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  catNudgeText: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  catChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  catChipActive: {
    elevation: 2,
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  emptyBox: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 10,
  },
  resetFilterBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  layoutToggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  layoutToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  layoutToggleBtnActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  layoutToggleIcon: {
    fontSize: 12,
    marginRight: 4,
    fontWeight: '800',
  },
  layoutToggleText: {
    fontSize: 11,
    fontWeight: '800',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    width: '100%',
    alignSelf: 'stretch',
  },
  gridCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 0,
    flexDirection: 'column',
  },
  gridImgWrap: {
    width: '100%',
    height: 128,
    backgroundColor: '#ffffff',
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  gridProdImg: {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    alignSelf: 'center',
    ...(Platform.OS === 'web' ? {
      objectFit: 'contain',
      objectPosition: 'center',
    } : {}),
  },
  gridCatBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  gridCardBody: {
    padding: 12,
    flex: 1,
    justifyContent: 'space-between',
  },
  gridStockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gridProdName: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginBottom: 8,
    minHeight: 36,
  },
  gridStockControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  gridActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  gridEditBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  gridDelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  list: {
    gap: 14,
    width: '100%',
    alignSelf: 'center',
  },
  productCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 3,
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  imgWrap: {
    position: 'relative',
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  prodImg: {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    alignSelf: 'center',
    ...(Platform.OS === 'web' ? {
      objectFit: 'contain',
      objectPosition: 'center',
    } : {}),
  },
  discountPill: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  discountPillText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  prodInfo: {
    flex: 1,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  catTagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 0.5,
  },
  catTagText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  stockStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 0.5,
  },
  prodName: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
    lineHeight: 20,
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap',
  },
  prodPrice: {
    fontSize: 15,
    fontWeight: '900',
  },
  prodOriginalPrice: {
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  prodKhr: {
    fontSize: 11,
    fontWeight: '600',
  },
  prodPts: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    flexWrap: 'wrap',
    gap: 12,
  },
  stockControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stockLabel: {
    fontSize: 12,
    marginRight: 4,
  },
  stockSteppers: {
    flexDirection: 'row',
    gap: 4,
  },
  stockBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockBtnText: {
    fontWeight: '900',
    fontSize: 11,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionEditBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionDelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  modalScroll: {
    flexGrow: 1,
    paddingVertical: 10,
    alignItems: 'center',
    width: '100%',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1.2,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  modalCloseBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBodyRow: {
    flexDirection: 'column',
    gap: 6,
  },
  modalBodyRowDesktop: {
    flexDirection: 'column',
  },
  modalCol: {
    width: '100%',
  },
  modalColLeft: {
    width: '100%',
  },
  modalColRight: {
    width: '100%',
  },
  modalImgBox: {
    width: '100%',
    height: 96,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    backgroundColor: '#ffffff',
  },
  modalImgPreview: {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    alignSelf: 'center',
    ...(Platform.OS === 'web' ? {
      objectFit: 'contain',
      objectPosition: 'center',
    } : {}),
  },
  modalImgPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgUploadBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 4,
  },
  livePreviewBox: {
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 2,
    marginTop: 4,
    letterSpacing: 0.1,
  },
  input: {
    height: 35,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  catPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  catChoicePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  modalStockPill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    flexWrap: 'wrap',
  },
  modalDelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  modalSaveBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
});
