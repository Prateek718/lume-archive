import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ScrollView,
} from 'react-native';
import { Colors } from '../constants/theme';
import type { MatchedProduct } from '../types';
import { addProductToKitFromBuy } from '../services/kitService';
import { getProductNykaaUrl } from '../constants/productConstants';

interface ProductPickerSheetProps {
  visible:      boolean;
  onClose:      () => void;
  stepName:     string;
  categoryName: string;
  reason:       string;
  products:     MatchedProduct[];
  nykaaUrl?:    (product: MatchedProduct) => string;
  // When userId + stepId are both provided, tapping "Buy" also inserts a
  // user_kit row and wires it into today's routine_checkins.
  userId?:      string;
  stepId?:      string;
  onBought?:    (product: MatchedProduct) => void;
}

const defaultNykaaUrl = (product: MatchedProduct): string =>
  `https://www.nykaa.com/search/result/?q=${encodeURIComponent(
    product.name + ' ' + product.brand,
  )}`;

const CATEGORY_LABELS: Record<string, string> = {
  face_cleanser:         'Face cleanser',
  moisturiser:           'Moisturiser',
  spf_sunscreen:         'Sunscreen SPF 50',
  serum_niacinamide:     'Niacinamide serum',
  serum_vitamin_c:       'Vitamin C serum',
  eye_cream:             'Eye cream',
  serum_hyaluronic_acid: 'Hyaluronic acid serum',
  retinol:               'Retinol',
  aha_exfoliant:         'AHA exfoliant',
  beard_wash:            'Beard wash',
  beard_oil:             'Beard oil',
  beard_balm:            'Beard balm',
  kajal_eyeliner:        'Kajal',
  eyebrow_pencil:        'Eyebrow pencil',
  lipstick_nude:         'Lip colour',
  lipstick_berry:        'Lip colour',
  concealer:             'Concealer',
  foundation_fair:       'Foundation',
  foundation_medium:     'Foundation',
  foundation_deep:       'Foundation',
  shampoo:               'Shampoo',
  conditioner:           'Conditioner',
  hair_oil:              'Hair oil',
  hair_serum:            'Hair serum',
  scalp_serum:           'Scalp serum',
  hair_mask:             'Hair mask',
};

// Format ₹ price with thousands separator, no decimals.
function formatPrice(inr?: number): string | null {
  if (typeof inr !== 'number' || !Number.isFinite(inr)) return null;
  return `₹${Math.round(inr).toLocaleString('en-IN')}`;
}

function resolveRationale(p: MatchedProduct): string | null {
  return p.why_this_one ?? p.why_good ?? null;
}

