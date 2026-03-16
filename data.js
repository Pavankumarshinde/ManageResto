// ManageResto – Default Menu Dataset
const DEFAULT_MENU = [
  // Tandoori Starters
  { id: 1, name: "Hara Bhara Kabab", category: "Tandoori Starter", type: "Veg", price: 340, image: null },
  { id: 2, name: "Veg Seekh Kabab", category: "Tandoori Starter", type: "Veg", price: 340, image: null },
  { id: 3, name: "Paneer Tikka", category: "Tandoori Starter", type: "Veg", price: 360, image: null },
  { id: 4, name: "Tandoori Chicken", category: "Tandoori Starter", type: "Non-Veg", price: 320, image: null },
  { id: 5, name: "Chicken Tikka", category: "Tandoori Starter", type: "Non-Veg", price: 460, image: null },
  { id: 6, name: "Mutton Seekh Kabab", category: "Tandoori Starter", type: "Non-Veg", price: 600, image: null },

  // Starters
  { id: 7, name: "French Fries", category: "Starter", type: "Veg", price: 180, image: null },
  { id: 8, name: "Veg Manchurian", category: "Starter", type: "Veg", price: 290, image: null },
  { id: 9, name: "Paneer 65", category: "Starter", type: "Veg", price: 360, image: null },
  { id: 10, name: "Chilli Egg", category: "Starter", type: "Non-Veg", price: 260, image: null },
  { id: 11, name: "Chicken 65", category: "Starter", type: "Non-Veg", price: 420, image: null },
  { id: 12, name: "Chicken Lollipop", category: "Starter", type: "Non-Veg", price: 420, image: null },

  // Soups
  { id: 13, name: "Tomato Soup", category: "Soup", type: "Veg", price: 130, image: null },
  { id: 14, name: "Aroma Special Soup", category: "Soup", type: "Veg", price: 150, image: null },
  { id: 15, name: "Chicken Manchow Soup", category: "Soup", type: "Non-Veg", price: 150, image: null },
  { id: 16, name: "Chicken Lemon Coriander Soup", category: "Soup", type: "Non-Veg", price: 150, image: null },
  { id: 17, name: "Mutton Manchow Soup", category: "Soup", type: "Non-Veg", price: 190, image: null },
  { id: 18, name: "Mix Meat Manchow Soup", category: "Soup", type: "Non-Veg", price: 180, image: null },

  // Biryani
  { id: 19, name: "Veg Dum Biryani", category: "Biryani", type: "Veg", price: 200, image: null },
  { id: 20, name: "Aroma Special Dum Biryani", category: "Biryani", type: "Veg", price: 240, image: null },
  { id: 21, name: "Egg Biryani", category: "Biryani", type: "Non-Veg", price: 200, image: null },
  { id: 22, name: "Chicken Biryani", category: "Biryani", type: "Non-Veg", price: 220, image: null },
  { id: 23, name: "Mutton Biryani", category: "Biryani", type: "Non-Veg", price: 280, image: null },
  { id: 24, name: "Chicken Fry Piece Biryani", category: "Biryani", type: "Non-Veg", price: 280, image: null },

  // Curries
  { id: 25, name: "Dal Tadka", category: "Curry", type: "Veg", price: 260, image: null },
  { id: 26, name: "Paneer Butter Masala", category: "Curry", type: "Veg", price: 380, image: null },
  { id: 27, name: "Kaju Paneer", category: "Curry", type: "Veg", price: 390, image: null },
  { id: 28, name: "Butter Chicken", category: "Curry", type: "Non-Veg", price: 420, image: null },
  { id: 29, name: "Chicken Tikka Masala", category: "Curry", type: "Non-Veg", price: 460, image: null },
  { id: 30, name: "Mutton Rogan Josh", category: "Curry", type: "Non-Veg", price: 580, image: null },

  // Rice & Noodles
  { id: 31, name: "Veg Fried Rice", category: "Rice & Noodles", type: "Veg", price: 200, image: null },
  { id: 32, name: "Veg Soft Noodles", category: "Rice & Noodles", type: "Veg", price: 250, image: null },
  { id: 33, name: "Curd Rice", category: "Rice & Noodles", type: "Veg", price: 230, image: null },
  { id: 34, name: "Chicken Fried Rice", category: "Rice & Noodles", type: "Non-Veg", price: 240, image: null },
  { id: 35, name: "Chicken Schezwan Noodles", category: "Rice & Noodles", type: "Non-Veg", price: 260, image: null },
  { id: 36, name: "Mutton Fried Rice", category: "Rice & Noodles", type: "Non-Veg", price: 330, image: null },

  // Breads
  { id: 37, name: "Butter Roti", category: "Breads", type: "Veg", price: 45, image: null },
  { id: 38, name: "Butter Naan", category: "Breads", type: "Veg", price: 60, image: null },
  { id: 39, name: "Garlic Naan", category: "Breads", type: "Veg", price: 80, image: null },
  { id: 40, name: "Butter Phulka (3 pcs)", category: "Breads", type: "Veg", price: 80, image: null },
  { id: 41, name: "Masala Kulcha", category: "Breads", type: "Veg", price: 100, image: null },
  { id: 42, name: "Laccha Paratha", category: "Breads", type: "Veg", price: 70, image: null },

  // Desserts
  { id: 43, name: "Gulab Jamun", category: "Dessert", type: "Veg", price: 100, image: null },
  { id: 44, name: "Carrot Halwa", category: "Dessert", type: "Veg", price: 130, image: null },
  { id: 45, name: "Kaddu Ka Kheer", category: "Dessert", type: "Veg", price: 100, image: null },
  { id: 46, name: "Fruit Salad with Ice Cream", category: "Dessert", type: "Veg", price: 150, image: null },

  // Beverages
  { id: 47, name: "Virgin Mojito", category: "Beverage", type: "Veg", price: 150, image: null },
  { id: 48, name: "Punjabi Lassi (Sweet)", category: "Beverage", type: "Veg", price: 120, image: null },
];

const CATEGORIES = [
  "Starter",
  "Tandoori Starter",
  "Soup",
  "Biryani",
  "Curry",
  "Rice & Noodles",
  "Breads",
  "Dessert",
  "Beverage",
];

if (typeof module !== 'undefined') {
  module.exports = { DEFAULT_MENU, CATEGORIES };
}