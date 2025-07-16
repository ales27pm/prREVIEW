let cachedSettings = null;

/**
 * Load settings from chrome.storage.sync with fallback migration from local storage.
 * @returns {Promise<object>} Resolves to the settings object or an empty object on failure.
 */
export async function loadSettings() {
  if (cachedSettings) return cachedSettings;
  try {
    const syncSettings = await chrome.storage.sync.get();
    if (!syncSettings.githubToken || !syncSettings.openAIApiKey) {
      const localSettings = await chrome.storage.local.get();
      const updates = {};
      if (!syncSettings.githubToken && localSettings.githubToken) {
        updates.githubToken = localSettings.githubToken;
      }
      if (!syncSettings.openAIApiKey && localSettings.openAIApiKey) {
        updates.openAIApiKey = localSettings.openAIApiKey;
      }
      if (Object.keys(updates).length > 0) {
        try {
          await chrome.storage.sync.set(updates);
        } catch (setErr) {
          console.error("Failed to migrate settings to sync storage:", setErr);
        }
        Object.assign(syncSettings, updates);
      }
    }
    cachedSettings = syncSettings;
    return syncSettings;
  } catch (error) {
    console.error("Failed to load settings:", error);
    return {};
  }
}

/**
 * Save settings to chrome.storage.sync and update cache.
 * @param {object} newSettings
 * @returns {Promise<void>}
 */
export async function saveSettings(newSettings) {
  try {
    await chrome.storage.sync.set(newSettings);
    cachedSettings = { ...(cachedSettings || {}), ...newSettings };
  } catch (error) {
    console.error("Failed to save settings:", error);
    throw error;
  }
}
