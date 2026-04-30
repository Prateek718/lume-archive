// ProductDetailSheet — bottom-sheet modal showing the reasoning behind a
// prescribed product and the Nykaa CTA. Opened by tapping any ProductCard
// embedded in a RoutineStep. Content is scrollable; sheet height caps at
// ~80% of the screen to leave a tappable backdrop for dismissal.

import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Linking,
  Dimensions,
} from 'react-native';
import { ChapterLabel, PrimaryButton, Rule } from '../editorial';
import { Palette } from '../../constants/theme';
import { PRODUCTS } from '../../constants/productConstants';
import { supabase } from '../../lib/supabase';
import {
  addProductToKitFromBuy, productIdFor,
} from '../../services/kitService';
import type { MatchedProduct } from '../../types';

export interface ProductDetailSheetProduct {
  id?:             string | null;                // PRODUCTS catalogue id, if known
  brand:           string;
  name:            string;
  price?:          number | null;
  hero_line?:      string | null;                // may be synthesised or pulled from catalogue
  retailer_urls?:  { nykaa?: string; amazon?: string };
}

interface Props {
  visible:            boolean;
  onClose:            () => void;
  product:            ProductDetailSheetProduct | null;
  clinical_reasoning: string | null;
  stepId?:            string | null;
}

export function ProductDetailSheet({
  visible, onClose, product, clinical_reasoning, stepId,
}: Props) {
  // Resolve hero_line + nykaa from the catalogue if we have an id but the
  // caller didn't supply them. Keeps the call sites simple — the sheet is
  // the only place that cares about PRODUCTS lookup for display data.
  const resolved = useMemo(() => {
    if (!product) return null;
    const catalogue = product.id ? PRODUCTS.find(p => p.id === product.id) : null;
    return {
      id:           product.id ?? catalogue?.id ?? undefined,
      category:     catalogue?.category,
      brand:        product.brand,
      name:         product.name,
      price:        product.price ?? catalogue?.price_inr ?? null,
      price_tier:   catalogue?.price_tier,
      hero_line:    product.hero_line ?? catalogue?.hero_line ?? null,
      actives:      catalogue?.actives,
      nykaa_url:    product.retailer_urls?.nykaa ?? catalogue?.retailer_urls?.nykaa ?? null,
      retailer_urls: product.retailer_urls ?? catalogue?.retailer_urls,
    };
  }, [product]);

  const [inKit, setInKit] = useState(false);
  const [adding, setAdding] = useState(false);

  // Show "Add to my kit" only when we have both a step + product id.
  const canAddToKit = !!stepId && !!resolved?.id;

  // Pre-check: when the sheet opens with a (product, step) pair, check
  // whether this product is already an active kit item for the user. The
  // reset on close keeps the next open clean (different product → recheck).
  useEffect(() => {
    let cancelled = false;
    if (!visible) {
      setInKit(false);
      setAdding(false);
      return;
    }
    if (!canAddToKit || !resolved?.id || !stepId) {
      setInKit(false);
      return;
    }
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) return;
        const { data, error } = await supabase
          .from('user_kit')
          .select('id')
          .eq('user_id', userId)
          .eq('step_id', stepId)
          .eq('product_id', resolved.id)
          .eq('is_active', true)
          .limit(1);
        if (cancelled) return;
        if (error) {
          console.error('[ProductDetailSheet] kit precheck failed', error);
          return;
        }
        if ((data ?? []).length > 0) setInKit(true);
      } catch (err) {
        if (!cancelled) console.error('[ProductDetailSheet] precheck threw', err);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, canAddToKit, resolved?.id, stepId]);

  const screenHeight = Dimensions.get('window').height;
  const maxSheetHeight = screenHeight * 0.8;

  const openNykaa = () => {
    if (resolved?.nykaa_url) Linking.openURL(resolved.nykaa_url);
  };

  const handleAddToKit = async () => {
    if (!canAddToKit || inKit || adding || !resolved?.id || !stepId) return;
    setAdding(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        setAdding(false);
        return;
      }
      const matched: MatchedProduct = {
        id:            resolved.id,
        category:      resolved.category ?? '',
        name:          resolved.name,
        brand:         resolved.brand,
        attributes:    resolved.actives ?? [],
        price_inr:     resolved.price ?? undefined,
        price_tier:    resolved.price_tier,
        actives:       resolved.actives,
        retailer_urls: resolved.retailer_urls,
      };
      // Sanity: if id is a slug not in catalogue, productIdFor still returns it.
      void productIdFor(matched);
      await addProductToKitFromBuy({
        userId,
        product:     matched,
        stepId,
        acquiredVia: 'already_owned',
      });
      setInKit(true);
    } catch (err) {
      console.error('[ProductDetailSheet] add to kit failed', err);
    } finally {
      setAdding(false);
    }
  };

  const addLabel = inKit
    ? 'In your kit ✓'
    : adding
      ? 'Adding…'
      : 'Add to my kit →';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop — tap anywhere outside the sheet to dismiss. */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View
          style={{
            flex:            1,
            backgroundColor: 'rgba(36, 24, 16, 0.45)',
            justifyContent:  'flex-end',
          }}
        >
          {/* Prevents taps inside the sheet from dismissing it. */}
          <TouchableWithoutFeedback>
            <View
              style={{
                backgroundColor:  Palette.bg,
                maxHeight:        maxSheetHeight,
                borderTopLeftRadius:  18,
                borderTopRightRadius: 18,
                paddingBottom:    32,
              }}
            >
              {/* Grab handle */}
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
                <View
                  style={{
                    width:           40,
                    height:          4,
                    borderRadius:    99,
                    backgroundColor: Palette.rule,
                  }}
                />
              </View>

              {/* Close × top-right */}
              <TouchableOpacity
                onPress={onClose}
                style={{
                  position:   'absolute',
                  top:        14,
                  right:      18,
                  padding:    6,
                  zIndex:     1,
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 22, color: Palette.ink3, lineHeight: 22 }}>×</Text>
              </TouchableOpacity>

              <ScrollView
                contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 18 }}
                showsVerticalScrollIndicator={false}
              >
                {resolved && (
                  <>
                    {/* Brand + name + price header */}
                    <View
                      style={{
                        flexDirection:  'row',
                        justifyContent: 'space-between',
                        alignItems:     'flex-start',
                        gap:            14,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontFamily:    'Inter_500Medium',
                            fontSize:      10,
                            letterSpacing: 1.8,
                            textTransform: 'uppercase',
                            color:         Palette.ink3,
                          }}
                        >
                          {resolved.brand}
                        </Text>
                        <Text
                          style={{
                            marginTop:  4,
                            fontFamily: 'CormorantGaramond_500Medium_Italic',
                            fontStyle:  'italic',
                            fontSize:   28,
                            lineHeight: 32,
                            color:      Palette.ink,
                          }}
                        >
                          {resolved.name}
                        </Text>
                      </View>
                      {resolved.price != null && (
                        <Text
                          style={{
                            fontFamily: 'Inter_400Regular',
                            fontSize:   13,
                            color:      Palette.ink2,
                            paddingTop: 14,
                          }}
                        >
                          ₹{resolved.price}
                        </Text>
                      )}
                    </View>

                    <Rule style={{ marginTop: 24 }} />

                    {resolved.hero_line && (
                      <Text
                        style={{
                          marginTop:  20,
                          fontFamily: 'CormorantGaramond_400Regular_Italic',
                          fontStyle:  'italic',
                          fontSize:   15,
                          lineHeight: 23,
                          color:      Palette.ink2,
                        }}
                      >
                        {resolved.hero_line}
                      </Text>
                    )}

                    {clinical_reasoning && (
                      <>
                        <View style={{ height: resolved.hero_line ? 16 : 20 }} />
                        <ChapterLabel>Why this for you</ChapterLabel>
                        <Text
                          style={{
                            marginTop:  10,
                            fontFamily: 'CormorantGaramond_400Regular',
                            fontSize:   13.5,
                            lineHeight: 22,
                            color:      Palette.ink2,
                          }}
                        >
                          {clinical_reasoning}
                        </Text>
                      </>
                    )}

                    {resolved.nykaa_url && (
                      <View style={{ marginTop: 32 }}>
                        <PrimaryButton label="View on Nykaa →" onPress={openNykaa} />
                        {canAddToKit && (
                          <>
                            <View style={{ height: 12 }} />
                            <View style={{ alignItems: 'center' }}>
                              <TouchableOpacity
                                onPress={handleAddToKit}
                                disabled={inKit || adding}
                                activeOpacity={inKit || adding ? 1 : 0.7}
                                style={{ padding: 6 }}
                              >
                                <Text
                                  style={{
                                    fontFamily: 'CormorantGaramond_400Regular_Italic',
                                    fontStyle:  'italic',
                                    fontSize:   16,
                                    color:      inKit ? Palette.ink3 : Palette.ink,
                                  }}
                                >
                                  {addLabel}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
