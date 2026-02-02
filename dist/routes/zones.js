"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
// GET /api/zones
router.get('/', async (req, res) => {
    try {
        const zones = await prisma_1.default.zone.findMany({
            include: { sensors: true },
            orderBy: { name: 'asc' },
        });
        const zonesWithStats = zones.map((zone) => ({
            ...zone,
            sensorsCount: {
                total: zone.sensors.length,
                online: zone.sensors.filter((s) => s.status === client_1.SensorStatus.ONLINE).length,
                offline: zone.sensors.filter((s) => s.status === client_1.SensorStatus.OFFLINE).length,
                warning: zone.sensors.filter((s) => s.status === client_1.SensorStatus.WARNING || s.status === client_1.SensorStatus.ALERT).length,
            },
        }));
        res.json(zonesWithStats);
    }
    catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Erreur' });
    }
});
// GET /api/zones/:id
router.get('/:id', async (req, res) => {
    try {
        const zone = await prisma_1.default.zone.findUnique({
            where: { id: req.params.id },
            include: { sensors: true },
        });
        if (!zone) {
            return res.status(404).json({ error: 'Zone non trouvée' });
        }
        res.json(zone);
    }
    catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Erreur' });
    }
});
// POST /api/zones
router.post('/', async (req, res) => {
    try {
        const { name, isArmed } = req.body;
        const zone = await prisma_1.default.zone.create({
            data: { name, isArmed: isArmed ?? true },
        });
        res.status(201).json(zone);
    }
    catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Erreur' });
    }
});
// PUT /api/zones/:id
router.put('/:id', async (req, res) => {
    try {
        const { name, status, isArmed } = req.body;
        const zone = await prisma_1.default.zone.update({
            where: { id: req.params.id },
            data: {
                ...(name && { name }),
                ...(status && { status: status }),
                ...(isArmed !== undefined && { isArmed }),
            },
        });
        res.json(zone);
    }
    catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Erreur' });
    }
});
// PUT /api/zones/:id/arm
router.put('/:id/arm', async (req, res) => {
    try {
        const { isArmed } = req.body;
        const zone = await prisma_1.default.zone.update({
            where: { id: req.params.id },
            data: { isArmed },
        });
        res.json(zone);
    }
    catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Erreur' });
    }
});
// DELETE /api/zones/:id
router.delete('/:id', async (req, res) => {
    try {
        await prisma_1.default.sensor.updateMany({
            where: { zoneId: req.params.id },
            data: { zoneId: null },
        });
        await prisma_1.default.zone.delete({ where: { id: req.params.id } });
        res.json({ message: 'Zone supprimée' });
    }
    catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Erreur' });
    }
});
exports.default = router;
//# sourceMappingURL=zones.js.map