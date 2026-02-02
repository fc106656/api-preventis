// Service partagé pour la logique métier des devices
// Utilisé par HTTP et CoAP
import { DeviceType, DeviceStatus, AlertType, AlertLevel } from '@prisma/client';
import prisma from './prisma';

export interface UpdateDeviceValueParams {
  deviceId: string;
  userId: string;
  value: number;
  batteryLevel?: number;
}

export interface UpdateDeviceValueResult {
  success: boolean;
  device?: any;
  error?: string;
}

/**
 * Met à jour la valeur d'un device et crée une alerte si nécessaire
 * Cette fonction est utilisée par HTTP et CoAP
 */
export async function updateDeviceValue(
  params: UpdateDeviceValueParams
): Promise<UpdateDeviceValueResult> {
  try {
    const { deviceId, userId, value, batteryLevel } = params;

    // Vérifier que le device existe et appartient à l'utilisateur
    const existingDevice = await prisma.device.findFirst({
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
    let newStatus: DeviceStatus = DeviceStatus.ONLINE;
    const numValue = parseFloat(String(value));
    
    if (numValue >= existingDevice.threshold) {
      newStatus = DeviceStatus.ALERT;
    } else if (numValue >= existingDevice.threshold * 0.8) {
      newStatus = DeviceStatus.WARNING;
    }

    // Mettre à jour le device
    const device = await prisma.device.update({
      where: { id: deviceId },
      data: {
        value: numValue,
        status: newStatus,
        ...(batteryLevel !== undefined && { batteryLevel: parseInt(String(batteryLevel)) }),
      },
    });

    // Créer une alerte si seuil dépassé
    if (newStatus === DeviceStatus.ALERT && existingDevice.status !== DeviceStatus.ALERT) {
      let alertType: AlertType = AlertType.SYSTEM;
      if (existingDevice.type === DeviceType.SENSOR_INFRARED) {
        alertType = AlertType.INTRUSION;
      } else if (
        existingDevice.type === DeviceType.SENSOR_CO2 ||
        existingDevice.type === DeviceType.SENSOR_SMOKE ||
        existingDevice.type === DeviceType.SENSOR_TEMPERATURE
      ) {
        alertType = AlertType.FIRE;
      }

      await prisma.alert.create({
        data: {
          type: alertType,
          level: AlertLevel.CRITICAL,
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
  } catch (error: any) {
    console.error('Error updating device value:', error);
    return {
      success: false,
      error: error.message || 'Erreur lors de la mise à jour',
    };
  }
}
