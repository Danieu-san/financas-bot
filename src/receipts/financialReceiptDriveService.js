const { Readable } = require('node:stream');
const { google } = require('googleapis');

const { getOAuthConnection, getSharedSpreadsheetMembership } = require('../services/oauthTokenStore');

const FOLDER_NAME = 'FinancasBot - Comprovantes';

function buildDriveClient(userId, injected) {
    if (injected) return injected;
    const membership = getSharedSpreadsheetMembership(userId);
    const ownerUserId = String(membership?.owner_user_id || userId || '').trim();
    const connection = getOAuthConnection(ownerUserId, { includeTokens: true });
    const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
    const redirectUri = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
    if (!ownerUserId || !connection?.tokens || !clientId || !clientSecret) throw new Error('RECEIPT_DRIVE_NOT_CONNECTED');
    const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri || undefined);
    auth.setCredentials(connection.tokens);
    return google.drive({ version: 'v3', auth });
}

async function ensureReceiptFolder(drive) {
    const escaped = FOLDER_NAME.replace(/'/g, "\\'");
    const listed = await drive.files.list({
        q: `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        spaces: 'drive', fields: 'files(id,name)', pageSize: 10
    });
    const existing = listed?.data?.files?.[0]?.id;
    if (existing) return existing;
    const created = await drive.files.create({
        requestBody: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id'
    });
    if (!created?.data?.id) throw new Error('RECEIPT_DRIVE_FOLDER_FAILED');
    return created.data.id;
}

async function uploadFinancialReceipt({ userId, buffer, mimeType, fileName, driveClient } = {}) {
    if (!userId || !Buffer.isBuffer(buffer) || !buffer.length) throw new Error('RECEIPT_UPLOAD_INVALID');
    const drive = buildDriveClient(userId, driveClient);
    const folderId = await ensureReceiptFolder(drive);
    const created = await drive.files.create({
        requestBody: { name: fileName, parents: [folderId] },
        media: { mimeType, body: Readable.from(buffer) },
        fields: 'id,name,mimeType,parents'
    });
    if (!created?.data?.id) throw new Error('RECEIPT_DRIVE_UPLOAD_FAILED');
    return { driveFileId: created.data.id, permissionScope: 'private_owner_drive' };
}

async function downloadFinancialReceipt({ userId, driveFileId, driveClient } = {}) {
    const drive = buildDriveClient(userId, driveClient);
    const response = await drive.files.get({ fileId: driveFileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
}

async function deleteFinancialReceipt({ userId, driveFileId, driveClient } = {}) {
    const drive = buildDriveClient(userId, driveClient);
    try {
        await drive.files.delete({ fileId: driveFileId });
        return true;
    } catch (error) {
        if (error?.code === 404 || error?.response?.status === 404) return false;
        throw error;
    }
}

module.exports = { deleteFinancialReceipt, downloadFinancialReceipt, uploadFinancialReceipt, __test__: { FOLDER_NAME, buildDriveClient, ensureReceiptFolder } };