export default function ProductPickerSheet({
  visible,
  onClose,
  stepName,
  categoryName,
  reason,
  products,
  nykaaUrl,
  userId,
  stepId,
  onBought,
}: ProductPickerSheetProps) {
  const [altsExpanded, setAltsExpanded] = useState(false);

  const getUrl = nykaaUrl ?? ((p: MatchedProduct) => getProductNykaaUrl(p) ?? defaultNykaaUrl(p));

  const handleBuy = async (product: MatchedProduct) => {
    if (userId && stepId) {
      try {
        await addProductToKitFromBuy({
          userId,
          product,
          stepId,
          acquiredVia: 'lume_affiliate',
        });
        onBought?.(product);
      } catch (err) {
        console.error('[picker] kit insert failed', err);
      }
    }
    Linking.openURL(getUrl(product));
  };

  const primary      = products[0];
  const alternatives = products.slice(1, 3);

  const renderPrimary = (product: MatchedProduct) => {
    const price = formatPrice(product.price_inr);
    const why   = resolveRationale(product);
    return (
      <View style={s.primaryCard}>
        <View style={s.cardRow}>
          <View style={s.cardLeft}>
            <Text style={s.primaryProductName} numberOfLines={2}>
              {product.name}
            </Text>
            <Text style={s.primaryProductBrand} numberOfLines={1}>
              {product.brand}{price ? ` · ${price}` : ''}
            </Text>
            {why ? (
              <Text style={s.primaryProductWhy} numberOfLines={3}>
                {why}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={s.primaryBuyBtn}
            onPress={() => handleBuy(product)}
            activeOpacity={0.75}
          >
            <Text style={s.primaryBuyBtnText}>Buy →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderAlternative = (product: MatchedProduct, index: number) => {
    const price = formatPrice(product.price_inr);
    const why   = resolveRationale(product);
    return (
      <View key={`${product.id ?? product.name}-${index}`} style={s.altCard}>
        <View style={s.cardRow}>
          <View style={s.cardLeft}>
            <Text style={s.altProductName} numberOfLines={1}>
              {product.name}
            </Text>
            <Text style={s.altProductBrand} numberOfLines={1}>
              {product.brand}{price ? ` · ${price}` : ''}
            </Text>
            {why ? (
              <Text style={s.altProductWhy} numberOfLines={2}>
                {why}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={s.altBuyBtn}
            onPress={() => handleBuy(product)}
            activeOpacity={0.75}
          >
            <Text style={s.altBuyBtnText}>Buy →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={s.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={s.sheet}
          activeOpacity={1}
          onPress={() => { /* absorb tap */ }}
        >
          <View style={s.handle} />

          <Text style={s.title}>
            {stepName} · {
              CATEGORY_LABELS[categoryName]
              ?? categoryName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            }
          </Text>

          <Text style={s.reason}>{reason}</Text>

          <View style={s.divider} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {primary ? renderPrimary(primary) : (
              <Text style={s.emptyText}>No matching products yet.</Text>
            )}

            {alternatives.length > 0 && (
              <>
                <TouchableOpacity
                  style={s.altChip}
                  onPress={() => setAltsExpanded(prev => !prev)}
                  activeOpacity={0.75}
                >
                  <Text style={s.altChipText}>
                    {altsExpanded
                      ? `Hide alternatives`
                      : `See ${alternatives.length} alternative${alternatives.length === 1 ? '' : 's'}`}
                  </Text>
                  <Text style={s.altChipChevron}>{altsExpanded ? '∧' : '∨'}</Text>
                </TouchableOpacity>

                {altsExpanded && alternatives.map(renderAlternative)}
              </>
            )}

            <TouchableOpacity
              style={s.closeBtn}
              onPress={onClose}
              activeOpacity={0.75}
            >
              <Text style={s.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: Colors.overlaySheet,
    justifyContent:  'flex-end',
  },

  sheet: {
    backgroundColor:      Colors.card,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    padding:              20,
    paddingBottom:        36,
  },

  handle: {
    width:           32,
    height:          3,
    backgroundColor: Colors.border,
    borderRadius:    2,
    alignSelf:       'center',
    marginBottom:    16,
  },

  title: {
    fontFamily:   'Georgia',
    fontSize:     16,
    color:        Colors.text,
    marginBottom: 4,
  },

  reason: {
    fontSize:     12,
    color:        Colors.text2,
    marginBottom: 16,
  },

  divider: {
    height:          1,
    backgroundColor: Colors.border,
    marginBottom:    14,
  },

  // Primary card — larger, highlighted.
  primaryCard: {
    backgroundColor:   Colors.dangerBg,
    borderWidth:       1.5,
    borderColor:       Colors.accent,
    borderRadius:      12,
    padding:           14,
    marginBottom:      12,
  },

  primaryProductName: {
    fontSize:     14,
    color:        Colors.text,
    fontWeight:   '600',
    marginBottom: 3,
  },

  primaryProductBrand: {
    fontSize:     11,
    color:        Colors.text2,
    marginBottom: 6,
  },

  primaryProductWhy: {
    fontSize:     11,
    color:        Colors.text2,
    lineHeight:   16,
  },

  primaryBuyBtn: {
    borderWidth:       1,
    borderColor:       Colors.accent,
    backgroundColor:   Colors.accent,
    borderRadius:      8,
    paddingVertical:   6,
    paddingHorizontal: 12,
    alignSelf:         'flex-start',
  },

  primaryBuyBtnText: {
    fontSize:   11,
    color:      Colors.textOnAccent,
    fontWeight: '600',
  },

  // Expandable chip
  altChip: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    backgroundColor:  Colors.card,
    borderWidth:      1,
    borderColor:      Colors.border,
    borderRadius:     8,
    paddingVertical:  8,
    paddingHorizontal: 12,
    marginBottom:     8,
  },

  altChipText: {
    fontSize:   11,
    color:      Colors.text2,
    fontWeight: '500',
  },

  altChipChevron: {
    fontSize: 11,
    color:    Colors.text2,
  },

  // Alternative card — smaller, same shape.
  altCard: {
    backgroundColor: Colors.card,
    borderWidth:     1,
    borderColor:     Colors.border,
    borderRadius:    10,
    padding:         10,
    marginBottom:    6,
  },

  altProductName: {
    fontSize:     12,
    color:        Colors.text,
    fontWeight:   '500',
    marginBottom: 2,
  },

  altProductBrand: {
    fontSize:     10,
    color:        Colors.text2,
    marginBottom: 4,
  },

  altProductWhy: {
    fontSize:   9,
    color:      Colors.text2,
    lineHeight: 14,
  },

  // Shared row layout
  cardRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
  },

  cardLeft: {
    flex:        1,
    marginRight: 12,
  },

  altBuyBtn: {
    borderWidth:       1,
    borderColor:       Colors.accent,
    borderRadius:      6,
    paddingVertical:   4,
    paddingHorizontal: 8,
    alignSelf:         'flex-start',
  },

  altBuyBtnText: {
    fontSize: 10,
    color:    Colors.accent,
  },

  emptyText: {
    fontSize:    12,
    color:       Colors.text2,
    textAlign:   'center',
    paddingVertical: 20,
  },

  closeBtn: {
    marginTop: 12,
  },

  closeBtnText: {
    fontSize:  13,
    color:     Colors.text2,
    textAlign: 'center',
  },
});
