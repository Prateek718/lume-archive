import { TouchableOpacity, View, Text } from 'react-native';
import { Palette } from '../../constants/theme';
import { ProductCard, ProductCardProps } from './ProductCard';

interface Props {
  num:      string;                  // "01" | "02" | ...
  when:     string;                  // "Morning" | "Night" | "Wash day" | ...
  title:    string;                  // step title or description
  minutes:  string;                  // "30 sec" | "1 min" | ...
  product?: ProductCardProps | null;
  onTap:    () => void;
  last?:    boolean;
}

export function RoutineStep({ num, when, title, minutes, product, onTap, last }: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onTap}
      style={{
        flexDirection:      'row',
        gap:                18,
        paddingVertical:    18,
        borderBottomWidth:  last ? 0 : 1,
        borderBottomColor:  Palette.rule,
        alignItems:         'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily:    'Inter_500Medium',
          fontSize:      10,
          letterSpacing: 1.5,
          color:         Palette.accent,
          paddingTop:    6,
          width:         24,
        }}
      >
        {num}
      </Text>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_500Medium',
            fontSize:   20,
            lineHeight: 24,
            color:      Palette.ink,
          }}
        >
          {title}
        </Text>
        <View
          style={{
            marginTop:     6,
            flexDirection: 'row',
            gap:           10,
            alignItems:    'center',
          }}
        >
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize:   11.5,
              color:      Palette.ink3,
            }}
          >
            {when}
          </Text>
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize:   11.5,
              color:      Palette.ink3,
              opacity:    0.4,
            }}
          >
            ·
          </Text>
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize:   11.5,
              color:      Palette.ink3,
            }}
          >
            {minutes}
          </Text>
        </View>
        {product && (
          <ProductCard
            brand={product.brand}
            name={product.name}
            price={product.price}
          />
        )}
      </View>
      <Text
        style={{
          paddingTop: 8,
          fontFamily: 'CormorantGaramond_400Regular_Italic',
          fontStyle:  'italic',
          fontSize:   13,
          color:      Palette.ink3,
        }}
      >
        →
      </Text>
    </TouchableOpacity>
  );
}
