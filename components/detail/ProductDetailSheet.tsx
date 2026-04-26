// ProductDetailSheet — bottom-sheet modal showing the reasoning behind a
// prescribed product and the Nykaa CTA. Opened by tapping any ProductCard
// embedded in a RoutineStep. Content is scrollable; sheet height caps at
// ~80% of the screen to leave a tappable backdrop for dismissal.

import { useMemo } from 'react';
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
}

export function ProductDetailSheet({ visible, onClose, product, clinical_reasoning }: Props) {
  // Resolve hero_line + nykaa from the catalogue if we have an id but the
  // caller didn't supply them. Keeps the call sites simple — the sheet is
  // the only place that cares about PRODUCTS lookup for display data.
  const resolved = useMemo(() => {
    if (!product) return null;
    const catalogue = product.id ? PRODUCTS.find(p => p.id === product.id) : null;
    return {
      brand:        product.brand,
      name:         product.name,
      price:        product.price ?? catalogue?.price_inr ?? null,
      hero_line:    product.hero_line ?? catalogue?.hero_line ?? null,
      nykaa_url:    product.retailer_urls?.nykaa ?? catalogue?.retailer_urls?.nykaa ?? null,
    };
  }, [product]);

  const screenHeight = Dimensions.get('window').height;
  const maxSheetHeight = screenHeight * 0.8;

  const openNykaa = () => {
    if (resolved?.nykaa_url) Linking.openURL(resolved.nykaa_url);
  };

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
                        <PrimaryButton label="View on Nykaa" onPress={openNykaa} />
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
