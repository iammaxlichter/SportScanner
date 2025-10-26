// src/popup/utils/updateSettings.ts
import { setSettingsPartial } from "../../lib/storage";
export async function updateSettings(patch: Partial<any>) {
    await setSettingsPartial(patch);
}
