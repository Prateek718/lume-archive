import { TouchableOpacity, View, Text } from 'react-native';
import { Palette } from '../../constants/theme';

export interface ProductCardProps {
  brand:   string;
  name:    string;
  price?:  number | null;
  onTap?:  () => void;
}

export function ProductCard({ brand, name, price, onTap }: ProductCardProps) {
  const Container: React.ElementType = onTap ? TouchableOpacity : View;
  const extraProps = onTap ? { activeOpacity: 0.8, onPress: onTap } : {};
  return (
    <Container
      {...extraProps}
      style={{
        marginTop:         12,
        paddingVertical:   10,
        paddingHorizontal: 12,
        backgroundColor:   Palette.bgElev,
        borderLeftWidth:   2,
        borderLeftColor:   Palette.accent,
        flexDirection:     'row',
        justifyContent:    'space-between',
        alignItems:        'center',
      }}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text
          style={{
            fontFamily:     'Inter_500Medium',
            fontSize:       10,
            letterSpacing:  1.5,
            color:          Palette.ink3,
            textTransform:  'uppercase',
          }}
        >
          {brand}
        </Text>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_400Regular_Italic',
            fontStyle:  'italic',
            fontSize:   14,
            color:      Palette.ink,
            marginTop:  2,
            lineHeight: 18,
          }}
        >
          {name}
        </Text>
      </View>
      {price != null && (
        <Text
          style={{
            fontFamily: 'Inter_400Regular',
            fontSize:   11,
            color:      Palette.ink3,
          }}
        >
          ₹{price}
        </Text>
      )}
    </Container>
  );
}
