export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(password: string, hash: string): Promise<boolean>;
export declare function generateToken(userId: string, email: string): string;
export declare function verifyToken(token: string): {
    userId: string;
    email: string;
} | null;
export declare function generateApiKey(): string;
export declare function hashApiKey(key: string): string;
export declare function verifyApiKey(apiKey: string): Promise<{
    userId: string;
    apiKeyId: string;
} | null>;
//# sourceMappingURL=auth.d.ts.map