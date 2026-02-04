"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDeviceValue = updateDeviceValue;
// Service partagé pour la logique métier des devices
// Utilisé par HTTP et CoAP
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("./prisma"));
/**
 * Met à jour la valeur d'un device et crée une alerte si nécessaire
 * Cette fonction est utilisée par HTTP et CoAP
 */
async function updateDeviceValue(params) {
    try {
        const { deviceId, userId, value, batteryLevel } = params;
        // Vérifier que le device existe et appartient à l'utilisateur
        const existingDevice = await prisma_1.default.device.findFirst({
            where: {
                id: deviceId,
                userId: userId,
            },
        });
        if (!existingDevice) {
            return {
                success: false,
                error: 'Device non trouvé',
            };
        }
        // Déterminer le statut basé sur la valeur
        let newStatus = client_1.DeviceStatus.ONLINE;
        const numValue = parseFloat(String(value));
        if (numValue >= existingDevice.threshold) {
            newStatus = client_1.DeviceStatus.ALERT;
        }
        else if (numValue >= existingDevice.threshold * 0.8) {
            newStatus = client_1.DeviceStatus.WARNING;
        }
        // Mettre à jour le device
        const device = await prisma_1.default.device.update({
            where: { id: deviceId },
            data: {
                value: numValue,
                status: newStatus,
                ...(batteryLevel !== undefined && { batteryLevel: parseInt(String(batteryLevel)) }),
            },
        });
        // Enregistrer dans l'historique
        await prisma_1.default.deviceValueHistory.create({
            data: {
                deviceId: deviceId,
                value: numValue,
                status: newStatus,
                ...(batteryLevel !== undefined && { batteryLevel: parseInt(String(batteryLevel)) }),
            },
        });
        // Créer une alerte si seuil dépassé
        if (newStatus === client_1.DeviceStatus.ALERT && existingDevice.status !== client_1.DeviceStatus.ALERT) {
            let alertType = client_1.AlertType.SYSTEM;
            if (existingDevice.type === client_1.DeviceType.SENSOR_INFRARED) {
                alertType = client_1.AlertType.INTRUSION;
            }
            else if (existingDevice.type === client_1.DeviceType.SENSOR_CO2 ||
                existingDevice.type === client_1.DeviceType.SENSOR_SMOKE ||
                existingDevice.type === client_1.DeviceType.SENSOR_TEMPERATURE) {
                alertType = client_1.AlertType.FIRE;
            }
            await prisma_1.default.alert.create({
                data: {
                    type: alertType,
                    level: client_1.AlertLevel.CRITICAL,
                    title: `Alerte ${existingDevice.type} - ${existingDevice.name}`,
                    message: `Seuil dépassé: ${numValue} ${existingDevice.unit}`,
                    location: existingDevice.location,
                    deviceId: deviceId,
                    userId: userId,
                },
            });
        }
        return {
            success: true,
            device,
        };
    }
    catch (error) {
        console.error('Error updating device value:', error);
        return {
            success: false,
            error: error.message || 'Erreur lors de la mise à jour',
        };
    }
}
//# sourceMappingURL=deviceService.js.map