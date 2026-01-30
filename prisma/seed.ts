import { PrismaClient, SensorType, SensorStatus, AlertType, AlertLevel, AlarmMode } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Nettoyer la base de données
  await prisma.eventLog.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.sensor.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.alarmState.deleteMany();

  // Créer les zones
  const zones = await Promise.all([
    prisma.zone.create({
      data: { name: 'Rez-de-chaussée', isArmed: true, status: SensorStatus.ONLINE },
    }),
    prisma.zone.create({
      data: { name: 'Étage', isArmed: true, status: SensorStatus.ONLINE },
    }),
    prisma.zone.create({
      data: { name: 'Cuisine', isArmed: true, status: SensorStatus.WARNING },
    }),
    prisma.zone.create({
      data: { name: 'Garage', isArmed: false, status: SensorStatus.OFFLINE },
    }),
  ]);

  console.log(`✅ Created ${zones.length} zones`);

  // Créer les capteurs
  const sensors = await Promise.all([
    // Capteurs CO2
    prisma.sensor.create({
      data: {
        name: 'Capteur CO2 - Salon',
        type: SensorType.CO2,
        location: 'Salon',
        status: SensorStatus.ONLINE,
        value: 420,
        unit: 'ppm',
        threshold: 1000,
        batteryLevel: 85,
        zoneId: zones[0].id,
      },
    }),
    prisma.sensor.create({
      data: {
        name: 'Capteur CO2 - Cuisine',
        type: SensorType.CO2,
        location: 'Cuisine',
        status: SensorStatus.WARNING,
        value: 850,
        unit: 'ppm',
        threshold: 1000,
        batteryLevel: 72,
        zoneId: zones[2].id,
      },
    }),
    prisma.sensor.create({
      data: {
        name: 'Capteur CO2 - Chambre',
        type: SensorType.CO2,
        location: 'Chambre',
        status: SensorStatus.ONLINE,
        value: 380,
        unit: 'ppm',
        threshold: 1000,
        batteryLevel: 90,
        zoneId: zones[1].id,
      },
    }),
    // Capteurs infrarouges
    prisma.sensor.create({
      data: {
        name: 'Détecteur IR - Entrée',
        type: SensorType.INFRARED,
        location: 'Entrée',
        status: SensorStatus.ONLINE,
        value: 0,
        unit: '',
        threshold: 1,
        batteryLevel: 95,
        zoneId: zones[0].id,
      },
    }),
    prisma.sensor.create({
      data: {
        name: 'Détecteur IR - Couloir',
        type: SensorType.INFRARED,
        location: 'Couloir',
        status: SensorStatus.ONLINE,
        value: 0,
        unit: '',
        threshold: 1,
        batteryLevel: 88,
        zoneId: zones[1].id,
      },
    }),
    prisma.sensor.create({
      data: {
        name: 'Détecteur IR - Garage',
        type: SensorType.INFRARED,
        location: 'Garage',
        status: SensorStatus.OFFLINE,
        value: 0,
        unit: '',
        threshold: 1,
        batteryLevel: 15,
        zoneId: zones[3].id,
      },
    }),
    // Capteur fumée
    prisma.sensor.create({
      data: {
        name: 'Détecteur Fumée - Salon',
        type: SensorType.SMOKE,
        location: 'Salon',
        status: SensorStatus.ONLINE,
        value: 0,
        unit: '%',
        threshold: 5,
        batteryLevel: 78,
        zoneId: zones[0].id,
      },
    }),
    // Capteur température
    prisma.sensor.create({
      data: {
        name: 'Capteur Temp - Cuisine',
        type: SensorType.TEMPERATURE,
        location: 'Cuisine',
        status: SensorStatus.ONLINE,
        value: 22.5,
        unit: '°C',
        threshold: 45,
        batteryLevel: 82,
        zoneId: zones[2].id,
      },
    }),
  ]);

  console.log(`✅ Created ${sensors.length} sensors`);

  // Créer les alertes
  const alerts = await Promise.all([
    prisma.alert.create({
      data: {
        type: AlertType.FIRE,
        level: AlertLevel.WARNING,
        title: 'Niveau CO2 élevé',
        message: 'Le niveau de CO2 dans la cuisine approche le seuil critique.',
        location: 'Cuisine',
        sensorId: sensors[1].id,
        acknowledged: false,
      },
    }),
    prisma.alert.create({
      data: {
        type: AlertType.SYSTEM,
        level: AlertLevel.WARNING,
        title: 'Capteur hors ligne',
        message: 'Le détecteur IR du garage ne répond plus depuis 1 heure.',
        location: 'Garage',
        sensorId: sensors[5].id,
        acknowledged: false,
      },
    }),
    prisma.alert.create({
      data: {
        type: AlertType.INTRUSION,
        level: AlertLevel.INFO,
        title: 'Mouvement détecté',
        message: "Mouvement détecté à l'entrée principale.",
        location: 'Entrée',
        sensorId: sensors[3].id,
        acknowledged: true,
      },
    }),
    prisma.alert.create({
      data: {
        type: AlertType.FIRE,
        level: AlertLevel.CRITICAL,
        title: 'Fumée détectée',
        message: 'Alerte fumée déclenchée - Vérification requise immédiatement.',
        location: 'Salon',
        sensorId: sensors[6].id,
        acknowledged: true,
      },
    }),
  ]);

  console.log(`✅ Created ${alerts.length} alerts`);

  // Créer l'état initial de l'alarme
  await prisma.alarmState.create({
    data: {
      id: 'main',
      isArmed: true,
      mode: AlarmMode.HOME,
      sirenActive: false,
      lastArmedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
    },
  });

  console.log('✅ Created alarm state');

  // Créer quelques événements de log
  await prisma.eventLog.createMany({
    data: [
      {
        type: 'ALARM_MODE_CHANGED',
        message: 'Mode alarme changé: HOME',
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      },
      {
        type: 'ZONE_ARMED',
        message: 'Zone Rez-de-chaussée armée',
        createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
      },
      {
        type: 'ALERT_CREATED',
        message: 'Nouvelle alerte: Mouvement détecté',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ],
  });

  console.log('✅ Created event logs');
  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
