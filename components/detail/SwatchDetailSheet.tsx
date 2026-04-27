// SwatchDetailSheet — bottom-sheet modal opened by tapping a swatch in the
// makeup palette. Shows the color block, category label, descriptive name,
// editorial reasoning, and a "Search Nykaa" deep-link CTA.
//
// Modeled on ProductDetailSheet (same chrome — backdrop, rounded top, grab
// handle, × close) so the two sheets feel like one design system.

import {
  Dimensions,
  Linking,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { ChapterLabel, PrimaryButton, Rule } from '../editorial';
import { Palette } from '../../constants/theme';
import type { MakeupSwatch } from '../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  swatch:  MakeupSwatch | null;
}

export function SwatchDetailSheet({ visible, onClose, swatch }: Props) {
  const screenHeight   = Dimensions.get('window').height;
  const maxSheetHeight = screenHeight * 0.8;

  const openNykaa = () => {
    if (!swatch) return;
    const url = `https://www.nykaa.com/search/result/?q=${encodeURIComponent(swatch.search_query)}`;
    Linking.openURL(url);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View
          style={{
            flex:            1,
            backgroundColor: 'rgba(36, 24, 16, 0.45)',
            justifyContent:  'flex-end',
          }}
        >
          <TouchableWithoutFeedback>
            <View
              style={{
                backgroundColor:      Palette.bg,
                maxHeight:            maxSheetHeight,
                borderTopLeftRadius:  18,
                borderTopRightRadius: 18,
                paddingBottom:        32,
              }}
            >
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

              <TouchableOpacity
                onPress={onClose}
                style={{ position: 'absolute', top: 14, right: 18, padding: 6, zIndex: 1 }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 22, color: Palette.ink3, lineHeight: 22 }}>×</Text>
              </TouchableOpacity>

              <ScrollView
                contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 18 }}
                showsVerticalScrollIndicator={false}
              >
                {swatch && (
                  <>
                    {/* Color block — full width, generous height. */}
                    <View
                      style={{
                        height:          120,
                        backgroundColor: swatch.hex,
                        borderWidth:     1,
                        borderColor:     'rgba(0,0,0,0.06)',
                      }}
                    />

                    <Text
                      style={{
                        marginTop:     20,
                        fontFamily:    'Inter_500Medium',
                        fontSize:      10,
                        letterSpacing: 1.8,
                        textTransform: 'uppercase',
                        color:         Palette.ink3,
                      }}
                    >
                      {swatch.category}
                    </Text>
                    <Text
                      style={{
                        marginTop:  6,
                        fontFamily: 'CormorantGaramond_500Medium_Italic',
                        fontStyle:  'italic',
                        fontSize:   26,
                        lineHeight: 30,
                        color:      Palette.ink,
                      }}
                    >
                      {swatch.name}
                    </Text>

                    <Rule style={{ marginTop: 22 }} />

                    <Text
                      style={{
                        marginTop:  20,
                        fontFamily: 'CormorantGaramond_400Regular',
                        fontSize:   14,
                        lineHeight: 23,
                        color:      Palette.ink2,
                      }}
                    >
                      {swatch.description}
                    </Text>

                    <View style={{ height: 18 }} />
                    <ChapterLabel>Find it</ChapterLabel>
                    <Text
                      style={{
                        marginTop:  8,
                        fontFamily: 'CormorantGaramond_400Regular_Italic',
                        fontStyle:  'italic',
                        fontSize:   13,
                        lineHeight: 20,
                        color:      Palette.ink3,
                      }}
                    >
                      Search Nykaa for &ldquo;{swatch.search_query}&rdquo; to see live shades.
                    </Text>

                    <View style={{ marginTop: 24 }}>
                      <PrimaryButton label="Search Nykaa →" onPress={openNykaa} />
                    </View>
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
