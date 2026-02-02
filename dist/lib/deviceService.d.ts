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
export declare function updateDeviceValue(params: UpdateDeviceValueParams): Promise<UpdateDeviceValueResult>;
//# sourceMappingURL=deviceService.d.ts.map