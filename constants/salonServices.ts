export const SALON_SERVICE_GROUPS = {
  hair: ['Haircut', 'Coloring', 'Smoothening', 'Hair spa', 'Keratin'],
  skin: ['Facial', 'Cleanup', 'Threading', 'Waxing'],
  beard: ['Beard trim', 'Beard styling', 'Shave'],
  bridal: ['Bridal makeup', 'Pre-bridal'],
} as const;

export type SalonServiceGroup = keyof typeof SALON_SERVICE_GROUPS;

export const PRICE_RANGE_OPTIONS = [
  { value: 'budget', label: 'Budget', note: 'Haircut under ₹400 · ₹' },
  { value: 'mid', label: 'Mid-range', note: 'Haircut ₹400–1000 · ₹₹' },
  { value: 'premium', label: 'Premium', note: 'Haircut ₹1000–3000 · ₹₹₹' },
  { value: 'luxury', label: 'Luxury', note: 'Haircut ₹3000+ · ₹₹₹₹' },
] as const;

export const BOOKING_INTEREST_OPTIONS = [
  { value: 'yes', label: 'Yes, definitely', note: 'Notify us when bookings launch' },
  { value: 'maybe', label: 'Maybe, tell me later', note: 'No commitment now' },
  { value: 'no', label: 'No, just claim', note: 'Just want to be listed' },
] as const;

// Predefined chips shown on the rating screen.
export const RATING_SERVICE_CHIPS = [
  'Haircut', 'Coloring', 'Hair spa', 'Facial', 'Cleanup',
  'Threading', 'Beard trim', 'Beard styling', 'Pedicure', 'Manicure', 'Other',
] as const;
