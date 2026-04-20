import React from 'react';
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

interface ProductPickerSheetProps {
  visible:      boolean;
  onClose:      () => void;
  stepName:     string;
  categoryName: string;
  reason:       string;
  products:     MatchedProduct[];
  nykaaUrl?:    (product: MatchedProduct) => string;
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

export default function ProductPickerSheet({
  visible,
  onClose,
  stepName,
  categoryName,
  reason,
  products,
  nykaaUrl,
}: ProductPickerSheetProps) {
  const getUrl = nykaaUrl ?? defaultNykaaUrl;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Overlay — tap outside to close */}
      <TouchableOpacity
        style={s.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Sheet — prevent overlay tap propagating through the sheet */}
        <TouchableOpacity
          style={s.sheet}
          activeOpacity={1}
          onPress={() => { /* absorb tap */ }}
        >
          {/* Handle bar */}
          <View style={s.handle} />

          {/* Title */}
          <Text style={s.title}>
            {stepName} · {
              CATEGORY_LABELS[categoryName]
              ?? categoryName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            }
          </Text>

          {/* Reason */}
          <Text style={s.reason}>{reason}</Text>

          {/* Divider */}
          <View style={s.divider} />

          {/* Product list */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {products.map((product, index) => {
              const featured = product.is_featured === true;
              return (
                <View
                  key={`${product.name}-${index}`}
                  style={featured ? s.cardFeatured : s.card}
                >
                  {featured && (
                    <View style={s.featuredBadge}>
                      <Text style={s.featuredBadgeText}>Featured</Text>
                    </View>
                  )}
                  <View style={s.cardRow}>
                    <View style={s.cardLeft}>
                      <Text style={s.productName} numberOfLines={1}>
                        {product.name}
                      </Text>
                      <Text style={s.productBrand} numberOfLines={1}>
                        {product.brand}
                      </Text>
                      <Text style={s.productWhy} numberOfLines={2}>
                        {product.why_good}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={s.buyBtn}
                      onPress={() => Linking.openURL(getUrl(product))}
                      activeOpacity={0.75}
                    >
                      <Text style={s.buyBtnText}>Buy →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {/* Close button */}
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
    backgroundColor: 'rgba(44, 36, 32, 0.5)',
    justifyContent:  'flex-end',
  },

  sheet: {
    backgroundColor:     Colors.card,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    padding:             20,
    paddingBottom:       36,
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

  card: {
    backgroundColor: Colors.card,
    borderWidth:     1,
    borderColor:     Colors.border,
    borderRadius:    10,
    padding:         12,
    marginBottom:    8,
  },

  cardFeatured: {
    backgroundColor: '#FEF6F2',
    borderWidth:     1.5,
    borderColor:     Colors.accent,
    borderRadius:    10,
    padding:         12,
    marginBottom:    8,
  },

  featuredBadge: {
    backgroundColor: Colors.accent,
    borderRadius:    4,
    paddingVertical:   2,
    paddingHorizontal: 6,
    alignSelf:       'flex-start',
    marginBottom:    6,
  },

  featuredBadgeText: {
    fontSize:    9,
    color:       '#FFFFFF',
    fontWeight:  '600',
  },

  cardRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
  },

  cardLeft: {
    flex:        1,
    marginRight: 12,
  },

  productName: {
    fontSize:     12,
    color:        Colors.text,
    fontWeight:   '500',
    marginBottom: 2,
  },

  productBrand: {
    fontSize:     10,
    color:        Colors.text2,
    marginBottom: 2,
  },

  productWhy: {
    fontSize:     9,
    color:        Colors.text2,
    lineHeight:   14,
    marginBottom: 4,
  },

  buyBtn: {
    borderWidth:  1,
    borderColor:  Colors.accent,
    borderRadius: 6,
    paddingVertical:   4,
    paddingHorizontal: 8,
    alignSelf:    'flex-start',
  },

  buyBtnText: {
    fontSize: 10,
    color:    Colors.accent,
  },

  closeBtn: {
    marginTop: 8,
  },

  closeBtnText: {
    fontSize:   13,
    color:      Colors.text2,
    textAlign:  'center',
  },
});
