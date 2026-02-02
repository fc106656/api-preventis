"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
// GET /api/stats
router.get('/', async (req, res) => {
    try {
        const sensors = await prisma_1.default.sensor.findMany();
        const sensorStats = {
            total: sensors.length,
            online: sensors.filter((s) => s.status === client_1.SensorStatus.ONLINE).length,
            offline: sensors.filter((s) => s.status === client_1.SensorStatus.OFFLINE).length,
            warning: sensors.filter((s) => s.status === client_1.SensorStatus.WARNING).length,
            alert: sensors.filter((s) => s.status === client_1.SensorStatus.ALERT).length,
        };
        const alerts = await prisma_1.default.alert.findMany();
        const alertStats = {
            total: alerts.length,
            active: alerts.filter((a) => !a.acknowledged).length,
            acknowledged: alerts.filter((a) => a.acknowledged).length,
            byType: {
                fire: alerts.filter((a) => a.type === client_1.AlertType.FIRE).length,
                intrusion: alerts.filter((a) => a.type === client_1.AlertType.INTRUSION).length,
                system: alerts.filter((a) => a.type === client_1.AlertType.SYSTEM).length,
            },
        };
        const zones = await prisma_1.default.zone.findMany();
        const zoneStats = {
            total: zones.length,
            armed: zones.filter((z) => z.isArmed).length,
            disarmed: zones.filter((z) => !z.isArmed).length,
        };
        const alarmState = await prisma_1.default.alarmState.findUnique({
            where: { id: 'main' },
        });
        const lastIncident = await prisma_1.default.alert.findFirst({
            where: { level: client_1.AlertLevel.CRITICAL },
            orderBy: { createdAt: 'desc' },
        });
        res.json({
            sensors: sensorStats,
            alerts: alertStats,
            zones: zoneStats,
            alarm: alarmState,
            lastIncident: lastIncident?.createdAt || null,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Erreur' });
    }
});
// GET /api/stats/history
router.get('/history', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const limit = parseInt(req.query.limit) || 100;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const events = await prisma_1.default.eventLog.findMany({
            where: { createdAt: { gte: startDate } },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        res.json(events);
    }
    catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Erreur' });
    }
});
exports.default = router;
//# sourceMappingURL=stats.js.map