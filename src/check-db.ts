// Script pour vérifier la connexion à la base de données
import prisma from './lib/prisma';

async function checkDatabase() {
  try {
    console.log('🔍 Checking database connection...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ NOT SET');
    
    // Test de connexion
    await prisma.$connect();
    console.log('✅ Database connection successful');
    
    // Test de requête simple
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database query successful');
    
    // Vérifier si les tables existent
    const tables = await prisma.$queryRaw<Array<{ Tables_in_preventis: string }>>`
      SHOW TABLES
    `;
    console.log(`✅ Found ${tables.length} tables:`, tables.map(t => t.Tables_in_preventis));
    
    await prisma.$disconnect();
    return true;
  } catch (error: any) {
    console.error('❌ Database check failed:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
    });
    await prisma.$disconnect();
    return false;
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  checkDatabase()
    .then((success) => {
      process.exit(success ? 0 : 1);
    });
}

export default checkDatabase;
