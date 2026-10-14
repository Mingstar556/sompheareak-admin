import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { ApiClient } from '../../api/client';
import { resolveCharmImage } from '../../utils/charmImageHelper';
import { ModularCharmLink } from '../../components/ModularCharmLink';

const PREVIEW_FINISHES = [
  { id: 'silver', label: 'Silver Inox', bg: '#1e293b', border: '#cbd5e1', dot: '#94a3b8' },
  { id: 'gold', label: '18K Gold', bg: '#451a03', border: '#f59e0b', dot: '#d4af37' },
  { id: 'rose', label: 'Rose Gold', bg: '#4c0519', border: '#fb7185', dot: '#f43f5e' },
  { id: 'black', label: 'Obsidian Black', bg: '#020617', border: '#334155', dot: '#64748b' },
];

const COMMON_CATEGORIES = ['Custom', 'Love', 'Animals', 'Celestial', 'Nature', 'Luxury', 'Cambodia', 'Symbols'];

export const AdminCharmsScreen = () => {
  const { theme, lang, charms, settings, adminToken, refreshCatalog, showToast } = useApp();
  const rate = Number(settings?.exchange_rate) || 4100;
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const isWide = width >= 1200;

  const cardWidth = isWide
    ? (Platform.OS === 'web' ? 'calc(33.333% - 11px)' : '31.5%')
    : isDesktop
    ? (Platform.OS === 'web' ? 'calc(50% - 8px)' : '48.5%')
    : '100%';

  const [search, setSearch] = useState('');
  const [selectedCatTab, setSelectedCatTab] = useState('all');
  const [viewLayout, setViewLayout] = useState('grid4x4'); // 'grid4x4' (4 by 4 view, default) or 'line'
  const [loading, setLoading] = useState(false);

  const charmCatScrollRef = useRef(null);
  const [charmCatScrollPos, setCharmCatScrollPos] = useState(0);

  const handleNudgeCharmCat = (direction) => {
    const delta = direction === 'left' ? -140 : 140;
    const nextX = Math.max(0, charmCatScrollPos + delta);
    setCharmCatScrollPos(nextX);
    charmCatScrollRef.current?.scrollTo({ x: nextX, animated: true });
  };

  // Add Modal State
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [modelNo, setModelNo] = useState('MD-001');
  const [category, setCategory] = useState('Custom');
  const [price, setPrice] = useState('1.00');
  const [stock, setStock] = useState('50');
  const [image, setImage] = useState('charm_clean.png');
  const [active, setActive] = useState(1);
  const [addPreviewFinish, setAddPreviewFinish] = useState('silver');

  // Edit Modal State (Edit Manager)
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCharm, setEditingCharm] = useState(null);
  const [editName, setEditName] = useState('');
  const [editModelNo, setEditModelNo] = useState('');
  const [editCategory, setEditCategory] = useState('Custom');
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  const [editImage, setEditImage] = useState('charm_clean.png');
  const [editActive, setEditActive] = useState(1);
  const [editPreviewFinish, setEditPreviewFinish] = useState('silver');
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // File picker handler (supports web file dialog and base64 parsing)
  const handlePickFile = (isEdit = false) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp';
      input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          processFile(file, isEdit);
        }
      };
      input.click();
    } else {
      Alert.alert('Image Input', 'Please paste the image URL or Base64 string directly.');
    }
  };

  const trimImageTransparentBorders = (dataUrl, onDone) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      onDone(dataUrl);
      return;
    }
    try {
      const img = new window.Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, img.width, img.height);
          const data = imgData.data;
          let minX = img.width;
          let minY = img.height;
          let maxX = 0;
          let maxY = 0;
          for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
              const alpha = data[(y * img.width + x) * 4 + 3];
              if (alpha > 10) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          if (minX <= maxX && minY <= maxY) {
            const cropW = maxX - minX + 1;
            const cropH = maxY - minY + 1;
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropW;
            cropCanvas.height = cropH;
            const cropCtx = cropCanvas.getContext('2d');
            cropCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
            onDone(cropCanvas.toDataURL('image/png'));
            return;
          }
        } catch (e) {
          console.warn('Canvas trim failed:', e);
        }
        onDone(dataUrl);
      };
      img.onerror = () => onDone(dataUrl);
      img.src = dataUrl;
    } catch (err) {
      onDone(dataUrl);
    }
  };

  const processFile = (file, isEdit) => {
    if (file.size > 8 * 1024 * 1024) {
      Alert.alert('File Too Large', 'Please select a PNG image under 8MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const rawDataUrl = uploadEvent.target.result;
      trimImageTransparentBorders(rawDataUrl, (trimmedDataUrl) => {
        if (isEdit) {
          setEditImage(trimmedDataUrl);
        } else {
          setImage(trimmedDataUrl);
        }
        showToast('✓ PNG image uploaded & preview updated!');
      });
    };
    reader.readAsDataURL(file);
  };

  const openAddModal = () => {
    setName('');
    const nextNum = charms.length + 1;
    setModelNo(`MD-${String(nextNum).padStart(3, '0')}`);
    setCategory('Custom');
    setPrice('1.00');
    setStock('50');
    setImage('charm_clean.png');
    setActive(1);
    setAddPreviewFinish('silver');
    setAddModalVisible(true);
  };

  const handleAddCharm = async () => {
    if (!name.trim()) {
      showToast('⚠️ Please enter a charm name');
      return;
    }

    setLoading(true);
    const id = `ch_${Date.now()}`;
    const priceNum = parseFloat(price) || 1.0;
    const payload = {
      id,
      name: name.trim(),
      category: category.trim() || 'Custom',
      price: priceNum,
      price_khr: Math.round(priceNum * rate),
      stock: parseInt(stock, 10) || 0,
      image: image.trim() || 'charm_clean.png',
      model_no: modelNo.trim() || 'MD-001',
      color: 'Silver',
      active: active ? 1 : 0,
    };

    const res = await ApiClient.createCharm(payload, adminToken);
    setLoading(false);

    if (res.ok) {
      setAddModalVisible(false);
      await refreshCatalog();
      showToast('✓ New charm added successfully!');
    } else {
      Alert.alert('Add Charm Failed', res.error || 'Could not add charm');
    }
  };

  const openEditModal = (ch) => {
    setEditingCharm(ch);
    setEditName(ch.name || '');
    setEditModelNo(ch.model_no || 'MD-001');
    setEditCategory(ch.category || 'Custom');
    setEditPrice(String(ch.price ?? 1.0));
    setEditStock(String(ch.stock ?? 50));
    setEditImage(ch.image || 'charm_clean.png');
    setEditActive(ch.active !== undefined ? ch.active : 1);
    setEditPreviewFinish('silver');
    setEditModalVisible(true);
  };

  const handleSaveEditCharm = async () => {
    if (!editName.trim() || !editingCharm) {
      showToast('⚠️ Charm name cannot be blank');
      return;
    }
    setLoading(true);

    const priceNum = parseFloat(editPrice) || 1.0;
    const payload = {
      ...editingCharm,
      name: editName.trim(),
      model_no: editModelNo.trim() || 'MD-001',
      category: editCategory.trim() || 'Custom',
      price: priceNum,
      price_khr: Math.round(priceNum * rate),
      stock: parseInt(editStock, 10) || 0,
      image: editImage.trim() || 'charm_clean.png',
      active: editActive ? 1 : 0,
    };

    const res = await ApiClient.createCharm(payload, adminToken);
    setLoading(false);

    if (res.ok) {
      setEditModalVisible(false);
      await refreshCatalog();
      showToast('✓ Charm updated successfully!');
    } else {
      Alert.alert('Update Failed', res.error || 'Could not update charm');
    }
  };

  const handleQuickStock = async (charmId, delta) => {
    const res = await ApiClient.updateCharmStock(charmId, delta, adminToken);
    if (res.ok) {
      await refreshCatalog();
      showToast(`Stock updated (${delta > 0 ? '+' : ''}${delta})`);
    }
  };

  const handleDeleteCharm = (ch) => {
    Alert.alert('Delete Charm', `Are you sure you want to permanently delete "${ch.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await ApiClient.deleteCharm(ch.id, adminToken);
          if (res.ok) {
            setEditModalVisible(false);
            await refreshCatalog();
            showToast('✓ Charm deleted');
          }
        },
      },
    ]);
  };

  // Categories list for filtering
  const allCategories = useMemo(() => {
    const set = new Set(['all']);
    charms.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return Array.from(set);
  }, [charms]);

  const filteredCharms = useMemo(() => {
    return charms.filter((ch) => {
      const s = parseInt(ch.stock, 10) || 0;
      let matchCat = true;
      if (selectedCatTab === 'low_stock') {
        matchCat = s < 5;
      } else if (selectedCatTab === 'out_of_stock') {
        matchCat = s <= 0;
      } else {
        matchCat = selectedCatTab === 'all' || ch.category === selectedCatTab;
      }
      const matchSearch =
        !search.trim() ||
        ch.name.toLowerCase().includes(search.toLowerCase()) ||
        (ch.model_no && ch.model_no.toLowerCase().includes(search.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [charms, selectedCatTab, search]);

  const inStockCount = charms.filter((c) => (parseInt(c.stock, 10) || 0) >= 5).length;
  const lowStockCount = charms.filter((c) => {
    const s = parseInt(c.stock, 10) || 0;
    return s > 0 && s < 5;
  }).length;
  const outOfStockCount = charms.filter((c) => (parseInt(c.stock, 10) || 0) <= 0).length;

  const activeAddFinishObj = PREVIEW_FINISHES.find((f) => f.id === addPreviewFinish) || PREVIEW_FINISHES[0];
  const activeEditFinishObj = PREVIEW_FINISHES.find((f) => f.id === editPreviewFinish) || PREVIEW_FINISHES[0];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.title, { color: theme.text }]}>
              {lang === 'km' ? '🔗 តំណាក់អ៊ីតាលី' : '🔗 Italian Charms'}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: theme.gold + '25', borderColor: theme.gold }]}>
              <Text style={{ color: theme.gold, fontSize: 10, fontWeight: '800' }}>
                {lang === 'km' ? 'ស្ទូឌីយោ' : 'STUDIO'}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2 }}>
            {lang === 'km' ? 'គ្រប់គ្រងម៉ូដតំណាក់ខ្សែដៃ និងស្តុក' : 'Manage transparent PNG charm designs & stock'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
          onPress={openAddModal}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>
            {lang === 'km' ? '✨ + បន្ថែមតំណាក់' : '✨ + Add Charm'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats Summary Bar (interactive filters) */}
      <View style={styles.statsRow}>
        <TouchableOpacity
          style={[
            styles.statBox,
            { backgroundColor: selectedCatTab === 'all' ? theme.gold + '20' : theme.card, borderColor: selectedCatTab === 'all' ? theme.gold : theme.border },
          ]}
          onPress={() => setSelectedCatTab('all')}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 11, color: theme.textMuted, fontWeight: '700' }}>
            {lang === 'km' ? 'ម៉ូដសរុប' : 'Total Designs'}
          </Text>
          <Text style={[styles.statVal, { color: theme.text }]}>{charms.length}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.statBox,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          onPress={() => setSelectedCatTab('all')}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 11, color: theme.textMuted, fontWeight: '700' }}>
            {lang === 'km' ? 'ស្តុកគ្រប់គ្រាន់ (≥ 5)' : 'Healthy (≥ 5)'}
          </Text>
          <Text style={[styles.statVal, { color: '#10b981' }]}>{inStockCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.statBox,
            { backgroundColor: selectedCatTab === 'low_stock' ? 'rgba(239, 68, 68, 0.15)' : theme.card, borderColor: selectedCatTab === 'low_stock' ? '#ef4444' : theme.border },
          ]}
          onPress={() => setSelectedCatTab(selectedCatTab === 'low_stock' ? 'all' : 'low_stock')}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 11, color: '#ef4444', fontWeight: '700' }}>
            {lang === 'km' ? '⚠️ ជិតអស់ (< 5)' : '⚠️ Low (< 5)'}
          </Text>
          <Text style={[styles.statVal, { color: '#ef4444' }]}>{lowStockCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.statBox,
            { backgroundColor: selectedCatTab === 'out_of_stock' ? 'rgba(239, 68, 68, 0.25)' : theme.card, borderColor: selectedCatTab === 'out_of_stock' ? '#ef4444' : theme.border },
          ]}
          onPress={() => setSelectedCatTab(selectedCatTab === 'out_of_stock' ? 'all' : 'out_of_stock')}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 11, color: theme.textMuted, fontWeight: '700' }}>
            {lang === 'km' ? 'អស់ពីស្តុក' : 'Out of Stock'}
          </Text>
          <Text style={[styles.statVal, { color: theme.error }]}>{outOfStockCount}</Text>
        </TouchableOpacity>
      </View>

      {/* Search & Category Filter Toolbar */}
      <View style={[styles.toolbarCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.searchRow}>
          <TextInput
            style={[
              styles.searchInput,
              { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text },
            ]}
            placeholder={
              lang === 'km'
                ? '🔍 ស្វែងរកតំណាក់តាមឈ្មោះ ឬលេខកូដ (ឧ. MD-001)...'
                : '🔍 Search charms by name or model number (e.g. MD-001)...'
            }
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} style={styles.clearSearchBtn}>
              <Text style={{ color: theme.textMuted, fontWeight: '800' }}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Category Pills with Moveable Controls */}
        <View style={styles.catBarWrapper}>
          <TouchableOpacity
            style={[styles.catNudgeBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
            onPress={() => handleNudgeCharmCat('left')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.catNudgeText, { color: theme.text }]}>‹</Text>
          </TouchableOpacity>

          <ScrollView
            ref={charmCatScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={styles.catScroll}
            onScroll={(e) => setCharmCatScrollPos(e.nativeEvent.contentOffset.x)}
            scrollEventThrottle={16}
          >
            {allCategories.map((cat) => {
              const activeTab = selectedCatTab === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.catTab,
                    {
                      backgroundColor: activeTab ? theme.gold : theme.inputBg,
                      borderColor: activeTab ? theme.gold : theme.border,
                    },
                  ]}
                  onPress={() => setSelectedCatTab(cat)}
                >
                  <Text style={[styles.catTabText, { color: activeTab ? '#000000' : theme.text }]}>
                    {cat === 'all' ? (lang === 'km' ? 'តំណាក់ទាំងអស់' : 'All Charms') : cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[styles.catNudgeBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
            onPress={() => handleNudgeCharmCat('right')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.catNudgeText, { color: theme.text }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* View Layout Mode Switcher (4x4 Grid vs Line) & Counter Bar */}
        <View style={styles.viewToggleRow}>
          <View style={[styles.countBadge, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: theme.gold }}>
              {lang === 'km' ? `${filteredCharms.length} ក្នុងចំណោម ${charms.length} ម៉ូដ` : `${filteredCharms.length} of ${charms.length} charms`}
            </Text>
          </View>

          <View style={[styles.layoutToggleGroup, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[
                styles.layoutToggleBtn,
                viewLayout === 'grid4x4' && [styles.layoutToggleBtnActive, { backgroundColor: theme.gold }],
              ]}
              onPress={() => setViewLayout('grid4x4')}
              activeOpacity={0.8}
            >
              <Text style={[styles.layoutToggleBtnText, { color: viewLayout === 'grid4x4' ? '#000000' : theme.textMuted, fontWeight: '800' }]}>
                ⊞ 4x4 Grid
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.layoutToggleBtn,
                viewLayout === 'line' && [styles.layoutToggleBtnActive, { backgroundColor: theme.gold }],
              ]}
              onPress={() => setViewLayout('line')}
              activeOpacity={0.8}
            >
              <Text style={[styles.layoutToggleBtnText, { color: viewLayout === 'line' ? '#000000' : theme.textMuted, fontWeight: '800' }]}>
                ☰ Line View
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Charms List / Grid (4 by 4 Default) */}
      <View style={viewLayout === 'grid4x4' ? styles.grid4x4 : styles.grid}>
        {filteredCharms.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🔗</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }}>
              {lang === 'km' ? 'រកមិនឃើញតំណាក់ទេ' : 'No Charms Found'}
            </Text>
            <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, textAlign: 'center' }}>
              {search
                ? (lang === 'km' ? 'សាកល្បងផ្លាស់ប្តូរពាក្យស្វែងរករបស់អ្នក' : 'Try adjusting your search query')
                : (lang === 'km' ? 'កាតាឡុកត្រូវបានលុបជម្រះ។ ចុច "+ បន្ថែមតំណាក់" ខាងលើដើម្បីផ្ទុកឡើងម៉ូដដំបូងរបស់អ្នក!' : 'Store catalog is cleared. Click "+ Add Charm" above to upload your first design!')}
            </Text>
          </View>
        ) : viewLayout === 'grid4x4' ? (
          /* Professional 4 by 4 Charm Grid View */
          filteredCharms.map((ch) => {
            const stockNum = parseInt(ch.stock, 10) || 0;
            const isLowStock = stockNum > 0 && stockNum <= 5;
            const isOutOfStock = stockNum <= 0;
            const isActive = ch.active !== 0;

            return (
              <TouchableOpacity
                key={ch.id}
                style={[
                  styles.charmCard4x4,
                  {
                    backgroundColor: theme.card,
                    borderColor: isActive ? theme.border : 'rgba(239, 68, 68, 0.35)',
                  },
                ]}
                onPress={() => openEditModal(ch)}
                activeOpacity={0.85}
              >
                {/* Top: Model Badge & Status Indicator */}
                <View style={styles.card4x4TopRow}>
                  <View style={[styles.card4x4ModelBadge, { backgroundColor: theme.gold + '25', borderColor: theme.gold }]}>
                    <Text style={[styles.card4x4ModelText, { color: theme.gold }]} numberOfLines={1}>
                      {ch.model_no || 'MD-001'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.card4x4Dot,
                      {
                        backgroundColor: isOutOfStock
                          ? theme.error
                          : isLowStock
                          ? theme.gold
                          : theme.primary,
                      },
                    ]}
                  />
                </View>

                {/* Scaled Jewelry Visual Preview Box */}
                <View style={[styles.card4x4PreviewBox, { backgroundColor: '#07090e', borderColor: 'rgba(212, 175, 55, 0.4)' }]}>
                  <ModularCharmLink
                    charm={ch}
                    size="catalog"
                    showHook={false}
                  />
                </View>

                {/* Charm Name */}
                <Text style={[styles.card4x4Name, { color: theme.text }]} numberOfLines={1}>
                  {ch.name}
                </Text>

                {/* Price & Stock Counter */}
                <View style={styles.card4x4MetaRow}>
                  <Text style={[styles.card4x4Price, { color: theme.gold }]}>
                    ${(+ch.price || 1.0).toFixed(2)}
                  </Text>
                  <View
                    style={[
                      styles.card4x4StockBadge,
                      {
                        backgroundColor: isOutOfStock
                          ? 'rgba(239, 68, 68, 0.15)'
                          : isLowStock
                          ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(16, 185, 129, 0.15)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.card4x4StockText,
                        { color: isOutOfStock ? theme.error : isLowStock ? theme.gold : theme.primary },
                      ]}
                      numberOfLines={1}
                    >
                      {isOutOfStock ? (lang === 'km' ? 'អស់' : 'Out') : `${stockNum}`}
                    </Text>
                  </View>
                </View>

                {/* Mini Quick Action Controls */}
                <View style={[styles.card4x4QuickRow, { borderTopColor: theme.border }]}>
                  <TouchableOpacity
                    style={[styles.card4x4MiniBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      handleQuickStock(ch.id, -1);
                    }}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: theme.text }}>-1</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.card4x4MiniBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      handleQuickStock(ch.id, 1);
                    }}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: theme.text }}>+1</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.card4x4MiniBtn, { backgroundColor: theme.cyan + '20', borderColor: theme.cyan }]}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      openEditModal(ch);
                    }}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: theme.cyan }}>✏️</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.card4x4MiniBtn, { backgroundColor: theme.error + '20', borderColor: theme.error }]}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      handleDeleteCharm(ch);
                    }}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: theme.error }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          /* Classic Detailed Line View */
          filteredCharms.map((ch) => {
            const stockNum = parseInt(ch.stock, 10) || 0;
            const isLowStock = stockNum > 0 && stockNum <= 5;
            const isOutOfStock = stockNum <= 0;
            const isActive = ch.active !== 0;

            return (
              <View
                key={ch.id}
                style={[
                  styles.charmCard,
                  {
                    width: cardWidth,
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
              >
                {/* Main Row */}
                <View style={styles.cardMainRow}>
                  {/* Scaled-up Studio Visual Preview Box */}
                  <View style={[styles.charmPreviewBox, { backgroundColor: '#07090e', borderColor: 'rgba(212, 175, 55, 0.45)' }]}>
                    <ModularCharmLink
                      charm={ch}
                      size="workbench"
                      showHook={false}
                    />
                    <View style={styles.previewBezelLabel}>
                      <Text style={{ fontSize: 9, color: '#f1f5f9', fontWeight: '800', letterSpacing: 0.5 }}>9mm LINK</Text>
                    </View>
                  </View>

                  {/* Details */}
                  <View style={styles.cardDetails}>
                    <View style={styles.modelRow}>
                      <View style={[styles.modelBadge, { backgroundColor: theme.gold + '25', borderColor: theme.gold }]}>
                        <Text style={[styles.modelText, { color: theme.gold }]}>
                          {ch.model_no || 'MD-001'}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.stockStatusBadge,
                          {
                            backgroundColor: isOutOfStock
                              ? 'rgba(239, 68, 68, 0.15)'
                              : isLowStock
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(16, 185, 129, 0.15)',
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
                          {isOutOfStock ? '● Out of Stock' : isLowStock ? `● Low (${stockNum})` : `● In Stock (${stockNum})`}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.activeBadge,
                          { backgroundColor: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)' },
                        ]}
                      >
                        <Text style={{ fontSize: 9, fontWeight: '800', color: isActive ? theme.primary : theme.textMuted }}>
                          {isActive ? 'Live' : 'Draft'}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.charmName, { color: theme.text }]} numberOfLines={2}>
                      {ch.name}
                    </Text>

                    {/* Jewelry Specs and Details */}
                    <View style={styles.specsRow}>
                      <View style={[styles.specChip, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                        <Text style={{ fontSize: 10, color: theme.textMuted, fontWeight: '700' }}>
                          ✨ 316L Inox Steel
                        </Text>
                      </View>
                      {ch.category ? (
                        <View style={[styles.specChip, { backgroundColor: theme.gold + '15', borderColor: theme.gold + '30' }]}>
                          <Text style={{ fontSize: 10, color: theme.gold, fontWeight: '700' }}>
                            🏷️ {ch.category}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.priceRow}>
                      <Text style={[styles.priceTag, { color: theme.gold }]}>
                        ${(+ch.price || 1.0).toFixed(2)} USD
                      </Text>
                      <Text style={{ fontSize: 11, color: theme.textMuted, fontWeight: '600' }}>
                        ≈ {Math.round((+ch.price || 1.0) * rate).toLocaleString()} ៛ KHR
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Footer: Quick Stock Controls & Actions */}
                <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                  {/* Stock Controls */}
                  <View style={styles.stockControlRow}>
                    <Text style={{ fontSize: 11, color: theme.textMuted, marginRight: 4 }}>
                      Stock: <Text style={{ fontWeight: '800', color: theme.text }}>{ch.stock}</Text>
                    </Text>

                    <TouchableOpacity
                      style={[styles.stockBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                      onPress={() => handleQuickStock(ch.id, -1)}
                    >
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>-1</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.stockBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                      onPress={() => handleQuickStock(ch.id, 1)}
                    >
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>+1</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.stockBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                      onPress={() => handleQuickStock(ch.id, 5)}
                    >
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 11 }}>+5</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.stockBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                      onPress={() => handleQuickStock(ch.id, 20)}
                    >
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 11 }}>+20</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Actions */}
                  <View style={styles.actionBtnRow}>
                    <TouchableOpacity
                      style={[styles.actionEditBtn, { backgroundColor: theme.cyan + '20', borderColor: theme.cyan }]}
                      onPress={() => openEditModal(ch)}
                    >
                      <Text style={{ color: theme.cyan, fontSize: 12, fontWeight: '800' }}>✏️ Edit Studio</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionDelBtn, { backgroundColor: theme.error + '15', borderColor: theme.error }]}
                      onPress={() => handleDeleteCharm(ch)}
                    >
                      <Text style={{ color: theme.error, fontSize: 12, fontWeight: '800' }}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* ============================================================== */}
      {/* 1. EDIT CHARM MANAGER MODAL (Luxury & Super Easy to Use)       */}
      {/* ============================================================== */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.modalTitle, { color: theme.text }]}>✏️ Edit Italian Charm Link</Text>
                    <View style={[styles.modelBadge, { backgroundColor: theme.gold + '25', borderColor: theme.gold }]}>
                      <Text style={[styles.modelText, { color: theme.gold }]}>{editModelNo}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                    Update PNG art, inventory & pricing in customizer studio
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.modalCloseBtn}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Live Bracelet Link Mockup Frame */}
              <View style={[styles.studioPreviewSection, { backgroundColor: '#07090e', borderColor: activeEditFinishObj.border }]}>
                <View
                  style={[
                    styles.studioBezelTile,
                    {
                      backgroundColor: activeEditFinishObj.bg,
                      borderColor: activeEditFinishObj.border,
                    },
                  ]}
                >
                  <ModularCharmLink
                    charm={{
                      id: editingCharm?.id || editModelNo,
                      name: editName,
                      image: editImage,
                    }}
                    size="workbench"
                    showHook={false}
                  />
                  <View style={[styles.studioBezelBadge, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                    <Text style={{ color: activeEditFinishObj.dot, fontSize: 8.5, fontWeight: '900' }}>
                      {activeEditFinishObj.label.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Band Finish Preview Switcher */}
                <View style={styles.finishTesterRow}>
                  <Text style={{ fontSize: 9.5, color: theme.textMuted, fontWeight: '700', marginBottom: 3 }}>
                    🎨 Live Band Finish Preview (មើលកង់មាស/ប្រាក់ជាមុន):
                  </Text>
                  <View style={styles.finishTesterPills}>
                    {PREVIEW_FINISHES.map((f) => {
                      const isSel = editPreviewFinish === f.id;
                      return (
                        <TouchableOpacity
                          key={f.id}
                          style={[
                            styles.finishTesterPill,
                            {
                              backgroundColor: isSel ? f.bg : 'rgba(255,255,255,0.05)',
                              borderColor: isSel ? f.border : '#334155',
                            },
                          ]}
                          onPress={() => setEditPreviewFinish(f.id)}
                        >
                          <View style={[styles.finishTesterDot, { backgroundColor: f.dot }]} />
                          <Text style={{ fontSize: 9, color: isSel ? '#ffffff' : '#94a3b8', fontWeight: '700' }}>
                            {f.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* PNG Upload Dropzone */}
              <TouchableOpacity
                style={[
                  styles.dropzoneBox,
                  {
                    borderColor: isDraggingFile ? theme.primary : theme.border,
                    backgroundColor: isDraggingFile ? theme.primary + '15' : theme.inputBg,
                  },
                ]}
                onPress={() => handlePickFile(true)}
                activeOpacity={0.8}
                {...(Platform.OS === 'web'
                  ? {
                      onDragOver: (e) => {
                        e.preventDefault();
                        setIsDraggingFile(true);
                      },
                      onDragLeave: () => setIsDraggingFile(false),
                      onDrop: (e) => {
                        e.preventDefault();
                        setIsDraggingFile(false);
                        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                        if (file) processFile(file, true);
                      },
                    }
                  : {})}
              >
                <Text style={{ fontSize: 16, marginBottom: 2 }}>📁</Text>
                <Text style={[styles.dropzoneTitle, { color: theme.text }]}>
                  Click to replace PNG file or drag & drop here
                </Text>
                <Text style={{ fontSize: 9.5, color: theme.textMuted }}>
                  Supports transparent PNG, WEBP, or JPEG under 8MB
                </Text>
              </TouchableOpacity>

              {/* Charm Title - Sleek & Perfectly Proportioned */}
              <View style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted, marginBottom: 0, marginTop: 0 }]}>
                    🏷️ Charm Title *
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    {editName ? (
                      <TouchableOpacity
                        style={[styles.quickCatChip, { backgroundColor: theme.inputBg, borderColor: theme.border, marginRight: 0, paddingHorizontal: 5, paddingVertical: 2 }]}
                        onPress={() => setEditName('')}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 9.5, fontWeight: '800', color: theme.error }}>✕ Clear</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.quickCatChip, { backgroundColor: theme.inputBg, borderColor: theme.border, marginRight: 0, paddingHorizontal: 5, paddingVertical: 2 }]}
                      onPress={() => {
                        if (!editName) return;
                        const titled = editName
                          .split(' ')
                          .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
                          .join(' ');
                        setEditName(titled);
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
                      height: 36,
                      fontSize: 12,
                      fontWeight: '600',
                      backgroundColor: theme.inputBg,
                      borderColor: editName?.trim() ? theme.primary : theme.inputBorder,
                      color: theme.text,
                    },
                  ]}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="e.g. Ruby Heart or Lucky Clover"
                  placeholderTextColor={theme.textMuted}
                />
              </View>

              {/* Model Number & Category */}
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Model Number</Text>
                    <TouchableOpacity
                      onPress={() => setEditModelNo(`MD-${Math.floor(Math.random() * 900 + 100)}`)}
                    >
                      <Text style={{ fontSize: 10, color: theme.gold, fontWeight: '700' }}>⚡ Auto</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
                    value={editModelNo}
                    onChangeText={setEditModelNo}
                    placeholder="MD-001"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Category</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
                    value={editCategory}
                    onChangeText={setEditCategory}
                    placeholder="Custom"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>

              {/* Quick Category Chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 3 }}>
                {COMMON_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.quickCatChip,
                      {
                        backgroundColor: editCategory === cat ? theme.gold : theme.inputBg,
                        borderColor: editCategory === cat ? theme.gold : theme.border,
                        paddingHorizontal: 6,
                        paddingVertical: 2.5,
                      },
                    ]}
                    onPress={() => setEditCategory(cat)}
                  >
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: editCategory === cat ? '#000' : theme.textMuted }}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Price & Stock */}
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Price USD ($)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
                    value={editPrice}
                    onChangeText={setEditPrice}
                    keyboardType="decimal-pad"
                  />
                  <Text style={{ fontSize: 9.5, color: theme.gold, marginTop: 2 }}>
                    ≈ {Math.round((parseFloat(editPrice) || 0) * rate).toLocaleString()} ៛ KHR
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Stock Quantity</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
                    value={editStock}
                    onChangeText={setEditStock}
                    keyboardType="numeric"
                  />
                  {/* Quick stock pills inside modal */}
                  <View style={{ flexDirection: 'row', gap: 3, marginTop: 3 }}>
                    {[-5, 5, 10, 50].map((delta) => (
                      <TouchableOpacity
                        key={delta}
                        style={[styles.modalStockPill, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
                        onPress={() => {
                          const curr = parseInt(editStock, 10) || 0;
                          setEditStock(String(Math.max(0, curr + delta)));
                        }}
                      >
                        <Text style={{ fontSize: 8.5, fontWeight: '800', color: theme.text }}>
                          {delta > 0 ? `+${delta}` : delta}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Active Toggle Switch */}
              <View style={[styles.toggleRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: theme.text }}>
                    {editActive ? '🟢 Active in Storefront' : '⚪ Draft / Hidden'}
                  </Text>
                  <Text style={{ fontSize: 9.5, color: theme.textMuted }}>
                    {editActive ? 'Customers can view and add this charm' : 'Hidden from buyer catalog'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    { backgroundColor: editActive ? theme.primary : '#475569' },
                  ]}
                  onPress={() => setEditActive(editActive ? 0 : 1)}
                >
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>
                    {editActive ? 'ON' : 'OFF'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* PNG Asset URL */}
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>PNG Asset Path / URL</Text>
              <TextInput
                style={[styles.input, { height: 32, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text, fontSize: 10.5 }]}
                value={editImage.length > 55 ? `${editImage.substring(0, 55)}... (Base64 PNG Loaded)` : editImage}
                onChangeText={setEditImage}
              />

              {/* Modal Buttons */}
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalDelBtn, { borderColor: theme.error }]}
                  onPress={() => handleDeleteCharm(editingCharm)}
                >
                  <Text style={{ color: theme.error, fontWeight: '800', fontSize: 11.5 }}>🗑️ Delete</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                    onPress={() => setEditModalVisible(false)}
                  >
                    <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 11.5 }}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalSaveBtn, { backgroundColor: theme.primary }]}
                    onPress={handleSaveEditCharm}
                    disabled={loading}
                  >
                    <Text style={styles.modalSaveBtnText}>{loading ? 'Saving...' : '💾 Save Changes'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ============================================================== */}
      {/* 2. ADD CHARM MODAL                                              */}
      {/* ============================================================== */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>✨ Add New Modular Charm Link</Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                    Upload transparent PNG artwork to publish for customers
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setAddModalVisible(false)} style={styles.modalCloseBtn}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Live Preview Bezel */}
              <View style={[styles.studioPreviewSection, { backgroundColor: '#07090e', borderColor: activeAddFinishObj.border }]}>
                <View
                  style={[
                    styles.studioBezelTile,
                    {
                      backgroundColor: activeAddFinishObj.bg,
                      borderColor: activeAddFinishObj.border,
                    },
                  ]}
                >
                  <ModularCharmLink
                    charm={{
                      id: modelNo,
                      name: name,
                      image: image,
                    }}
                    size="workbench"
                    showHook={false}
                  />
                  <View style={[styles.studioBezelBadge, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                    <Text style={{ color: activeAddFinishObj.dot, fontSize: 8.5, fontWeight: '900' }}>
                      {activeAddFinishObj.label.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Band Finish Preview Switcher */}
                <View style={styles.finishTesterRow}>
                  <Text style={{ fontSize: 9.5, color: theme.textMuted, fontWeight: '700', marginBottom: 3 }}>
                    🎨 Live Band Finish Preview:
                  </Text>
                  <View style={styles.finishTesterPills}>
                    {PREVIEW_FINISHES.map((f) => {
                      const isSel = addPreviewFinish === f.id;
                      return (
                        <TouchableOpacity
                          key={f.id}
                          style={[
                            styles.finishTesterPill,
                            {
                              backgroundColor: isSel ? f.bg : 'rgba(255,255,255,0.05)',
                              borderColor: isSel ? f.border : '#334155',
                            },
                          ]}
                          onPress={() => setAddPreviewFinish(f.id)}
                        >
                          <View style={[styles.finishTesterDot, { backgroundColor: f.dot }]} />
                          <Text style={{ fontSize: 9, color: isSel ? '#ffffff' : '#94a3b8', fontWeight: '700' }}>
                            {f.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Dropzone */}
              <TouchableOpacity
                style={[styles.dropzoneBox, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                onPress={() => handlePickFile(false)}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 16, marginBottom: 2 }}>📁</Text>
                <Text style={[styles.dropzoneTitle, { color: theme.text }]}>
                  Upload PNG File from Computer
                </Text>
                <Text style={{ fontSize: 9.5, color: theme.textMuted }}>
                  Transparent PNG works best with metallic bracelet bands
                </Text>
              </TouchableOpacity>

              {/* Charm Title - Sleek & Perfectly Proportioned */}
              <View style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted, marginBottom: 0, marginTop: 0 }]}>
                    🏷️ Charm Title *
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    {name ? (
                      <TouchableOpacity
                        style={[styles.quickCatChip, { backgroundColor: theme.inputBg, borderColor: theme.border, marginRight: 0, paddingHorizontal: 5, paddingVertical: 2 }]}
                        onPress={() => setName('')}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 9.5, fontWeight: '800', color: theme.error }}>✕ Clear</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.quickCatChip, { backgroundColor: theme.inputBg, borderColor: theme.border, marginRight: 0, paddingHorizontal: 5, paddingVertical: 2 }]}
                      onPress={() => {
                        if (!name) return;
                        const titled = name
                          .split(' ')
                          .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
                          .join(' ');
                        setName(titled);
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
                      height: 36,
                      fontSize: 12,
                      fontWeight: '600',
                      backgroundColor: theme.inputBg,
                      borderColor: name?.trim() ? theme.primary : theme.inputBorder,
                      color: theme.text,
                    },
                  ]}
                  placeholder="e.g. Sparkling Star Italian Charm"
                  placeholderTextColor={theme.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Model Number</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
                    placeholder="MD-001"
                    placeholderTextColor={theme.textMuted}
                    value={modelNo}
                    onChangeText={setModelNo}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Category</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
                    placeholder="Custom"
                    placeholderTextColor={theme.textMuted}
                    value={category}
                    onChangeText={setCategory}
                  />
                </View>
              </View>

              {/* Quick Category Chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 3 }}>
                {COMMON_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.quickCatChip,
                      {
                        backgroundColor: category === cat ? theme.gold : theme.inputBg,
                        borderColor: category === cat ? theme.gold : theme.border,
                        paddingHorizontal: 6,
                        paddingVertical: 2.5,
                      },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: category === cat ? '#000' : theme.textMuted }}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Price USD ($)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
                    placeholder="1.00"
                    placeholderTextColor={theme.textMuted}
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                  />
                  <Text style={{ fontSize: 9.5, color: theme.gold, marginTop: 2 }}>
                    ≈ {Math.round((parseFloat(price) || 0) * rate).toLocaleString()} ៛ KHR
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Initial Stock</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
                    placeholder="50"
                    placeholderTextColor={theme.textMuted}
                    value={stock}
                    onChangeText={setStock}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>PNG Asset Path / URL</Text>
              <TextInput
                style={[styles.input, { height: 32, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text, fontSize: 10.5 }]}
                placeholder="charm_clean.png or image URL"
                placeholderTextColor={theme.textMuted}
                value={image.length > 55 ? `${image.substring(0, 55)}... (Base64 PNG Loaded)` : image}
                onChangeText={setImage}
              />

              {/* Modal Buttons */}
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                  onPress={() => setAddModalVisible(false)}
                >
                  <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 11.5 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, { backgroundColor: theme.primary }]}
                  onPress={handleAddCharm}
                  disabled={loading}
                >
                  <Text style={styles.modalSaveBtnText}>{loading ? 'Saving...' : '✨ Save New Charm'}</Text>
                </TouchableOpacity>
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
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    borderWidth: 1,
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  statBox: {
    width: '48.5%',
    padding: 7,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2,
  },
  toolbarCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 9,
    marginBottom: 10,
    gap: 8,
  },
  searchRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    height: 36,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
    paddingRight: 32,
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 10,
    padding: 4,
  },
  catBarWrapper: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  catScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  catTab: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 6,
  },
  catTabText: {
    fontSize: 11,
    fontWeight: '700',
  },
  viewToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  layoutToggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  layoutToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  layoutToggleBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  layoutToggleBtnText: {
    fontSize: 10,
    fontWeight: '800',
  },
  grid4x4: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    width: '100%',
    justifyContent: 'flex-start',
  },
  charmCard4x4: {
    width: Platform.OS === 'web' ? 'calc(25% - 5px)' : '23.5%',
    borderRadius: 12,
    borderWidth: 1.2,
    padding: 5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 4,
  },
  card4x4TopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
  },
  card4x4ModelBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.8,
  },
  card4x4ModelText: {
    fontSize: 8.5,
    fontWeight: '900',
  },
  card4x4Dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  card4x4PreviewBox: {
    width: '100%',
    height: 56,
    borderRadius: 8,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    overflow: 'hidden',
  },
  card4x4Name: {
    fontSize: 9.5,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
    marginBottom: 3,
  },
  card4x4MetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  card4x4Price: {
    fontSize: 9.5,
    fontWeight: '900',
  },
  card4x4StockBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  card4x4StockText: {
    fontSize: 8,
    fontWeight: '900',
  },
  card4x4QuickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 4,
    borderTopWidth: 0.8,
    gap: 2,
  },
  card4x4MiniBtn: {
    flex: 1,
    height: 22,
    borderRadius: 4,
    borderWidth: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'flex-start',
  },
  emptyBox: {
    width: '100%',
    padding: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  charmCard: {
    borderRadius: 14,
    borderWidth: 1.2,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  charmPreviewBox: {
    width: 76,
    height: 90,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  charmPreviewImg: {
    width: 60,
    height: 68,
  },
  previewBezelLabel: {
    position: 'absolute',
    bottom: 3,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  cardDetails: {
    flex: 1,
  },
  specsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
    marginBottom: 6,
  },
  specChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  modelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  modelText: {
    fontSize: 10,
    fontWeight: '800',
  },
  stockStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  charmName: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  priceTag: {
    fontSize: 13,
    fontWeight: '800',
  },
  categoryTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    flexWrap: 'wrap',
    gap: 10,
  },
  stockControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stockBtn: {
    minWidth: 40,
    height: 32,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionEditBtn: {
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDelBtn: {
    minHeight: 32,
    minWidth: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 10,
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
    padding: 4,
  },
  studioPreviewSection: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  studioBezelTile: {
    width: 72,
    height: 86,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    marginBottom: 4,
  },
  studioCharmImg: {
    width: 56,
    height: 62,
  },
  studioBezelBadge: {
    position: 'absolute',
    bottom: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  finishTesterRow: {
    width: '100%',
    alignItems: 'center',
  },
  finishTesterPills: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  finishTesterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  finishTesterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dropzoneBox: {
    borderRadius: 10,
    borderWidth: 1.2,
    borderStyle: 'dashed',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dropzoneTitle: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 1,
  },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 2,
    marginTop: 5,
  },
  input: {
    height: 35,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 8,
  },
  quickCatChip: {
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 5,
    borderWidth: 1,
    marginRight: 4,
  },
  modalStockPill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modalBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
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
