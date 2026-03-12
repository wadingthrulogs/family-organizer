const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  const userId = 1;

  const inventoryItems = [
    { name: 'Ground Beef', category: 'Meat', quantity: 1.5, unit: 'lbs', lowStockThreshold: 1 },
    { name: 'Chicken Breast', category: 'Meat', quantity: 2, unit: 'lbs', lowStockThreshold: 1 },
    { name: 'Pasta', category: 'Dry Goods', quantity: 3, unit: 'boxes', lowStockThreshold: 1 },
    { name: 'Tomato Sauce', category: 'Canned Goods', quantity: 4, unit: 'cans', lowStockThreshold: 2 },
    { name: 'Olive Oil', category: 'Oils', quantity: 1, unit: 'bottle', lowStockThreshold: 1 },
    { name: 'Garlic', category: 'Produce', quantity: 6, unit: 'cloves', lowStockThreshold: 3 },
    { name: 'Onion', category: 'Produce', quantity: 3, unit: 'whole', lowStockThreshold: 2 },
    { name: 'Bell Pepper', category: 'Produce', quantity: 2, unit: 'whole', lowStockThreshold: 1 },
    { name: 'Eggs', category: 'Dairy', quantity: 8, unit: 'whole', lowStockThreshold: 4 },
    { name: 'Milk', category: 'Dairy', quantity: 0.5, unit: 'gallon', lowStockThreshold: 0.5 },
    { name: 'Butter', category: 'Dairy', quantity: 2, unit: 'sticks', lowStockThreshold: 1 },
    { name: 'Cheddar Cheese', category: 'Dairy', quantity: 8, unit: 'oz', lowStockThreshold: 4 },
    { name: 'Chicken Broth', category: 'Canned Goods', quantity: 2, unit: 'cans', lowStockThreshold: 1 },
    { name: 'Rice', category: 'Dry Goods', quantity: 5, unit: 'cups', lowStockThreshold: 2 },
    { name: 'Black Beans', category: 'Canned Goods', quantity: 2, unit: 'cans', lowStockThreshold: 1 },
    { name: 'Tortillas', category: 'Bread', quantity: 6, unit: 'whole', lowStockThreshold: 4 },
    { name: 'Sour Cream', category: 'Dairy', quantity: 1, unit: 'cup', lowStockThreshold: 0.5 },
    { name: 'Salsa', category: 'Condiments', quantity: 1, unit: 'jar', lowStockThreshold: 1 },
    { name: 'Cumin', category: 'Spices', quantity: 3, unit: 'tbsp', lowStockThreshold: 1 },
    { name: 'Chili Powder', category: 'Spices', quantity: 2, unit: 'tbsp', lowStockThreshold: 1 },
    { name: 'Bread', category: 'Bread', quantity: 1, unit: 'loaf', lowStockThreshold: 1 },
    { name: 'Lettuce', category: 'Produce', quantity: 1, unit: 'head', lowStockThreshold: 1 },
    { name: 'Tomato', category: 'Produce', quantity: 3, unit: 'whole', lowStockThreshold: 2 },
    { name: 'Lemon', category: 'Produce', quantity: 2, unit: 'whole', lowStockThreshold: 1 },
    { name: 'Parmesan Cheese', category: 'Dairy', quantity: 4, unit: 'oz', lowStockThreshold: 2 },
    { name: 'Heavy Cream', category: 'Dairy', quantity: 1, unit: 'cup', lowStockThreshold: 0.5 },
    { name: 'Breadcrumbs', category: 'Dry Goods', quantity: 1, unit: 'cup', lowStockThreshold: 0.5 },
    { name: 'Dijon Mustard', category: 'Condiments', quantity: 1, unit: 'jar', lowStockThreshold: 1 },
    { name: 'Soy Sauce', category: 'Condiments', quantity: 1, unit: 'bottle', lowStockThreshold: 1 },
    { name: 'Ginger', category: 'Produce', quantity: 1, unit: 'knob', lowStockThreshold: 1 },
  ];

  console.log('Seeding inventory...');
  const created = [];
  for (const item of inventoryItems) {
    const key = item.name.toLowerCase().replace(/\s+/g, '-');
    const inv = await prisma.inventoryItem.upsert({
      where: { pantryItemKey: key },
      update: { quantity: item.quantity },
      create: { ...item, pantryItemKey: key },
    });
    created.push(inv);
  }
  console.log(`Created/updated ${created.length} inventory items`);

  const inv = {};
  for (const i of created) inv[i.name] = i.id;

  const recipes = [
    {
      title: 'Spaghetti Bolognese',
      description: 'Classic Italian meat sauce served over spaghetti.',
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 45,
      ingredients: [
        { name: 'Ground Beef', quantity: 1, unit: 'lbs', inventoryItemId: inv['Ground Beef'] },
        { name: 'Pasta', quantity: 2, unit: 'boxes', inventoryItemId: inv['Pasta'] },
        { name: 'Tomato Sauce', quantity: 2, unit: 'cans', inventoryItemId: inv['Tomato Sauce'] },
        { name: 'Onion', quantity: 1, unit: 'whole', inventoryItemId: inv['Onion'] },
        { name: 'Garlic', quantity: 4, unit: 'cloves', inventoryItemId: inv['Garlic'] },
        { name: 'Olive Oil', quantity: 2, unit: 'tbsp', inventoryItemId: inv['Olive Oil'] },
        { name: 'Parmesan Cheese', quantity: 2, unit: 'oz', inventoryItemId: inv['Parmesan Cheese'] },
      ],
    },
    {
      title: 'Chicken Tacos',
      description: 'Quick and easy chicken tacos with all the fixings.',
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 20,
      ingredients: [
        { name: 'Chicken Breast', quantity: 1.5, unit: 'lbs', inventoryItemId: inv['Chicken Breast'] },
        { name: 'Tortillas', quantity: 8, unit: 'whole', inventoryItemId: inv['Tortillas'] },
        { name: 'Black Beans', quantity: 1, unit: 'cans', inventoryItemId: inv['Black Beans'] },
        { name: 'Cumin', quantity: 1, unit: 'tbsp', inventoryItemId: inv['Cumin'] },
        { name: 'Chili Powder', quantity: 1, unit: 'tbsp', inventoryItemId: inv['Chili Powder'] },
        { name: 'Salsa', quantity: 1, unit: 'jar', inventoryItemId: inv['Salsa'] },
        { name: 'Sour Cream', quantity: 0.5, unit: 'cup', inventoryItemId: inv['Sour Cream'] },
        { name: 'Cheddar Cheese', quantity: 4, unit: 'oz', inventoryItemId: inv['Cheddar Cheese'] },
        { name: 'Lettuce', quantity: 0.5, unit: 'head', inventoryItemId: inv['Lettuce'] },
      ],
    },
    {
      title: 'Chicken Fried Rice',
      description: 'Simple fried rice with chicken and vegetables.',
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 15,
      ingredients: [
        { name: 'Chicken Breast', quantity: 1, unit: 'lbs', inventoryItemId: inv['Chicken Breast'] },
        { name: 'Rice', quantity: 3, unit: 'cups', inventoryItemId: inv['Rice'] },
        { name: 'Eggs', quantity: 3, unit: 'whole', inventoryItemId: inv['Eggs'] },
        { name: 'Soy Sauce', quantity: 3, unit: 'tbsp', inventoryItemId: inv['Soy Sauce'] },
        { name: 'Garlic', quantity: 3, unit: 'cloves', inventoryItemId: inv['Garlic'] },
        { name: 'Ginger', quantity: 1, unit: 'tsp', inventoryItemId: inv['Ginger'] },
        { name: 'Olive Oil', quantity: 2, unit: 'tbsp', inventoryItemId: inv['Olive Oil'] },
        { name: 'Bell Pepper', quantity: 1, unit: 'whole', inventoryItemId: inv['Bell Pepper'] },
        { name: 'Onion', quantity: 1, unit: 'whole', inventoryItemId: inv['Onion'] },
      ],
    },
    {
      title: 'Creamy Chicken Pasta',
      description: 'Indulgent pasta with a creamy garlic parmesan sauce.',
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 25,
      ingredients: [
        { name: 'Chicken Breast', quantity: 1, unit: 'lbs', inventoryItemId: inv['Chicken Breast'] },
        { name: 'Pasta', quantity: 1, unit: 'boxes', inventoryItemId: inv['Pasta'] },
        { name: 'Heavy Cream', quantity: 1, unit: 'cup', inventoryItemId: inv['Heavy Cream'] },
        { name: 'Parmesan Cheese', quantity: 4, unit: 'oz', inventoryItemId: inv['Parmesan Cheese'] },
        { name: 'Garlic', quantity: 4, unit: 'cloves', inventoryItemId: inv['Garlic'] },
        { name: 'Butter', quantity: 2, unit: 'tbsp', inventoryItemId: inv['Butter'] },
        { name: 'Chicken Broth', quantity: 1, unit: 'cans', inventoryItemId: inv['Chicken Broth'] },
      ],
    },
    {
      title: 'Beef Tacos',
      description: 'Classic ground beef tacos with homemade seasoning.',
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 15,
      ingredients: [
        { name: 'Ground Beef', quantity: 1, unit: 'lbs', inventoryItemId: inv['Ground Beef'] },
        { name: 'Tortillas', quantity: 8, unit: 'whole', inventoryItemId: inv['Tortillas'] },
        { name: 'Cumin', quantity: 1, unit: 'tbsp', inventoryItemId: inv['Cumin'] },
        { name: 'Chili Powder', quantity: 1, unit: 'tbsp', inventoryItemId: inv['Chili Powder'] },
        { name: 'Cheddar Cheese', quantity: 4, unit: 'oz', inventoryItemId: inv['Cheddar Cheese'] },
        { name: 'Lettuce', quantity: 0.5, unit: 'head', inventoryItemId: inv['Lettuce'] },
        { name: 'Tomato', quantity: 2, unit: 'whole', inventoryItemId: inv['Tomato'] },
        { name: 'Sour Cream', quantity: 0.5, unit: 'cup', inventoryItemId: inv['Sour Cream'] },
      ],
    },
    {
      title: 'Chicken Rice Bowl',
      description: 'Healthy chicken and rice bowl with peppers and beans.',
      servings: 2,
      prepMinutes: 10,
      cookMinutes: 25,
      ingredients: [
        { name: 'Chicken Breast', quantity: 0.75, unit: 'lbs', inventoryItemId: inv['Chicken Breast'] },
        { name: 'Rice', quantity: 1, unit: 'cups', inventoryItemId: inv['Rice'] },
        { name: 'Black Beans', quantity: 1, unit: 'cans', inventoryItemId: inv['Black Beans'] },
        { name: 'Bell Pepper', quantity: 1, unit: 'whole', inventoryItemId: inv['Bell Pepper'] },
        { name: 'Cumin', quantity: 1, unit: 'tsp', inventoryItemId: inv['Cumin'] },
        { name: 'Olive Oil', quantity: 1, unit: 'tbsp', inventoryItemId: inv['Olive Oil'] },
        { name: 'Salsa', quantity: 0.5, unit: 'cup', inventoryItemId: inv['Salsa'] },
      ],
    },
    {
      title: 'Scrambled Eggs & Toast',
      description: 'Simple and satisfying breakfast for any time of day.',
      servings: 2,
      prepMinutes: 5,
      cookMinutes: 10,
      ingredients: [
        { name: 'Eggs', quantity: 4, unit: 'whole', inventoryItemId: inv['Eggs'] },
        { name: 'Butter', quantity: 1, unit: 'tbsp', inventoryItemId: inv['Butter'] },
        { name: 'Milk', quantity: 0.25, unit: 'cup', inventoryItemId: inv['Milk'] },
        { name: 'Bread', quantity: 4, unit: 'slices', inventoryItemId: inv['Bread'] },
        { name: 'Cheddar Cheese', quantity: 2, unit: 'oz', inventoryItemId: inv['Cheddar Cheese'] },
      ],
    },
    {
      title: 'Chicken Stir Fry',
      description: 'Quick weeknight stir fry with ginger soy glaze.',
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 15,
      ingredients: [
        { name: 'Chicken Breast', quantity: 1.5, unit: 'lbs', inventoryItemId: inv['Chicken Breast'] },
        { name: 'Soy Sauce', quantity: 4, unit: 'tbsp', inventoryItemId: inv['Soy Sauce'] },
        { name: 'Ginger', quantity: 1, unit: 'tsp', inventoryItemId: inv['Ginger'] },
        { name: 'Garlic', quantity: 3, unit: 'cloves', inventoryItemId: inv['Garlic'] },
        { name: 'Bell Pepper', quantity: 1, unit: 'whole', inventoryItemId: inv['Bell Pepper'] },
        { name: 'Olive Oil', quantity: 2, unit: 'tbsp', inventoryItemId: inv['Olive Oil'] },
        { name: 'Rice', quantity: 2, unit: 'cups', inventoryItemId: inv['Rice'] },
        { name: 'Onion', quantity: 1, unit: 'whole', inventoryItemId: inv['Onion'] },
      ],
    },
  ];

  console.log('Seeding recipes...');
  let recipeCount = 0;
  for (const r of recipes) {
    const existing = await prisma.recipe.findFirst({ where: { title: r.title, createdByUserId: userId } });
    if (!existing) {
      const { ingredients, ...rest } = r;
      await prisma.recipe.create({
        data: { ...rest, ingredientsJson: JSON.stringify(ingredients), createdByUserId: userId },
      });
      recipeCount++;
    } else {
      console.log(`  Skipping existing: ${r.title}`);
    }
  }
  console.log(`Created ${recipeCount} new recipes`);
  await prisma.$disconnect();
}

seed().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
