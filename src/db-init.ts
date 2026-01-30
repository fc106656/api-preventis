// Script d'initialisation automatique de la base de données
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';
import prisma from './lib/prisma';

const execAsync = promisify(exec);

async function initializeDatabase() {
  try {
    console.log('🔍 Checking database connection...');
    
    // Test de connexion
    await prisma.$connect();
    console.log('✅ Database connection successful');
    
    // Vérifier si les tables existent
    // On essaie d'abord de récupérer le nom de la base depuis DATABASE_URL
    let databaseName = 'preventis';
    if (process.env.DATABASE_URL) {
      try {
        const dbUrl = new URL(process.env.DATABASE_URL);
        databaseName = dbUrl.pathname.replace('/', '') || 'preventis';
      } catch (e) {
        // Utiliser le nom par défaut
      }
    }
    
    try {
      const tables = await prisma.$queryRaw<Array<{ [key: string]: string }>>`
        SHOW TABLES
      `;
      
      const tableNames = tables.map(t => Object.values(t)[0]);
      const requiredTables = ['sensors', 'alerts', 'zones', 'alarm_state', 'event_logs'];
      const missingTables = requiredTables.filter(t => !tableNames.includes(t));
      
      if (missingTables.length > 0) {
        console.log(`⚠️  Missing tables: ${missingTables.join(', ')}`);
        console.log('📦 Creating database schema with Prisma...');
        
        // Vérifier que Prisma est disponible
        try {
          await execAsync('npx prisma --version', { cwd: path.join(__dirname, '..') });
        } catch (e) {
          console.error('❌ Prisma CLI not available. Please ensure Prisma is installed.');
          throw new Error('Prisma CLI not available for database initialization');
        }
        
        // Exécuter prisma db push
        const apiPath = path.join(__dirname, '..');
        const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss', {
          cwd: apiPath,
          env: { ...process.env, NODE_ENV: 'production' },
        });
        
        if (stdout) console.log(stdout);
        if (stderr && !stderr.includes('warn') && !stderr.includes('Deprecation')) {
          console.error(stderr);
        }
        
        console.log('✅ Database schema created successfully');
      } else {
        console.log('✅ All required tables exist');
      }
      
      // Vérifier à nouveau après création
      const tablesAfter = await prisma.$queryRaw<Array<{ [key: string]: string }>>`
        SHOW TABLES
      `;
      console.log(`✅ Database ready with ${tablesAfter.length} tables`);
      
      return true;
    } catch (queryError: any) {
      // Si la requête SHOW TABLES échoue, les tables n'existent probablement pas
      if (queryError?.code === 'P2021' || queryError?.message?.includes('does not exist')) {
        console.log('⚠️  Tables do not exist, creating schema...');
        
        // Vérifier que Prisma est disponible
        try {
          await execAsync('npx prisma --version', { cwd: path.join(__dirname, '..') });
        } catch (e) {
          console.error('❌ Prisma CLI not available. Please ensure Prisma is installed.');
          throw new Error('Prisma CLI not available for database initialization');
        }
        
        const apiPath = path.join(__dirname, '..');
        const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss', {
          cwd: apiPath,
          env: { ...process.env, NODE_ENV: 'production' },
        });
        
        if (stdout) console.log(stdout);
        if (stderr && !stderr.includes('warn') && !stderr.includes('Deprecation')) {
          console.error(stderr);
        }
        
        console.log('✅ Database schema created successfully');
        return true;
      }
      throw queryError;
    }
  } catch (error: any) {
    console.error('❌ Database initialization failed:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
    });
    
    // Ne pas bloquer le démarrage si c'est juste une erreur de connexion
    // (la connexion sera testée à nouveau lors des requêtes)
    if (error?.code === 'P1001' || error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      console.warn('⚠️  Database not available, but API will start anyway');
      return false;
    }
    
    // Pour les autres erreurs, on continue quand même (l'API peut démarrer)
    console.warn('⚠️  Continuing API startup despite database initialization error');
    return false;
  }
}

export default initializeDatabase;
