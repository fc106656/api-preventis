"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
// GET /api/sensors - Récupérer tous les capteurs
router.get('/', async (req, res) => {
    try {
        const type = req.query.type;
        const status = req.query.status;
        const zoneId = req.query.zoneId;
        const sensors = await prisma_1.default.sensor.findMany({
            where: {
                ...(type && { type }),
                ...(status && { status }),
                ...(zoneId && { zoneId }),
            },
            include: { zone: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(sensors);
    }
    catch (error) {
        console.error('Error fetching sensors:', error);
        console.error('Error details:', {
            message: error?.message,
            code: error?.code,
            meta: error?.meta,
        });
        // Erreur spécifique si les tables n'existent pas
        if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
            return res.status(503).json({
                error: 'Les tables de la base de données n\'existent pas encore',
                hint: 'Exécutez: npx prisma db push dans le conteneur de l\'API',
                code: error?.code,
            });
        }
        res.status(500).json({
            error: 'Erreur lors de la récupération des capteurs',
            details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
            code: error?.code,
        });
    }
});
// GET /api/sensors/:id - Récupérer un capteur par ID
router.get('/:id', async (req, res) => {
    try {
        const sensor = await prisma_1.default.sensor.findUnique({
            where: { id: req.params.id },
            include: {
                zone: true,
                alerts: { orderBy: { createdAt: 'desc' }, take: 10 },
            },
        });
        if (!sensor) {
            return res.status(404).json({ error: 'Capteur non trouvé' });
        }
        res.json(sensor);
    }
    catch (error) {
        console.error('Error fetching sensor:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération du capteur' });
    }
});
// POST /api/sensors - Créer un nouveau capteur
router.post('/', async (req, res) => {
    try {
        const { name, type, location, threshold, unit, batteryLevel, zoneId } = req.body;
        const sensor = await prisma_1.default.sensor.create({
            data: {
                name,
                type: type,
                location,
                threshold: parseFloat(threshold),
                unit: unit || '',
                batteryLevel: batteryLevel ? parseInt(batteryLevel) : null,
                zoneId: zoneId || null,
            },
        });
        res.status(201).json(sensor);
    }
    catch (error) {
        console.error('Error creating sensor:', error);
        res.status(500).json({ error: 'Erreur lors de la création du capteur' });
    }
});
// PUT /api/sensors/:id - Mettre à jour un capteur
router.put('/:id', async (req, res) => {
    try {
        const { name, type, location, status, value, threshold, unit, batteryLevel, zoneId } = req.body;
        const sensor = await prisma_1.default.sensor.update({
            where: { id: req.params.id },
            data: {
                ...(name && { name }),
                ...(type && { type: type }),
                ...(location && { location }),
                ...(status && { status: status }),
                ...(value !== undefined && { value: parseFloat(value) }),
                ...(threshold && { threshold: parseFloat(threshold) }),
                ...(unit && { unit }),
                ...(batteryLevel !== undefined && { batteryLevel: parseInt(batteryLevel) }),
                ...(zoneId !== undefined && { zoneId: zoneId || null }),
            },
        });
        res.json(sensor);
    }
    catch (error) {
        console.error('Error updating sensor:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour du capteur' });
    }
});
// PUT /api/sensors/:id/value - Mettre à jour la valeur d'un capteur (IoT)
router.put('/:id/value', async (req, res) => {
    try {
        const { value, batteryLevel } = req.body;
        const id = req.params.id;
        const existingSensor = await prisma_1.default.sensor.findUnique({ where: { id } });
        if (!existingSensor) {
            return res.status(404).json({ error: 'Capteur non trouvé' });
        }
        // Déterminer le statut basé sur la valeur
        let newStatus = client_1.SensorStatus.ONLINE;
        const numValue = parseFloat(value);
        if (numValue >= existingSensor.threshold) {
            newStatus = client_1.SensorStatus.ALERT;
        }
        else if (numValue >= existingSensor.threshold * 0.8) {
            newStatus = client_1.SensorStatus.WARNING;
        }
        const sensor = await prisma_1.default.sensor.update({
            where: { id },
            data: {
                value: numValue,
                status: newStatus,
                ...(batteryLevel !== undefined && { batteryLevel: parseInt(batteryLevel) }),
            },
        });
        // Créer une alerte si seuil dépassé
        if (newStatus === client_1.SensorStatus.ALERT && existingSensor.status !== client_1.SensorStatus.ALERT) {
            await prisma_1.default.alert.create({
                data: {
                    type: existingSensor.type === client_1.SensorType.INFRARED ? client_1.AlertType.INTRUSION : client_1.AlertType.FIRE,
                    level: client_1.AlertLevel.CRITICAL,
                    title: `Alerte ${existingSensor.type} - ${existingSensor.name}`,
                    message: `Seuil dépassé: ${numValue} ${existingSensor.unit}`,
                    location: existingSensor.location,
                    sensorId: id,
                },
            });
        }
        res.json(sensor);
    }
    catch (error) {
        console.error('Error updating sensor value:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
});
// DELETE /api/sensors/:id - Supprimer un capteur
router.delete('/:id', async (req, res) => {
    try {
        await prisma_1.default.sensor.delete({ where: { id: req.params.id } });
        res.json({ message: 'Capteur supprimé avec succès' });
    }
    catch (error) {
        console.error('Error deleting sensor:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
});
exports.default = router;
//# sourceMappingURL=sensors.js.map