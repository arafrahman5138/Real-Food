export const API_URL = __DEV__
  ? 'http://localhost:8000/api'
  : 'https://api.wholefoodlabs.com/api';

export const APP_NAME = 'WholeFoodLabs';

export const FLAVOR_OPTIONS = [
  { id: 'spicy', label: 'Spicy', icon: 'fire' },
  { id: 'savory', label: 'Savory', icon: 'food-steak' },
  { id: 'sweet', label: 'Sweet', icon: 'candy' },
  { id: 'umami', label: 'Umami', icon: 'noodles' },
  { id: 'mild', label: 'Mild', icon: 'leaf' },
  { id: 'tangy', label: 'Tangy', icon: 'fruit-citrus' },
];

export const DIETARY_OPTIONS = [
  { id: 'none', label: 'No Restrictions' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'gluten-free', label: 'Gluten Free' },
  { id: 'dairy-free', label: 'Dairy Free' },
  { id: 'keto', label: 'Keto' },
  { id: 'paleo', label: 'Paleo' },
  { id: 'whole30', label: 'Whole30' },
];

export const ALLERGY_OPTIONS = [
  { id: 'nuts', label: 'Tree Nuts' },
  { id: 'peanuts', label: 'Peanuts' },
  { id: 'shellfish', label: 'Shellfish' },
  { id: 'soy', label: 'Soy' },
  { id: 'eggs', label: 'Eggs' },
  { id: 'wheat', label: 'Wheat' },
  { id: 'fish', label: 'Fish' },
  { id: 'sesame', label: 'Sesame' },
];

export const CUISINE_OPTIONS = [
  { id: 'indian', label: 'Indian' },
  { id: 'thai', label: 'Thai' },
  { id: 'korean', label: 'Korean' },
  { id: 'mexican', label: 'Mexican' },
  { id: 'ethiopian', label: 'Ethiopian' },
  { id: 'middle_eastern', label: 'Middle Eastern' },
  { id: 'west_african', label: 'West African' },
  { id: 'caribbean', label: 'Caribbean' },
  { id: 'japanese', label: 'Japanese' },
  { id: 'chinese', label: 'Chinese' },
  { id: 'vietnamese', label: 'Vietnamese' },
  { id: 'moroccan', label: 'Moroccan' },
  { id: 'indonesian', label: 'Indonesian' },
  { id: 'peruvian', label: 'Peruvian' },
  { id: 'mediterranean', label: 'Mediterranean' },
  { id: 'turkish', label: 'Turkish' },
  { id: 'american', label: 'American' },
];

export const COOK_TIME_OPTIONS = [
  { id: 'quick', label: 'Quick (< 30 min)' },
  { id: 'medium', label: 'Medium (30-60 min)' },
  { id: 'long', label: 'Long (60+ min)' },
];

export const HEALTH_BENEFIT_OPTIONS = [
  { id: 'gut_health', label: 'Gut Health', icon: 'leaf', color: '#4CAF50' },
  { id: 'anti_inflammatory', label: 'Anti-Inflammatory', icon: 'shield-checkmark', color: '#FF7043' },
  { id: 'heart_health', label: 'Heart Health', icon: 'heart', color: '#EF5350' },
  { id: 'immune_support', label: 'Immune Support', icon: 'shield', color: '#42A5F5' },
  { id: 'brain_health', label: 'Brain Health', icon: 'bulb', color: '#AB47BC' },
  { id: 'bone_health', label: 'Bone & Joint', icon: 'body', color: '#8D6E63' },
  { id: 'muscle_recovery', label: 'Muscle Recovery', icon: 'barbell', color: '#26A69A' },
  { id: 'energy_boost', label: 'Energy Boost', icon: 'flash', color: '#FFA726' },
  { id: 'skin_health', label: 'Skin Health', icon: 'sunny', color: '#EC407A' },
  { id: 'blood_sugar', label: 'Blood Sugar', icon: 'pulse', color: '#5C6BC0' },
  { id: 'hormone_support', label: 'Hormone Support', icon: 'fitness', color: '#66BB6A' },
  { id: 'detox_support', label: 'Detox & Liver', icon: 'water', color: '#29B6F6' },
];

export const XP_VALUES = {
  COMPLETE_MEAL: 50,
  DAILY_STREAK: 100,
  USE_CHATBOT: 25,
  COMPLETE_WEEKLY_PLAN: 500,
  FIRST_MEAL_PLAN: 200,
  FIRST_GROCERY_LIST: 100,
};

export const XP_PER_LEVEL = 1000;
