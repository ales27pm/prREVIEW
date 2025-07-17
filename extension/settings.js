let cachedSettings = null;

/**
 * Load settings from chrome.storage.local with migration from sync storage for existing users.
 * @returns {Promise<object>} Resolves to the settings object or an empty object on failure.
 */
export async function loadSettings() {
  if (cachedSettings) return cachedSettings;
  try {
    const localSettings = await chrome.storage.local.get();
    const syncSettings = await chrome.storage.sync.get();
    const updates = {};
    if (!localSettings.githubToken && syncSettings.githubToken) {
      updates.githubToken = syncSettings.githubToken;
    }
    if (!localSettings.openAIApiKey && syncSettings.openAIApiKey) {
      updates.openAIApiKey = syncSettings.openAIApiKey;
    }
    if (Object.keys(updates).length > 0) {
      try {
        await chrome.storage.local.set(updates);
      } catch (setErr) {
        console.error("Failed to migrate settings to local storage:", setErr);
      }
      Object.assign(localSettings, updates);
    }
    cachedSettings = localSettings;
    return localSettings;
  } catch (error) {
    console.error("Failed to load settings:", error);
    return {};
  }
}

/**
 * Save settings to chrome.storage.local and update cache.
 * @param {object} newSettings
 * @returns {Promise<void>}
 */
export async function saveSettings(newSettings) {
  try {
    await chrome.storage.local.set(newSettings);
    cachedSettings = { ...(cachedSettings || {}), ...newSettings };
  } catch (error) {
    console.error("Failed to save settings:", error);
    throw error;
  }
}
