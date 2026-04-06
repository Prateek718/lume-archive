export interface Salon {
  id:          string;
  name:        string;
  address:     string;
  city:        string;
  latitude:    number;
  longitude:   number;
  rating:      number;
  reviewCount: number;
  services:    string[];
  priceRange:  '₹' | '₹₹' | '₹₹₹' | '₹₹₹₹' | '';
  distance?:   number;   // km, populated at runtime
  openNow?:    boolean | null;
  phone?:      string;   // populated from Place Details call
  photoUrl?:   string;   // first photo from Places API
}

// Mock salons in Bangalore — replaced by live Google Places data when API key is set
export const MOCK_SALONS: Salon[] = [
  {
    id:          's1',
    name:        'Scissors & Scotch Koramangala',
    address:     '80 Feet Road, 4th Block',
    city:        'Bangalore',
    latitude:    12.9352,
    longitude:   77.6245,
    rating:      4.8,
    reviewCount: 512,
    services:    ['Haircut', 'Beard Design', 'Skin Fade'],
    priceRange:  '₹₹',
  },
  {
    id:          's2',
    name:        'Truefitt & Hill Indiranagar',
    address:     '100 Feet Road, Stage 2',
    city:        'Bangalore',
    latitude:    12.9784,
    longitude:   77.6408,
    rating:      4.9,
    reviewCount: 287,
    services:    ['Classic Cut', 'Hot Towel Shave', 'Facial'],
    priceRange:  '₹₹₹',
  },
  {
    id:          's3',
    name:        'Savio John HSR Layout',
    address:     '27th Main, Sector 2',
    city:        'Bangalore',
    latitude:    12.9116,
    longitude:   77.6370,
    rating:      4.7,
    reviewCount: 634,
    services:    ['Haircut', 'Colour', 'Keratin'],
    priceRange:  '₹₹',
  },
  {
    id:          's4',
    name:        'Naturals Salon Jayanagar',
    address:     '11th Main, 4th Block',
    city:        'Bangalore',
    latitude:    12.9258,
    longitude:   77.5825,
    rating:      4.6,
    reviewCount: 921,
    services:    ['Haircut', 'Smoothening', 'Waxing'],
    priceRange:  '₹',
  },
  {
    id:          's5',
    name:        'Enrich Salon Whitefield',
    address:     'Phoenix Marketcity, Whitefield',
    city:        'Bangalore',
    latitude:    12.9969,
    longitude:   77.7101,
    rating:      4.5,
    reviewCount: 408,
    services:    ['Haircut', 'Beard Trim', 'Skin Treatment'],
    priceRange:  '₹₹',
  },
];
