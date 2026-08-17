import { openDb } from '../dist/db/index.js';
import { seedDatabase } from './seed.js';

const db = openDb();
seedDatabase(db);

console.log('Database seeded successfully');
db.close();
